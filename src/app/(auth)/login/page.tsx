import Link from 'next/link'
import { Suspense } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'

export const metadata = {
  title: 'Sign in | EventLinqs',
  description: 'Sign in to your EventLinqs account to manage events and tickets.',
}

export default function LoginPage() {
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
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}
