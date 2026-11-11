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
import { authErrorMessage, sendLoginCode, verifyLoginCode } from "@/lib/auth-otp-client"
import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

const signUpSchema = z.object({
  name: z.string().trim().min(1, { message: "Введите имя" }),
  email: z.email({ message: "Введите корректный email" }),
})
type SignUpValues = z.infer<typeof signUpSchema>

// Passwordless registration: name + email → 6-digit code from the email →
// the account is created on the first code sign-in (emailOTP plugin, sign-up
// intent). If the email already has an account, the code just signs it in.
export function SignUpForm() {
  const router = useRouter()
  const [step, setStep] = useState<"details" | "otp">("details")
  const [values, setValues] = useState<SignUpValues | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingInviteEmail, setPendingInviteEmail] = useState<string | null>(null)

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "" },
  })

  async function onRequestCode(data: SignUpValues) {
    setError(null)
    setPendingInviteEmail(null)
    const email = data.email.trim().toLowerCase()

    // Block standalone sign-up if the email has a live invitation — the user
    // should use the invite link instead (so they end up in the inviter's org
    // rather than a fresh «Моя организация»).
    try {
      const res = await fetch(`/api/invitations/check?email=${encodeURIComponent(email)}`, {
        cache: "no-store",
      })
      if (res.ok) {
        const body = (await res.json()) as { hasPending?: boolean }
        if (body.hasPending) {
          setPendingInviteEmail(email)
          return
        }
      }
    } catch {
      // Fail open: the user.create.after hook still skips the default org.
    }

    const { error } = await sendLoginCode(email, "sign-up")
    if (error) {
      const msg = authErrorMessage(error, error.message || "Не удалось отправить код")
      setError(msg)
      toast.error(msg)
      return
    }
    setValues({ name: data.name.trim(), email })
    setStep("otp")
  }

  async function onVerify(otp: string) {
    if (!values) return null
    const { error } = await verifyLoginCode(values.email, otp, values.name)
    if (error) return error
    toast.success("Добро пожаловать!")
    router.push("/dashboard")
    router.refresh()
    return null
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">Регистрация</CardTitle>
        <CardDescription className="text-xs md:text-sm">
          {step === "details" || !values ? (
            "Введите имя и email. Мы отправим на email код для подтверждения."
          ) : (
            <>
              Мы отправили 6-значный код на{" "}
              <strong className="text-foreground">{values.email}</strong>.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pendingInviteEmail && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"
          >
            <p className="font-medium">У вас есть активное приглашение.</p>
            <p className="mt-1 text-xs">
              Организация уже пригласила <strong>{pendingInviteEmail}</strong>. Пожалуйста,
              используйте ссылку-приглашение из письма, чтобы присоединиться. Если её нет,
              попросите администратора организации отправить её повторно.
            </p>
          </div>
        )}
        {step === "details" || !values ? (
          <Form key="details" {...form}>
            <form onSubmit={form.handleSubmit(onRequestCode)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Имя</FormLabel>
                    <FormControl>
                      <Input placeholder="Иван Иванов" autoComplete="name" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                        {...field}
                        onChange={(e) => {
                          field.onChange(e)
                          if (pendingInviteEmail) setPendingInviteEmail(null)
                        }}
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

              <LoadingButton type="submit" className="w-full mt-2" loading={form.formState.isSubmitting}>
                Получить код
              </LoadingButton>
            </form>
          </Form>
        ) : (
          <div key="otp">
            <OtpCodeStep
              email={values.email}
              intent="sign-up"
              submitLabel="Создать аккаунт"
              onVerify={onVerify}
              onBack={() => {
                setStep("details")
                setError(null)
              }}
              backLabel="Изменить данные"
            />
          </div>
        )}
      </CardContent>
      <CardFooter>
        <div className="flex w-full justify-center border-t pt-4">
          <p className="text-muted-foreground text-center text-xs">
            Уже есть аккаунт?{" "}
            <Link href="/sign-in" className="underline">
              Войти
            </Link>
          </p>
        </div>
      </CardFooter>
    </Card>
  )
}
