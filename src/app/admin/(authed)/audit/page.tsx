import Link from 'next/link'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCapability } from '@/lib/admin/rbac'
import { recordAuditEvent, queryAuditLog } from '@/lib/admin/audit'
import { AuditDetailButton } from './audit-detail'

export const metadata = {
  title: 'Audit log | EventLinqs Admin',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  searchParams: Promise<{
    from?: string
    to?: string
    actor?: string
    action?: string
    target?: string
    cursor?: string
  }>
}

const KNOWN_ACTIONS = [
  'admin.session.login.success',
  'admin.session.login.failure',
  'admin.session.logout',
  'admin.totp.enrolled',
  'admin.totp.recovery_used',
  'admin.invite.created',
  'admin.invite.accepted',
  'admin.invite.revoked',
  'admin.dashboard.view',
  'admin.audit.viewed',
]

const KNOWN_TARGET_TYPES = [
  'admin_user',
  'admin_invite',
  'organisation',
  'event',
  'order',
  'refund_request',
  'stripe_dispute',
]

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const session = await requireAdminSession()
  assertCapability(session.admin.role, 'admin.audit.read')
  const params = await searchParams

  const filters = {
    fromIso: params.from ? new Date(params.from).toISOString() : undefined,
    toIso: params.to ? new Date(params.to).toISOString() : undefined,
    actorEmail: params.actor || undefined,
    actions: params.action ? [params.action] : undefined,
    targetTypes: params.target ? [params.target] : undefined,
    cursor: params.cursor ? Number(params.cursor) : undefined,
  }

  const result = await queryAuditLog(filters)

  await recordAuditEvent({
    action: 'admin.audit.viewed',
    session,
    metadata: { filters: { ...filters, fromIso: filters.fromIso, toIso: filters.toIso } },
  })

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Compliance</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Audit log</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Append-only record of every admin action. Filter by actor, action, target, and time. Each
          row exposes its full metadata payload.
        </p>
      </header>

      <form method="GET" className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 md:grid-cols-5">
        <FilterField label="From" name="from" type="date" defaultValue={params.from} />
        <FilterField label="To" name="to" type="date" defaultValue={params.to} />
        <FilterField label="Actor email" name="actor" placeholder="founder@..." defaultValue={params.actor} />
        <SelectField label="Action" name="action" options={KNOWN_ACTIONS} defaultValue={params.action} />
        <SelectField label="Target type" name="target" options={KNOWN_TARGET_TYPES} defaultValue={params.target} />
        <div className="md:col-span-5 flex items-center justify-end gap-2">
          <Link
            href="/admin/audit"
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          >
            Reset
          </Link>
          <button
            type="submit"
            className="rounded-md bg-[var(--brand-accent)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]"
          >
            Apply
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#131A2A]">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.18em] text-white/50">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">IP</th>
              <th className="px-4 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-white/50">
                  No matching events.
                </td>
              </tr>
            ) : (
              result.rows.map(row => (
                <tr key={row.id} className="border-t border-white/[0.06]">
                  <td className="whitespace-nowrap px-4 py-3 text-white/80">
                    {new Date(row.created_at).toISOString().replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="px-4 py-3 text-white/80">{row.actor_email_snapshot ?? 'anonymous'}</td>
                  <td className="px-4 py-3 text-white/60">{row.actor_role_snapshot ?? '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white">{row.action}</td>
                  <td className="px-4 py-3 text-white/70">
                    {row.target_type ? `${row.target_type}:${row.target_id ?? '-'}` : '-'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-white/60">{row.ip ?? '-'}</td>
                  <td className="px-4 py-3">
                    <AuditDetailButton row={row} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-end">
        {result.nextCursor ? (
          <Link
            href={buildNextHref(params, result.nextCursor)}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          >
            Older entries
          </Link>
        ) : (
          <span className="text-xs uppercase tracking-[0.18em] text-white/40">End of log</span>
        )}
      </div>
    </div>
  )
}

function FilterField(props: {
  label: string
  name: string
  type?: string
  placeholder?: string
  defaultValue?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">{props.label}</span>
      <input
        type={props.type ?? 'text'}
        name={props.name}
        placeholder={props.placeholder}
        defaultValue={props.defaultValue ?? ''}
        className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
      />
    </label>
  )
}

function SelectField(props: { label: string; name: string; options: string[]; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">{props.label}</span>
      <select
        name={props.name}
        defaultValue={props.defaultValue ?? ''}
        className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
      >
        <option value="">Any</option>
        {props.options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  )
}

function buildNextHref(params: { from?: string; to?: string; actor?: string; action?: string; target?: string }, cursor: number): string {
  const sp = new URLSearchParams()
  if (params.from) sp.set('from', params.from)
  if (params.to) sp.set('to', params.to)
  if (params.actor) sp.set('actor', params.actor)
  if (params.action) sp.set('action', params.action)
  if (params.target) sp.set('target', params.target)
  sp.set('cursor', String(cursor))
  return `/admin/audit?${sp.toString()}`
}
