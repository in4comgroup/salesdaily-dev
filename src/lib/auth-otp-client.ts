"use client"

import { authClient } from "@/lib/auth-client"
import { AUTH_INTENT_HEADER, type AuthIntent } from "@/lib/auth-intent"

// Passwordless auth helpers shared by /sign-in, /sign-up and the invitation
// page. Every screen uses the same OTP type ("sign-in"); the intent header
// tells the server hook whether a NEW email may get a code (see auth.ts).

export type AuthClientError = { code?: string; message?: string; status?: number } | null

export async function sendLoginCode(email: string, intent: AuthIntent) {
  const { error } = await authClient.emailOtp.sendVerificationOtp({
    email: email.trim().toLowerCase(),
    type: "sign-in",
    fetchOptions: { headers: { [AUTH_INTENT_HEADER]: intent } },
  })
  return { error: error as AuthClientError }
}

// name is used only when the email has no account yet (registration).
export async function verifyLoginCode(email: string, otp: string, name?: string) {
  const { error } = await authClient.signIn.emailOtp({
    email: email.trim().toLowerCase(),
    otp,
    ...(name?.trim() ? { name: name.trim() } : {}),
  })
  return { error: error as AuthClientError }
}

export function authErrorMessage(error: AuthClientError, fallback: string): string {
  if (!error) return fallback
  if (error.status === 429) return "Слишком много запросов. Подождите минуту и попробуйте снова."
  switch (error.code) {
    case "INVALID_OTP":
      return "Неверный код"
    case "OTP_EXPIRED":
      return "Срок действия кода истёк. Запросите новый код."
    case "TOO_MANY_ATTEMPTS":
      return "Слишком много попыток. Запросите новый код."
    case "INVALID_EMAIL":
      return "Введите корректный email"
  }
  return fallback
}

// Only same-site paths: an absolute URL in ?redirect= would be an open redirect.
export function safeRedirect(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback
  return value
}
