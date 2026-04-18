import Link from 'next/link'
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
      <ForgotPasswordForm />
    </AuthShell>
  )
}
