import Link from 'next/link'
import { Suspense } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata = {
  title: 'Reset password | EventLinqs',
  description: 'Request a password reset link for your EventLinqs account.',
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email linked to your account and we will send you a reset link."
      footer={
        <>
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-ink-900 underline-offset-2 hover:text-gold-600 hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {/* The form reads ?email= to prefill when the signup form sends someone
          here, and useSearchParams needs a boundary. Matches /login. */}
      <Suspense fallback={<div className="h-[220px]" />}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthShell>
  )
}
