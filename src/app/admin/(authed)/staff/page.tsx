import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can, ROLE_LABELS, ROLE_DESCRIPTIONS, ALL_CAPABILITIES, CAPABILITY_LABELS, roleCapabilities } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { listAdminStaff, ASSIGNABLE_ADMIN_ROLES } from '@/lib/admin/admin-staff'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import type { AdminRole } from '@/lib/admin/types'
import { addAdminAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Admin staff | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ status?: string; msg?: string }>

function fmtDate(iso: string | null): string {
  if (!iso) return 'never'
  return new Date(iso).toISOString().slice(0, 10)
}

export default async function AdminStaffPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.invites.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.staff.view', session })

  const { status, msg } = await searchParams
  const staff = await listAdminStaff()
  const isSuper = session.admin.role === 'super_admin'
  // A non-super-admin cannot create a super_admin.
  const creatableRoles = ASSIGNABLE_ADMIN_ROLES.filter((r) => isSuper || r !== 'super_admin')

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Access</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Admin staff</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Who can sign in to this console and what they can do. Add an admin by the email of an
          existing account, set their role, enable or disable them, and tune their capabilities.
          Every change is audit-logged. A super admin has full control and cannot be locked out.
        </p>
      </header>

      {status === 'added' && (
        <div role="status" className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Admin added. They can sign in at /admin/login and will be prompted to set up 2FA on first sign-in.
        </div>
      )}
      {status === 'add_error' && (
        <div role="alert" className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {msg ? decodeURIComponent(msg) : 'Could not add that admin.'}
        </div>
      )}
      {status === 'add_invalid' && (
        <div role="alert" className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Check the email is valid and a role is selected.
        </div>
      )}

      {/* Add admin */}
      <section className="mb-10 rounded-lg border border-white/[0.08] bg-[#131A2A] p-5">
        <h2 className="mb-1 font-display text-lg font-semibold">Add an admin</h2>
        <p className="mb-4 text-sm text-white/50">
          The person must already have an EventLinqs account (signed up with this email). Granting
          admin does not change their member account.
        </p>
        <form action={addAdminAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label htmlFor="add-email" className="text-[11px] uppercase tracking-wider text-white/50">Account email</label>
            <input id="add-email" name="email" type="email" required placeholder="person@example.com"
              className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-role" className="text-[11px] uppercase tracking-wider text-white/50">Role</label>
            <select id="add-role" name="role" defaultValue="support"
              className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none">
              {creatableRoles.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-name" className="text-[11px] uppercase tracking-wider text-white/50">Display name (optional)</label>
            <input id="add-name" name="displayName" type="text" maxLength={120}
              className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <ConfirmSubmitButton
              confirmMessage="Grant admin console access to this account with the selected role?"
              className="rounded-md bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#0A0F1A] transition hover:bg-white"
            >
              Add admin
            </ConfirmSubmitButton>
          </div>
        </form>
      </section>

      {/* Staff list */}
      <div className="mb-10 overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-white/50">
              <th scope="col" className="px-4 py-3 font-medium">Admin</th>
              <th scope="col" className="px-4 py-3 font-medium">Role</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">2FA</th>
              <th scope="col" className="px-4 py-3 font-medium">Last sign-in</th>
              <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Manage</span></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-b border-white/[0.05] align-middle">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{s.displayName}</div>
                  <div className="text-[12px] text-white/50">{s.email}</div>
                </td>
                <td className="px-4 py-3">{ROLE_LABELS[s.role]}</td>
                <td className="px-4 py-3">
                  {s.disabled ? (
                    <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-red-300">Disabled</span>
                  ) : (
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">Active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-white/70">{s.totpEnrolled ? 'Enrolled' : 'Pending'}</td>
                <td className="px-4 py-3 text-white/50">{fmtDate(s.lastLoginAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/staff/${s.id}`} className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/[0.06] hover:text-white">
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role capability matrix */}
      <section>
        <h2 className="mb-1 font-display text-lg font-semibold">Role capability matrix</h2>
        <p className="mb-4 max-w-2xl text-sm text-white/50">
          The baseline each role carries. Per-admin overrides (set on a staff member) tune this for
          one person; a super admin always has everything.
        </p>
        <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-left text-white/50">
                <th scope="col" className="px-4 py-3 font-medium">Capability</th>
                {ASSIGNABLE_ADMIN_ROLES.map((r) => (
                  <th key={r} scope="col" className="px-4 py-3 text-center font-medium">{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_CAPABILITIES.map((cap) => (
                <tr key={cap} className="border-b border-white/[0.05]">
                  <td className="px-4 py-3">
                    <div className="text-white">{CAPABILITY_LABELS[cap]}</div>
                    <div className="font-mono text-[11px] text-white/40">{cap}</div>
                  </td>
                  {ASSIGNABLE_ADMIN_ROLES.map((r: AdminRole) => (
                    <td key={r} className="px-4 py-3 text-center">
                      {roleCapabilities(r).has(cap) ? (
                        <span className="text-emerald-300" aria-label="yes">&#10003;</span>
                      ) : (
                        <span className="text-white/20" aria-label="no">&middot;</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 space-y-1 text-xs text-white/45">
          {ASSIGNABLE_ADMIN_ROLES.map((r) => (
            <li key={r}><span className="font-semibold text-white/70">{ROLE_LABELS[r]}:</span> {ROLE_DESCRIPTIONS[r]}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
