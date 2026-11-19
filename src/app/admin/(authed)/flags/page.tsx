import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readBroadcastFlags } from '@/lib/admin/flags'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import { switchFlagAction } from './actions'
import {
  ADMIN_CELL,
  ADMIN_CELL_ACTIONS,
  ADMIN_CELL_LABEL,
  ADMIN_CELL_NAME,
  ADMIN_ROW,
  ADMIN_ROW_CONTROL,
  ADMIN_TABLE,
  ADMIN_TABLE_WRAP,
  ADMIN_TBODY,
  ADMIN_THEAD,
} from '@/components/admin/table-card'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Feature flags | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ status?: string; flag?: string }>

const STAGE_LABELS: Record<string, string> = {
  broadcast_share: 'Stage 1: share infrastructure',
  broadcast_digest: 'Stage 2: weekly local digest',
  broadcast_follow: 'Stage 2: follow surfaces',
  broadcast_artists: 'Stage 3: performer attribution',
  gig_board: 'Marketplace A: gig board',
  artist_showcase: 'Marketplace B: showcase and directory',
}

/**
 * Broadcast Layer stage switches (SPEC section 6). Every module is built and
 * merged; switching a stage on is this config change plus the stage's
 * evidence gate re-run, never a build or a deploy.
 */
export default async function AdminFlagsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.flags.manage')) {
    redirect('/admin')
  }
  await recordAuditEvent({ action: 'admin.flags.view', session })

  const { status, flag } = await searchParams
  const flags = await readBroadcastFlags()

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">Platform</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Feature flags</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
          The Broadcast Layer stage switches. Every stage is built and tested; switching one on
          is this change plus a re-run of its evidence gate on staging, never a deploy. Changes
          take effect within 30 seconds and are audit-logged.
        </p>
      </header>

      {status === 'saved' && (
        <div role="status" className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
          Saved {flag}. The new state is live for new requests now.
        </div>
      )}
      {status === 'invalid' && (
        <div role="alert" className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          That switch was not valid. Refresh and try again.
        </div>
      )}
      {status === 'error' && (
        <div role="alert" className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800">
          Could not save {flag}. Try again.
        </div>
      )}

      {/* Below lg this stops being a table and each flag becomes a card
          carrying its own headings: src/components/admin/table-card.ts. */}
      <div className={`relative ${ADMIN_TABLE_WRAP}`}>
        <table className={`${ADMIN_TABLE} lg:min-w-[680px]`}>
          <thead className={ADMIN_THEAD}>
            <tr className="border-b border-[var(--admin-line)] text-left text-[var(--admin-muted)]">
              <th scope="col" className="px-4 py-3 font-medium">Stage</th>
              <th scope="col" className="px-4 py-3 font-medium">What it switches</th>
              <th scope="col" className="px-4 py-3 font-medium">Launch default</th>
              <th scope="col" className="px-4 py-3 font-medium">State</th>
              <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Switch</span></th>
            </tr>
          </thead>
          <tbody className={ADMIN_TBODY}>
            {flags.map((row) => (
              <tr key={row.flag} className={`${ADMIN_ROW} align-middle`}>
                <td className={ADMIN_CELL_NAME}>
                  <div className="font-medium text-[var(--admin-ink)]">{STAGE_LABELS[row.flag] ?? row.flag}</div>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--admin-muted)]">{row.flag}</div>
                </td>
                <td className={`${ADMIN_CELL} max-w-md text-[var(--admin-soft)]`}>
                  <span className={ADMIN_CELL_LABEL}>Switches</span>
                  {row.description}
                </td>
                <td className={`${ADMIN_CELL} text-[var(--admin-soft)]`}>
                  <span className={ADMIN_CELL_LABEL}>Launch default</span>
                  {row.launchDefault ? 'On' : 'Off'}
                </td>
                <td className={ADMIN_CELL}>
                  <span className={ADMIN_CELL_LABEL}>State</span>
                  <span
                    className={
                      row.enabled
                        ? 'inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-800'
                        : 'inline-flex items-center rounded-full border border-[var(--admin-line)] bg-[var(--admin-tint)] px-2.5 py-0.5 text-xs font-medium text-[var(--admin-muted)]'
                    }
                  >
                    {row.enabled ? 'On' : 'Off'}
                  </span>
                </td>
                <td className={ADMIN_CELL_ACTIONS}>
                  <form action={switchFlagAction}>
                    <input type="hidden" name="flag" value={row.flag} />
                    <input type="hidden" name="enabled" value={row.enabled ? 'false' : 'true'} />
                    <ConfirmSubmitButton
                      confirmMessage={`Switch ${row.flag} ${row.enabled ? 'OFF' : 'ON'}? The change is live within 30 seconds.`}
                      className={`${ADMIN_ROW_CONTROL} justify-center rounded-md border border-[var(--admin-line)] bg-[var(--admin-tint-strong)] px-3 py-1.5 text-xs font-medium text-[var(--admin-ink)] transition hover:border-amber-300/40 hover:text-amber-800`}
                    >
                      Switch {row.enabled ? 'off' : 'on'}
                    </ConfirmSubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 max-w-2xl text-xs text-[var(--admin-muted)]">
        Per the Broadcast Layer SPEC, a switch-on also requires the stage&apos;s evidence gate
        re-run green on staging and the marketing copy updated the same day. The runbook lives
        in docs/broadcast/.
      </p>
    </div>
  )
}
