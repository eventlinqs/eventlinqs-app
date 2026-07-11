import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readBroadcastFlags } from '@/lib/admin/flags'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import { switchFlagAction } from './actions'

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
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Platform</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Feature flags</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          The Broadcast Layer stage switches. Every stage is built and tested; switching one on
          is this change plus a re-run of its evidence gate on staging, never a deploy. Changes
          take effect within 30 seconds and are audit-logged.
        </p>
      </header>

      {status === 'saved' && (
        <div role="status" className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Saved {flag}. The new state is live for new requests now.
        </div>
      )}
      {status === 'invalid' && (
        <div role="alert" className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          That switch was not valid. Refresh and try again.
        </div>
      )}
      {status === 'error' && (
        <div role="alert" className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Could not save {flag}. Try again.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-white/50">
              <th scope="col" className="px-4 py-3 font-medium">Stage</th>
              <th scope="col" className="px-4 py-3 font-medium">What it switches</th>
              <th scope="col" className="px-4 py-3 font-medium">Launch default</th>
              <th scope="col" className="px-4 py-3 font-medium">State</th>
              <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Switch</span></th>
            </tr>
          </thead>
          <tbody>
            {flags.map((row) => (
              <tr key={row.flag} className="border-b border-white/[0.05] align-middle">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{STAGE_LABELS[row.flag] ?? row.flag}</div>
                  <div className="text-[11px] uppercase tracking-wider text-white/40">{row.flag}</div>
                </td>
                <td className="max-w-md px-4 py-3 text-white/60">{row.description}</td>
                <td className="px-4 py-3 text-white/60">{row.launchDefault ? 'On' : 'Off'}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      row.enabled
                        ? 'inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-200'
                        : 'inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs font-medium text-white/50'
                    }
                  >
                    {row.enabled ? 'On' : 'Off'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <form action={switchFlagAction}>
                    <input type="hidden" name="flag" value={row.flag} />
                    <input type="hidden" name="enabled" value={row.enabled ? 'false' : 'true'} />
                    <ConfirmSubmitButton
                      confirmMessage={`Switch ${row.flag} ${row.enabled ? 'OFF' : 'ON'}? The change is live within 30 seconds.`}
                      className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white transition hover:border-amber-300/40 hover:text-amber-200"
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

      <p className="mt-6 max-w-2xl text-xs text-white/40">
        Per the Broadcast Layer SPEC, a switch-on also requires the stage&apos;s evidence gate
        re-run green on staging and the marketing copy updated the same day. The runbook lives
        in docs/broadcast/.
      </p>
    </div>
  )
}
