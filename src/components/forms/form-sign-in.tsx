"use client"

import { LoadingButton } from "@/components/blocks/loading-button"
import { OtpCodeStep } from "@/components/forms/otp-code-step"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  authErrorMessage,
  safeRedirect,
  sendLoginCode,
  verifyLoginCode,
} from "@/lib/auth-otp-client"
import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

const emailSchema = z.object({
  email: z.email({ message: "Введите корректный email" }),
})
type EmailValues = z.infer<typeof emailSchema>

// Passwordless sign-in: email → 6-digit code from the email → signed in.
// Unknown emails get no code (server hook in src/lib/auth.ts), and the screen
// says the same thing in both cases, so it does not show who has an account.
export function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // `callbackURL` is the older name of the same parameter (invitation links).
  const redirect = safeRedirect(searchParams.get("redirect") ?? searchParams.get("callbackURL"))

  const [step, setStep] = useState<"email" | "otp">("email")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)

  const form = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  })

  async function onRequestCode({ email }: EmailValues) {
    setError(null)
    const { error } = await sendLoginCode(email, "sign-in")
    if (error) {
      const msg = authErrorMessage(error, error.message || "Не удалось отправить код")
      setError(msg)
      toast.error(msg)
      return
    }
    setEmail(email.trim().toLowerCase())
    setStep("otp")
  }

  async function onVerify(otp: string) {
    const { error } = await verifyLoginCode(email, otp)
    if (error) return error
    toast.success("Вход выполнен")
    router.push(redirect)
    router.refresh()
    return null
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">Вход</CardTitle>
        <CardDescription className="text-xs md:text-sm">
          {step === "email" ? (
            "Введите email. Мы отправим на него код для входа."
          ) : (
            <>
              Если аккаунт с адресом <strong className="text-foreground">{email}</strong> есть, мы
              отправили на него 6-значный код.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Distinct keys: without them React reuses the email field's
            Controller for the code input, which then rejects every keystroke. */}
        {step === "email" ? (
          <Form key="email" {...form}>
            <form onSubmit={form.handleSubmit(onRequestCode)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        autoComplete="email"
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error && (
                <div role="alert" className="text-sm text-red-600">
                  {error}
                </div>
              )}

              <LoadingButton type="submit" className="w-full" loading={form.formState.isSubmitting}>
                Получить код
              </LoadingButton>
            </form>
          </Form>
        ) : (
          <div key="otp">
            <OtpCodeStep
              email={email}
              intent="sign-in"
              submitLabel="Войти"
              onVerify={onVerify}
              onBack={() => {
                setStep("email")
                setError(null)
              }}
            />
          </div>
        )}
      </CardContent>
      <CardFooter>
        <div className="flex w-full justify-center border-t pt-4">
          <p className="text-muted-foreground text-center text-xs">
            Нет аккаунта?{" "}
            <Link href="/sign-up" className="underline">
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </CardFooter>
    </Card>
  )
}
