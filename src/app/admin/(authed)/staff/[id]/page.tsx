import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import {
  can,
  ROLE_LABELS,
  ALL_CAPABILITIES,
  CAPABILITY_LABELS,
  roleCapabilities,
} from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { getAdminStaffDetail, ASSIGNABLE_ADMIN_ROLES } from '@/lib/admin/admin-staff'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import type { AdminRole } from '@/lib/admin/types'
import { setRoleAction, setDisabledAction, setCapabilitiesAction } from '../actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Manage admin | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ status?: string; msg?: string }>

export default async function AdminStaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SearchParams
}) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.invites.manage')) redirect('/admin')

  const { id } = await params
  const { status, msg } = await searchParams
  const staff = await getAdminStaffDetail(id)
  if (!staff) notFound()
  await recordAuditEvent({ action: 'admin.staff.detail.view', targetType: 'admin_user', targetId: id, session })

  const callerIsSuper = session.admin.role === 'super_admin'
  const targetIsSuper = staff.role === 'super_admin'
  // Role select: a non-super caller cannot assign or change a super admin.
  const assignableRoles = ASSIGNABLE_ADMIN_ROLES.filter((r) => callerIsSuper || (r !== 'super_admin' && !targetIsSuper))
  const canEditRole = callerIsSuper || !targetIsSuper
  const canEditCaps = callerIsSuper && !targetIsSuper

  const banner = (() => {
    switch (status) {
      case 'role_saved': return ['ok', 'Role updated.']
      case 'disabled': return ['ok', 'Admin disabled. They can no longer sign in.']
      case 'enabled': return ['ok', 'Admin enabled.']
      case 'caps_saved': return ['ok', 'Capabilities updated.']
      case 'error': return ['err', msg ? decodeURIComponent(msg) : 'Could not save.']
      default: return null
    }
  })()

  return (
    <div>
      <nav className="mb-6 text-sm text-white/50">
        <Link href="/admin/staff" className="hover:text-white">Admin staff</Link>
        <span aria-hidden className="px-2">/</span>
        <span className="text-white/80">{staff.displayName}</span>
      </nav>

      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">{staff.displayName}</h1>
        <p className="mt-1 text-sm text-white/50">{staff.email}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
          <span className="rounded bg-white/10 px-2 py-0.5 text-white/80">{ROLE_LABELS[staff.role]}</span>
          {staff.disabled
            ? <span className="rounded bg-red-500/15 px-2 py-0.5 font-semibold uppercase tracking-wider text-red-300">Disabled</span>
            : <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-semibold uppercase tracking-wider text-emerald-300">Active</span>}
          <span className="rounded bg-white/5 px-2 py-0.5 text-white/60">2FA {staff.totpEnrolled ? 'enrolled' : 'pending'}</span>
        </div>
      </header>

      {banner && (
        <div
          role={banner[0] === 'ok' ? 'status' : 'alert'}
          className={`mb-6 rounded-md border px-4 py-3 text-sm ${banner[0] === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}
        >
          {banner[1]}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Role */}
        <section className="rounded-lg border border-white/[0.08] bg-[#131A2A] p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Role</h2>
          {canEditRole ? (
            <form action={setRoleAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={staff.id} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="role" className="text-[11px] uppercase tracking-wider text-white/50">Assigned role</label>
                <select id="role" name="role" defaultValue={staff.role}
                  className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none">
                  {assignableRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <ConfirmSubmitButton confirmMessage="Change this admin's role?" className="rounded-md bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#0A0F1A] transition hover:bg-white">
                Save role
              </ConfirmSubmitButton>
            </form>
          ) : (
            <p className="text-sm text-white/50">Only a super admin can change a super admin role.</p>
          )}
        </section>

        {/* Access */}
        <section className="rounded-lg border border-white/[0.08] bg-[#131A2A] p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Console access</h2>
          <form action={setDisabledAction} className="flex items-center gap-3">
            <input type="hidden" name="id" value={staff.id} />
            <input type="hidden" name="disabled" value={staff.disabled ? 'false' : 'true'} />
            <ConfirmSubmitButton
              confirmMessage={staff.disabled ? 'Re-enable this admin and let them sign in again?' : 'Disable this admin? They will be signed out and blocked from the console.'}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${staff.disabled ? 'bg-emerald-400/90 text-[#0A0F1A] hover:bg-emerald-300' : 'bg-red-500/90 text-white hover:bg-red-500'}`}
            >
              {staff.disabled ? 'Enable admin' : 'Disable admin'}
            </ConfirmSubmitButton>
            <p className="text-xs text-white/45">{staff.disabled ? 'Currently blocked from signing in.' : 'Can sign in with 2FA.'}</p>
          </form>
        </section>
      </div>

      {/* Capabilities */}
      <section className="mt-6 rounded-lg border border-white/[0.08] bg-[#131A2A] p-5">
        <h2 className="mb-1 font-display text-lg font-semibold">Capabilities</h2>
        <p className="mb-4 max-w-2xl text-sm text-white/50">
          Effective access for this admin. {targetIsSuper
            ? 'A super admin always has every capability; overrides do not apply.'
            : canEditCaps
              ? 'Inherit keeps the role baseline; Grant adds a capability; Revoke removes one.'
              : 'Only a super admin can tune capabilities.'}
        </p>

        {canEditCaps ? (
          <form action={setCapabilitiesAction} className="space-y-2">
            <input type="hidden" name="id" value={staff.id} />
            <div className="overflow-x-auto rounded-md border border-white/[0.08]">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-white/50">
                    <th scope="col" className="px-4 py-2.5 font-medium">Capability</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Role baseline</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Override</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_CAPABILITIES.map((cap) => {
                    const baseline = roleCapabilities(staff.role as AdminRole).has(cap)
                    const mode = staff.capabilitiesGranted.includes(cap)
                      ? 'grant'
                      : staff.capabilitiesRevoked.includes(cap)
                        ? 'revoke'
                        : 'inherit'
                    return (
                      <tr key={cap} className="border-b border-white/[0.05]">
                        <td className="px-4 py-2.5">
                          <div className="text-white">{CAPABILITY_LABELS[cap]}</div>
                          <div className="font-mono text-[11px] text-white/40">{cap}</div>
                        </td>
                        <td className="px-4 py-2.5 text-white/60">{baseline ? 'Allowed' : 'Not allowed'}</td>
                        <td className="px-4 py-2.5">
                          <select name={`cap.${cap}`} defaultValue={mode}
                            className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1 text-white focus:border-white/40 focus:outline-none">
                            <option value="inherit">Inherit</option>
                            <option value="grant">Grant</option>
                            <option value="revoke">Revoke</option>
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <ConfirmSubmitButton confirmMessage="Save capability overrides for this admin?" className="mt-2 rounded-md bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#0A0F1A] transition hover:bg-white">
              Save capabilities
            </ConfirmSubmitButton>
          </form>
        ) : (
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {staff.effectiveCapabilities.map((cap) => (
              <li key={cap} className="flex items-center gap-2 text-sm text-white/70">
                <span className="text-emerald-300" aria-hidden>&#10003;</span> {CAPABILITY_LABELS[cap]}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
