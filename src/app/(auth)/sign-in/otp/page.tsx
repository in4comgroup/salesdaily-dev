import { redirect } from "next/navigation"

// Old address of the code sign-in. Sign-in is now code-only at /sign-in.
export default async function SignInOtp({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const next = typeof params.redirect === "string" ? params.redirect : undefined
  redirect(next ? `/sign-in?redirect=${encodeURIComponent(next)}` : "/sign-in")
}
