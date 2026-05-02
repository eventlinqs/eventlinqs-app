import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/admin/auth'
import { LoginForm } from './login-form'

export const metadata = {
  title: 'Admin sign in | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>
}

/**
 * Admin login.
 *
 * Two-factor flow on a single page:
 *   - Email and password
 *   - 6-digit TOTP code, with a "use recovery code" toggle for break-glass
 *
 * If the admin is already authenticated, we redirect them straight to the
 * destination (or /admin) so they do not see this page again on refresh.
 */
export default async function AdminLoginPage({ searchParams }: PageProps) {
  const params = await searchParams
  const session = await getAdminSession()
  if (session) {
    redirect(params.next && params.next.startsWith('/admin') ? params.next : '/admin')
  }
  return (
    <main className="min-h-screen bg-[#0A0F1A] text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <div className="mb-10 text-center">
          <p className="font-display text-[11px] uppercase tracking-[0.3em] text-white/50">EventLinqs</p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Admin console</h1>
          <p className="mt-3 text-sm text-white/60">
            Restricted access. All actions are logged.
          </p>
        </div>
        <LoginForm next={params.next} initialError={params.error} />
      </div>
    </main>
  )
}
