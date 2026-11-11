"use client"

import { LoadingButton } from "@/components/blocks/loading-button"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import type { AuthIntent } from "@/lib/auth-intent"
import { authErrorMessage, sendLoginCode, type AuthClientError } from "@/lib/auth-otp-client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

const otpSchema = z.object({
  otp: z.string().length(6, { message: "Введите 6-значный код" }),
})
type OtpValues = z.infer<typeof otpSchema>

// Step 2 of every passwordless screen: enter the 6-digit code that was sent
// to `email`. `onVerify` returns the auth error (or null on success).
export function OtpCodeStep({
  email,
  intent,
  submitLabel,
  onVerify,
  onBack,
  backLabel = "Изменить email",
}: {
  email: string
  intent: AuthIntent
  submitLabel: string
  onVerify: (otp: string) => Promise<AuthClientError>
  onBack?: () => void
  backLabel?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [resending, setResending] = useState(false)

  const form = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" },
  })

  async function onSubmit({ otp }: OtpValues) {
    setError(null)
    const authError = await onVerify(otp)
    if (authError) {
      const msg = authErrorMessage(authError, authError.message || "Не удалось войти")
      setError(msg)
      toast.error(msg)
      form.reset()
    }
  }

  async function onResend() {
    setError(null)
    setResending(true)
    const { error: sendError } = await sendLoginCode(email, intent)
    setResending(false)
    if (sendError) {
      toast.error(authErrorMessage(sendError, sendError.message || "Не удалось отправить код"))
      return
    }
    form.reset()
    toast.success("Новый код отправлен.")
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="otp"
          render={({ field }) => (
            <FormItem className="flex flex-col items-center">
              <FormLabel>Код из письма</FormLabel>
              <FormControl>
                <InputOTP
                  maxLength={6}
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  value={field.value}
                  onChange={field.onChange}
                  onComplete={() => void form.handleSubmit(onSubmit)()}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {error && (
          <div role="alert" className="text-center text-sm text-red-600">
            {error}
          </div>
        )}

        <LoadingButton type="submit" className="w-full" loading={form.formState.isSubmitting}>
          {submitLabel}
        </LoadingButton>

        <div className="flex items-center justify-between">
          {onBack ? (
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              {backLabel}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onResend} disabled={resending}>
            Отправить код повторно
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Код действует 5 минут. Нет письма — проверьте папку «Спам».
        </p>
      </form>
    </Form>
  )
}
