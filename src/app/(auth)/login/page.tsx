import Link from 'next/link'
import { Suspense } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { isProviderEnabled } from '@/lib/auth/providers'

export const metadata = {
  title: 'Sign in | EventLinqs',
  description: 'Sign in to your EventLinqs account to manage events and tickets.',
}

export default async function LoginPage() {
  // Resolved on the server so the button is either in the markup or is not.
  // Fail-safe: any failure resolves to false and the page shows email sign-in,
  // which always works, rather than a button that leads to raw JSON.
  const googleEnabled = await isProviderEnabled('google')

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your events and tickets."
      footer={
        <>
          New to EventLinqs?{' '}
          <Link href="/signup" className="font-medium text-ink-900 underline-offset-2 hover:text-gold-600 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<div className="h-[420px]" />}>
        <LoginForm googleEnabled={googleEnabled} />
      </Suspense>
    </AuthShell>
  )
}
