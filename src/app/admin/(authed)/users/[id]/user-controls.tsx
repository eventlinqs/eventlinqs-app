'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { changeUserRoleAction, setUserSuspensionAction } from '../actions'

const ASSIGNABLE = ['attendee', 'organiser'] as const

/** Role control: switch a user between attendee and organiser. Platform admin
 *  roles are read-only here (escalation stays a manual operation). */
export function RoleControl({ userId, currentRole }: { userId: string; currentRole: string }) {
  const router = useRouter()
  const isPlatformAdmin = currentRole === 'admin' || currentRole === 'super_admin'
  const [role, setRole] = useState(isPlatformAdmin ? currentRole : (ASSIGNABLE.includes(currentRole as never) ? currentRole : 'attendee'))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (isPlatformAdmin) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
        <h3 className="text-sm font-semibold text-white/80">Role</h3>
        <p className="mt-2 text-sm text-white/60">
          This account holds a platform role ({currentRole}). Platform roles are not changed from this surface.
        </p>
      </div>
    )
  }

  async function apply() {
    if (role === currentRole) return
    setSubmitting(true)
    setError(null)
    const res = await changeUserRoleAction({ userId, newRole: role })
    setSubmitting(false)
    if (!res.ok) { setError(res.error); return }
    setDone(true)
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
      <h3 className="text-sm font-semibold text-white/80">Role</h3>
      {error ? <p role="alert" className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      {done ? <p role="status" className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">Role updated.</p> : null}
      <div className="mt-3 flex items-center gap-2">
        <select
          value={role}
          onChange={e => { setRole(e.target.value); setDone(false) }}
          className="min-h-[44px] rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
        >
          {ASSIGNABLE.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button
          type="button"
          disabled={submitting || role === currentRole}
          onClick={apply}
          className="min-h-[44px] rounded-md bg-[var(--brand-accent)] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Saving' : 'Apply'}
        </button>
      </div>
    </div>
  )
}

/** Suspend / reactivate via the Auth ban mechanism. */
export function SuspendControl({ userId, suspended }: { userId: string; suspended: boolean }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    const verb = suspended ? 'reactivate' : 'suspend'
    if (!window.confirm(`Are you sure you want to ${verb} this account?`)) return
    setSubmitting(true)
    setError(null)
    const res = await setUserSuspensionAction({ userId, suspend: !suspended })
    setSubmitting(false)
    if (!res.ok) { setError(res.error); return }
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
      <h3 className="text-sm font-semibold text-white/80">Account status</h3>
      <p className="mt-2 text-sm text-white/60">
        {suspended
          ? 'This account is suspended and cannot sign in.'
          : 'This account is active. Suspending blocks sign-in and revokes existing sessions.'}
      </p>
      {error ? <p role="alert" className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      <button
        type="button"
        disabled={submitting}
        onClick={toggle}
        className={`mt-3 min-h-[44px] rounded-md px-5 text-xs font-semibold uppercase tracking-[0.18em] disabled:opacity-60 ${
          suspended
            ? 'bg-[var(--brand-accent)] text-[var(--text-primary)]'
            : 'border border-red-500/40 text-red-200 hover:bg-red-500/10'
        }`}
      >
        {submitting ? 'Working' : suspended ? 'Reactivate account' : 'Suspend account'}
      </button>
    </div>
  )
}
