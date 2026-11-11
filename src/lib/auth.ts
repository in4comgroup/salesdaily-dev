import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "@/db/drizzle"
import { schema, invitation } from "@/db/schema"
import { and, eq, gt } from "drizzle-orm"
import { sendEmails } from "@/lib/email"
import {
  lastLoginMethod,
  organization,
  admin,
  emailOTP,
} from "better-auth/plugins"
import { otpSignInGate, withFallbackName } from "@/lib/auth-otp-gate"
import { apiKey } from "@better-auth/api-key"
import { nextCookies } from "better-auth/next-js"
import { getActiveOrganization } from "@/server/organizations"
import {
  uniqueUsernameGenerator,
  Config,
  adjectives,
  nouns,
} from "unique-username-generator"

const config: Config = {
  dictionaries: [adjectives, nouns],
  separator: "-",
  length: 30,
  style: "lowerCase",
}

export const auth = betterAuth({
  trustedOrigins: [
    "https://app.truffalo.ai",
    "https://business-os-demo.vercel.app",
    "http://localhost:3000",
    "https://salesdaily-demo.vercel.app",
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated)
    freshAge: 0, // 5 minutes, 0 to disable freshness checks
    // Serve the session from a short-lived signed cookie instead of hitting
    // the DB on every request. Without this, every navigation does a fresh
    // Neon lookup, and a single transient serverless blip makes getSession()
    // return null → the (protected) layout redirects to /sign-in, which reads
    // as a random mid-session logout. The cookie is refreshed from the DB
    // every 5 min (and on sign-in / sign-out), so it stays current.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
    additionalFields: {
      activeOrganizationId: {
        type: "string",
        returned: true,
      },
      activeOrganizationName: {
        type: "string",
        returned: true,
      },
      // NOTE: the org logo is intentionally NOT a session field. Logos are
      // stored as base64 data URLs (often 100KB+), and `cookieCache` serialises
      // every returned session field into the signed session cookie — a large
      // logo blows past the ~16KB HTTP header limit → 431 Request Header Fields
      // Too Large on every authenticated request (and fails on Vercel too). The
      // sidebar loads the logo server-side from the `organization` table instead
      // (see (protected)/layout.tsx + AppSidebar `orgLogo` prop).
      activeOrganizationSlug: {
        type: "string",
        returned: true,
      },
    },
  },
  // Sign-in and sign-up are passwordless: email + a one-time code (emailOTP
  // plugin below). Google / GitHub OAuth and email + password were removed.
  // Existing users with a password or an OAuth account sign in with a code
  // sent to the same email.
  emailVerification: {
    autoSignInAfterVerification: true,
    // Used by the profile page («Отправить письмо для подтверждения») after an
    // admin changes a user's email.
    async sendVerificationEmail({ user, url }) {
      await sendEmails({
        to: user.email,
        subject: "Подтверждение адреса email",
        body: `Перейдите по этой ссылке, чтобы подтвердить email: ${url}`,
      })
    },
  },
  hooks: {
    // Sign-in screen: no code for unknown emails (see auth-otp-gate.ts).
    before: otpSignInGate,
  },
  databaseHooks: {
    user: {
      create: {
        // A code sign-in for a new email creates the user; the sign-up
        // screens always send a name, this is only the fallback.
        before: async (user) => ({ data: withFallbackName(user) }),
        after: async (user) => {
          // Skip default-org creation when the user is signing up in response
          // to an invitation — they'll join the inviter's org via
          // acceptInvitation. Otherwise they'd end up in two orgs.
          const pendingInvites = await db
            .select({ id: invitation.id })
            .from(invitation)
            .where(
              and(
                eq(invitation.email, user.email),
                eq(invitation.status, "pending"),
                gt(invitation.expiresAt, new Date()),
              ),
            )
            .limit(1)
          if (pendingInvites.length > 0) return

          const slug = uniqueUsernameGenerator(config)
          await auth.api.createOrganization({
            body: {
              name: "Моя организация",
              slug: slug,
              logo: "",
              metadata: {},
              userId: user.id,
            },
          })
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const organization = await getActiveOrganization(session.userId)
          return {
            data: {
              ...session,
              activeOrganizationId: organization?.id,
              activeOrganizationName: organization?.name,
              // Logo intentionally omitted — see additionalFields note above.
              activeOrganizationSlug: organization?.slug,
            },
          }
        },
      },
    },
    organization: {
      // Phase 2 bootstrap: every new org gets one source row per
      // `is_default = true` template (currently Files Drop Off + AI
      // Chat). Owners then add Email / GChat / GDrive themselves via
      // the "Add source" picker — those templates are
      // `is_visible_to_orgs = true` but `is_default = false`.
      //
      // Failures here MUST not block org creation — better-auth's
      // hook semantics throw the org-creation flow if the hook errors.
      // We swallow + log so a missing template seed (script not run
      // yet) doesn't lock new users out.
      create: {
        after: async (org: { id: string }) => {
          try {
            const { bootstrapDefaultsForOrg } =
              await import("@/server/templates")
            const result = await bootstrapDefaultsForOrg(org.id)
            console.log(
              `[org-bootstrap] org=${org.id} instantiated=${result.instantiated} alreadyExisted=${result.alreadyExisted}`,
            )
          } catch (err) {
            console.error(
              `[org-bootstrap] failed for org=${org.id}:`,
              err instanceof Error ? err.message : err,
            )
          }
        },
      },
    },
  },
  plugins: [
    lastLoginMethod(),
    nextCookies(),
    emailOTP({
      // Sign-up is on: the first code sign-in of a new email creates the
      // user (name from the sign-up form). The `hooks.before` gate above keeps
      // the sign-in screen from sending codes to unknown emails.
      disableSignUp: false,
      async sendVerificationOTP({ email, otp, type }) {
        const subjectMap = {
          "sign-in": "Ваш код для входа",
          "email-verification": "Подтверждение email",
          "forget-password": "Код для сброса пароля",
          "change-email": "Подтверждение нового email",
        } as const
        await sendEmails({
          to: email,
          subject: subjectMap[type],
          body: `
            <p>Ваш код подтверждения:</p>
            <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${otp}</p>
            <p>Срок действия кода — 5 минут.</p>
          `,
        })
      },
    }),
    organization({
      schema: {
        organization: {
          additionalFields: {
            webUrl: { type: "string", input: true, required: false },
            address: { type: "string", input: true, required: false },
            email: { type: "string", input: true, required: false },
            phone: { type: "string", input: true, required: false },
          },
        },
      },
      async sendInvitationEmail(data) {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
        const inviteLink = `${appUrl}/accept-invitation/${data.id}`
        await sendEmails({
          to: data.email,
          subject: `Вас пригласили присоединиться к ${data.organization.name}`,
          body: `
            <p>Здравствуйте,</p>
            <p><strong>${data.inviter.user.name}</strong> (${data.inviter.user.email}) приглашает вас присоединиться к <strong>${data.organization.name}</strong>.</p>
            <p><a href="${inviteLink}">Нажмите здесь, чтобы принять приглашение</a></p>
            <p>Если у вас ещё нет аккаунта, вы сможете его создать.</p>
          `,
        })
      },
    }),
    admin({
      adminUserIds: ["f4c577O0wsUOkzxTAUeRAHfKNlvLyQeZ"],
    }),
    apiKey(),
  ],
})
