// Shared by the server auth hook (src/lib/auth.ts) and the client forms.
// A code request with this header set to "sign-up" may go to an email that
// has no account yet (registration). Without it, unknown emails get no code.
export const AUTH_INTENT_HEADER = "x-auth-intent"
export type AuthIntent = "sign-in" | "sign-up"
