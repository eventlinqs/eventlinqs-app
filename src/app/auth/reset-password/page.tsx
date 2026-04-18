import { AuthShell } from '@/components/auth/auth-shell'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export const metadata = {
  title: 'Set a new password | EventLinqs',
  description: 'Choose a new password for your EventLinqs account.',
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a new password to finish resetting your account."
    >
      <ResetPasswordForm />
    </AuthShell>
  )
}
