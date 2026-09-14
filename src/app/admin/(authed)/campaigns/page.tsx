import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { listCampaigns, readCampaign } from '@/lib/campaigner/read'
import { CampaignControls } from './campaign-controls'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Campaigns | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * WHO THIS CAMPAIGN WILL REACH, WHEN, AND WHETHER ANYBODY HAS SAID YES.
 *
 * Close-out GA4 step 12. One number first, the size of the list this campaign
 * may reach, then the mode the campaigner is in, then the step schedule against
 * days remaining, then the approval state, then the cap and how much of it is
 * used, then the message exactly as it will arrive.
 *
 * THE PREVIEW IS THE REAL RENDER, produced by the same function the runner
 * calls with the same values. A preview built by a second code path is a
 * preview of a message nobody will receive.
 *
 * ON LIGHT AND DARK. The admin console is one dark surface, with no theme
 * switch and no `dark:` variant anywhere in `src/components/admin`. This page is
 * built to that surface rather than inventing a second theme on one screen,
 * which would make this the odd page in the console; the deviation and the
 * reason are recorded in LANE-B-CLOSED.md rather than left as a silent choice.
 */

type Props = { searchParams: Promise<{ campaign?: string; channel?: string }> }

export default async function AdminCampaignsPage({ searchParams }: Props) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.campaigns.view', session })

  const { campaign: campaignId, channel } = await searchParams
  const admin = createAdminClient()
  const { data: channelRows } = await admin.from('marketing_channel').select('code, display_name').order('code')
  const channels = (channelRows ?? []).map(c => ({ code: c.code, displayName: c.display_name }))
  const channelCode = channel ?? channels[0]?.code ?? ''

  const campaigns = await listCampaigns()
  const view = campaignId ? await readCampaign(campaignId, channelCode) : null

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Campaigns</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Who a campaign may reach, when each step opens, and the message exactly as it will arrive.
          Nothing leaves draft until a person has approved this segment and this message, and the
          database refuses the move if nobody has.
        </p>
      </header>

      <section className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">Pick a campaign</h2>
        <p className="mt-1 text-sm text-white/60">
          {view ? view.modeSentence : 'Choose a campaign to see who it reaches and what it will say.'}
        </p>
        <CampaignControls
          campaigns={campaigns.map(c => ({
            id: c.id,
            reference: c.reference,
            name: c.name,
            eventTitle: c.eventTitle,
          }))}
          channels={channels}
          selectedCampaignId={view?.id ?? ''}
          selectedChannelCode={channelCode}
          approved={view?.approved ?? false}
          canRender={Boolean(view?.preview)}
        />
      </section>

      {!view ? (
        <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-8 text-center">
          <h2 className="font-display text-xl font-semibold text-white">Pick a campaign to see it</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-white/60">
            A campaign belongs to one event, and the same audience is paced differently for an event
            eleven days away and one two days away, which is the whole point of pacing by days
            remaining rather than by a calendar.
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AdminStatTile
              label="People this campaign may reach"
              value={view.allowlistSize}
              hint={`on the ${view.channelCode} channel, every one with a consent behind them`}
              status={view.allowlistSize > 0 ? 'ok' : 'warn'}
            />
            <AdminStatTile
              label="Approved to send"
              value={view.approved ? 'Yes' : 'No'}
              hint={view.approved ? 'this exact segment and message' : 'nothing can leave draft'}
              status={view.approved ? 'ok' : 'warn'}
            />
            <AdminStatTile
              label="Cap used"
              value={`${view.capUsed} of ${view.volumeCap}`}
              hint="the database refuses the send that would exceed it"
              status={view.capUsed >= view.volumeCap ? 'warn' : 'ok'}
            />
            <AdminStatTile
              label="Days until the event"
              value={Number.isFinite(view.daysRemaining) ? view.daysRemaining : 'None'}
              hint={view.eventDateLabel}
              status={view.daysRemaining >= 0 ? 'ok' : 'warn'}
            />
          </div>

          <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <h2 className="font-display text-lg font-semibold text-white">The schedule</h2>
            <p className="mt-1 text-sm text-white/60">{view.daysRemainingSentence}</p>
            <ul className="mt-5 space-y-2 text-sm">
              {view.steps.length === 0 && (
                <li className="text-white/60">This campaign has no sequence, so no step can open.</li>
              )}
              {view.steps.map(step => (
                <li
                  key={step.stepOrder}
                  className="flex flex-wrap items-baseline justify-between gap-3 border-b border-white/[0.06] pb-2"
                >
                  <span className="text-white/80">
                    Step {step.stepOrder}, {step.channelName}, {step.windowSentence}, {step.gapSentence}
                  </span>
                  <span className={step.isOpenNow ? 'text-emerald-300' : 'text-white/40'}>
                    {step.isOpenNow ? 'open now' : 'closed'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <h2 className="font-display text-lg font-semibold text-white">Approval</h2>
            <p className="mt-2 text-sm text-white/75">{view.approvalSentence}</p>
            <p className="mt-3 text-sm text-white/55">{view.capSentence}</p>
            {view.senderIdentity ? (
              <p className="mt-3 text-sm text-white/55">
                From {view.senderIdentity.fromName}, replies to {view.senderIdentity.replyTo}.{' '}
                {view.senderIdentity.identityLine}
              </p>
            ) : (
              <p role="alert" className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                This organiser has no verified sender identity, so no message can say who it is from
                and none will render.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <h2 className="font-display text-lg font-semibold text-white">What arrives</h2>
            {view.preview ? (
              <>
                <p className="mt-1 text-sm text-white/60">
                  The next message, {view.preview.forStep}, rendered by the same code that sends it.
                </p>
                {view.preview.subject && (
                  <p className="mt-4 text-sm text-white/55">
                    Subject: <span className="text-white/90">{view.preview.subject}</span>
                  </p>
                )}
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-white/[0.06] bg-[#0A1628] p-4 text-sm leading-relaxed text-white/85">
                  {view.preview.body}
                </pre>
              </>
            ) : (
              <p className="mt-2 text-sm text-white/70">{view.previewProblem}</p>
            )}
          </section>

          <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <h2 className="font-display text-lg font-semibold text-white">The proof</h2>
            <p className="mt-1 text-sm text-white/60">
              What this campaign produced and the fee against it, every figure read from the order
              ledger and the attribution records rather than assembled by hand.
            </p>
            <Link
              href={`/admin/campaigns/${view.id}/proof`}
              className="mt-4 inline-flex min-h-[44px] items-center rounded-lg border border-white/20 px-5 text-sm font-semibold text-white transition hover:border-[var(--brand-accent)]"
            >
              Open the campaign proof
            </Link>
          </section>

          <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <h2 className="font-display text-lg font-semibold text-white">What has happened</h2>
            {view.sendCounts.length === 0 && view.skipCounts.length === 0 ? (
              <p className="mt-2 text-sm text-white/60">
                Nothing has been drafted or skipped for this campaign yet.
              </p>
            ) : (
              <dl className="mt-4 space-y-2 text-sm">
                {view.sendCounts.map(row => (
                  <div key={row.state} className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                    <dt className="text-white/70">Messages {row.state}</dt>
                    <dd className="text-white/90">{row.count}</dd>
                  </div>
                ))}
                {view.skipCounts.map(row => (
                  <div key={row.reason} className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                    <dt className="text-white/70">{row.sentence}</dt>
                    <dd className="text-white/90">{row.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
