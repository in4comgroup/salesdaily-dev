import { createAuthMiddleware } from "better-auth/api"
import { AUTH_INTENT_HEADER } from "./auth-intent"

// Before-hook for better-auth (src/lib/auth.ts). The sign-in screen must not
// create accounts, but emailOTP sends a code to any address (sign-up is on).
// So a code request WITHOUT the sign-up intent header for an unknown email
// returns the same `{ success: true }` and sends nothing. The answer is the
// same either way: the screen does not tell whether an account exists. The
// header is a UX gate, not a security boundary — anyone may register.
//
// How: the request type is rewritten to "email-verification". For an
// unknown email better-auth then answers `{ success: true }` itself and sends
// no code. (Returning a response from this hook does not work: better-auth
// copies the REQUEST headers, incl. Content-Length, onto it, and browsers
// drop the response with ERR_CONTENT_LENGTH_MISMATCH.)
export const otpSignInGate = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/email-otp/send-verification-otp") return
  if (ctx.body?.type !== "sign-in") return
  if (ctx.headers?.get(AUTH_INTENT_HEADER) === "sign-up") return
  const email = String(ctx.body?.email ?? "").trim().toLowerCase()
  if (!email) return
  const existing = await ctx.context.internalAdapter.findUserByEmail(email)
  if (!existing) return { context: { body: { ...ctx.body, type: "email-verification" } } }
})

// A code sign-in for a new email creates the user. The sign-up screens always
// send a name; this is only the fallback (the part of the email before "@").
export function withFallbackName<T extends { name?: string | null; email: string }>(user: T): T {
  if (user.name?.trim()) return user
  return { ...user, name: user.email.split("@")[0] }
}
