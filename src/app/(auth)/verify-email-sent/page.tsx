import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { ResendVerificationButton } from '@/components/auth/resend-verification-button'

export const metadata = {
  title: 'Verify your email | EventLinqs',
  description: 'Check your inbox for the verification link to activate your EventLinqs account.',
}

type Props = {
  searchParams: Promise<{ email?: string }>
}

export default async function VerifyEmailSentPage({ searchParams }: Props) {
  const { email } = await searchParams
  const safeEmail = typeof email === 'string' ? email : ''

  return (
    <AuthShell
      title="Check your inbox"
      subtitle={
        safeEmail
          ? `We sent a verification link to ${safeEmail}. Open it to activate your account.`
          : 'We sent a verification link to your email. Open it to activate your account.'
      }
      footer={
        <>
          Used the wrong email?{' '}
          <Link href="/signup" className="font-medium text-ink-900 underline-offset-2 hover:text-gold-600 hover:underline">
            Go back and change it
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-ink-100 bg-ink-100/60 p-5 text-sm text-ink-600">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Open the email from EventLinqs.</li>
            <li>Click the verification link.</li>
            <li>You will be signed in and redirected to your dashboard.</li>
          </ol>
        </div>

        {safeEmail && <ResendVerificationButton email={safeEmail} />}

        <p className="text-center text-xs text-ink-400">
          The link expires in 24 hours. Check your spam folder if you do not see it.
        </p>
      </div>
    </AuthShell>
  )
}
