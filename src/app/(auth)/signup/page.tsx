import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignupForm } from '@/components/auth/signup-form'

export const metadata = {
  title: 'Create account | EventLinqs',
  description: 'Create your EventLinqs account to buy tickets and host events.',
}

type Props = {
  searchParams: Promise<{ role?: string }>
}

export default async function SignupPage({ searchParams }: Props) {
  const { role } = await searchParams
  const isOrganiser = role === 'organiser'

  return (
    <AuthShell
      title={isOrganiser ? 'Start selling tickets in 5 minutes' : 'Create your account'}
      subtitle={
        isOrganiser
          ? 'Set up your organiser account, create your first event, and share the link. Your first event is on us.'
          : 'Find events from every culture and host your own in minutes.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-ink-900 underline-offset-2 hover:text-gold-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm role={isOrganiser ? 'organiser' : 'attendee'} />
    </AuthShell>
  )
}
