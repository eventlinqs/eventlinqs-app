import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignupForm } from '@/components/auth/signup-form'
import { isProviderEnabled } from '@/lib/auth/providers'
import { isFeatureEnabled } from '@/lib/flags/broadcast'

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
  // Server-resolved, fail-safe. See src/lib/auth/providers.ts.
  const googleEnabled = await isProviderEnabled('google')
  // The consent box offers the weekly digest only while it runs (the CONTROLLER's 08:50 (4)).
  const digestOn = await isFeatureEnabled('broadcast_digest')

  return (
    <AuthShell
      title={isOrganiser ? 'Start selling tickets in 5 minutes' : 'Create your account'}
      subtitle={
        isOrganiser
          ? 'Set up your organiser account, create your first event, and share the link. Your first event is on us.'
          : 'Find events from every community and host your own in minutes.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-ink-900 underline-offset-2 hover:text-gold-600 hover:underline">
            Sign in
          </Link>
          {/* One door (Lawal's 16:13 of 8 November 2026): the header's Get Started opens this page for everyone, so a
              host is one tap from the choice between selling on EventLinqs and listing an event sold elsewhere. */}
          {isOrganiser ? null : (
            <span className="mt-2 block">
              Hosting an event?{' '}
              <Link href="/start?src=signup" className="font-medium text-ink-900 underline-offset-2 hover:text-gold-600 hover:underline">
                Start here
              </Link>
            </span>
          )}
        </>
      }
    >
      <SignupForm role={isOrganiser ? 'organiser' : 'attendee'} googleEnabled={googleEnabled} digestOn={digestOn} />
    </AuthShell>
  )
}
