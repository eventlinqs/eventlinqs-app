import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getAdminSession } from '@/lib/admin/auth'
import { AdminShell } from '@/components/admin/admin-shell'

export const metadata = {
  title: 'Admin | EventLinqs',
  robots: { index: false, follow: false },
}

/**
 * Auth-gated admin layout.
 *
 * Wraps every admin route except /admin/login. Verifies a valid admin
 * session (auth.users row + non-disabled admin_users row) and mounts
 * the admin shell.
 *
 * The route group (authed) makes the URL stay /admin/... while keeping
 * /admin/login outside the gate.
 */
export default async function AuthedAdminLayout({ children }: { children: ReactNode }) {
  // AUTH-03: the layout admits an admin who has not enrolled 2FA yet only so /admin/enrol-2fa, beneath it, can
  // render. It cannot see which page it wraps, so every page and action under it checks the strict session itself
  // (tests/unit/admin/enrolment-allowance-is-named.test.ts).
  const session = await getAdminSession({ forEnrolment: true })
  if (!session) {
    redirect('/admin/login')
  }

  return <AdminShell session={session}>{children}</AdminShell>
}
