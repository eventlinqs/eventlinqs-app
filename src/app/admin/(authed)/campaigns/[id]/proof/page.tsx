import { notFound, redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readCampaignerConfig } from '@/lib/campaigner/config'
import { readProof } from '@/lib/proof/read'
import { FIGURE } from '@/lib/proof/compose'
import { feeBasisSentence, presentAll, producedByUsLines, reversalLines } from '@/lib/proof/present'
import { formatPlatformDate } from '@/lib/dates/event-time'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Campaign proof | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * WHAT THIS CAMPAIGN PRODUCED, AND THE FEE AGAINST IT.
 *
 * Close-out GA5. A client will not keep paying a commission they cannot check,
 * so every figure on this page is read from the order ledger, the attribution
 * records and the fee configuration, and every one of them expands to the rows
 * it came from. Nothing here is typed and nothing here is formatted by this
 * file: the numbers and the words both arrive from `src/lib/proof/present.ts`,
 * which is what lets the literal scan mean something.
 *
 * THE LAYOUT, and the two directions that lost, recorded in BUILD-LOG-B.md:
 * this is ONE CLAIM AND ITS WORKING. The revenue we produced is the only large
 * thing on the screen, the fee sits directly beneath it with its basis in one
 * sentence, and everything else is a short stack underneath that a person opens
 * when they want to argue with it. A dashboard of equal tiles makes the fee one
 * number among eight; a printed statement reads as a bill already issued.
 *
 * A FIGURE THAT CANNOT BE SOURCED RENDERS AS WORDS, never as a zero or a dash,
 * and the fee is WITHHELD rather than shown partial when the revenue it rests
 * on cannot be reconciled to the money ledger.
 */

type Props = { params: Promise<{ id: string }> }

export default async function CampaignProofPage({ params }: Props) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')

  const { id } = await params
  const config = await readCampaignerConfig()
  if (!config.proofPageEnabled) notFound()

  const read = await readProof(id)
  if (!read) notFound()
  await recordAuditEvent({ action: 'admin.campaigns.proof.view', session, metadata: { campaignId: id } })

  const { campaign, result, commissionPercent, unsourced } = read
  const figures = presentAll(result, campaign.currency)
  const headline = figures[FIGURE.PRODUCED_BY_US]
  const fee = figures[FIGURE.FEE_DUE]
  const orders = producedByUsLines(result, campaign.currency)
  const reversals = reversalLines(result, campaign.currency)
  const nothingHasLeft = result.figures[FIGURE.SENDS_DISPATCHED].value === 0

  const secondary = [
    figures[FIGURE.PRODUCED_ELSEWHERE],
    figures[FIGURE.REVERSED],
    figures[FIGURE.COST_PER_SALE],
    figures[FIGURE.SENDS_DISPATCHED],
    figures[FIGURE.LEDGER_NET],
  ]

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-10">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Campaign proof</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">{campaign.name}</h1>
        <p className="mt-2 text-sm text-white/60">
          {campaign.organisationName}, {campaign.eventTitle}. Measured from{' '}
          {formatPlatformDate(campaign.windowFrom)}, the day this campaign was created, to now.
        </p>
      </header>

      {unsourced.length > 0 && (
        <p role="alert" className="mb-8 rounded-xl border border-rose-500/40 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
          This page is holding back {unsourced.join(', ')}, because it could not name where the
          figure came from. Nothing on this page is shown without its source.
        </p>
      )}

      {nothingHasLeft ? (
        <section className="rounded-2xl border border-white/[0.08] bg-[#131A2A] p-10 text-center">
          <h2 className="font-display text-xl font-semibold text-white">This campaign has not sent anything yet</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/60">
            There is nothing to prove until a message has left. Approve the segment on the campaign
            screen and run the pacing once, and this page fills itself from the sales that follow.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-white/[0.08] bg-[#131A2A] px-8 py-10">
            <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">{headline.label}</p>
            {headline.unavailable ? (
              <p className="mt-4 text-lg leading-relaxed text-white/80">{headline.display}</p>
            ) : (
              <p className="mt-3 font-display text-5xl font-bold leading-none tracking-tight text-white sm:text-6xl">
                {headline.display}
              </p>
            )}

            <div className="mt-8 border-t border-white/[0.08] pt-6">
              <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">{fee.label}</p>
              {fee.unavailable ? (
                <>
                  <p className="mt-3 text-base leading-relaxed text-amber-200">{fee.display}</p>
                  {fee.border && <p className="mt-2 text-xs text-white/40">{fee.border}</p>}
                </>
              ) : (
                <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--brand-accent)]">
                  {fee.display}
                </p>
              )}
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60">
                {feeBasisSentence(commissionPercent)}
              </p>
            </div>

            <details className="group mt-6 border-t border-white/[0.08] pt-5">
              <summary className="min-h-[44px] cursor-pointer list-none py-2 text-sm text-white/70 outline-none transition hover:text-white focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]">
                The {orders.length === 1 ? 'sale' : 'sales'} behind it
              </summary>
              {orders.length === 0 ? (
                <p className="mt-3 text-sm text-white/55">
                  No sale is tied to this campaign by evidence yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {orders.map(order => (
                    <li key={order.reference} className="rounded-lg border border-white/[0.06] bg-[#0A1628] px-4 py-3">
                      <p className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
                        <span className="font-mono text-white/85">{order.reference}</span>
                        <span className="text-white/90">{order.amount}</span>
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-white/60">{order.why}</p>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </section>

          <section className="mt-8 space-y-3">
            {secondary.map(figure => (
              <details
                key={figure.key}
                className="rounded-xl border border-white/[0.08] bg-[#131A2A] px-5 py-4"
              >
                <summary className="flex min-h-[44px] cursor-pointer list-none flex-wrap items-baseline justify-between gap-3 py-1 outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]">
                  <span className="text-sm text-white/70">{figure.label}</span>
                  <span className={figure.unavailable ? 'text-sm text-amber-200' : 'font-display text-lg text-white'}>
                    {figure.unavailable ? 'Not recorded' : figure.display}
                  </span>
                </summary>
                <div className="mt-3 border-t border-white/[0.06] pt-3">
                  {figure.unavailable ? (
                    <>
                      <p className="text-sm leading-relaxed text-white/70">{figure.display}</p>
                      {figure.border && <p className="mt-2 text-xs text-white/40">{figure.border}</p>}
                    </>
                  ) : (
                    <p className="text-sm leading-relaxed text-white/60">
                      {figure.sourceSentence}. {figure.rowCount === 1 ? 'One row' : `${figure.rowCount} rows`}.
                    </p>
                  )}
                  {figure.key === FIGURE.REVERSED && reversals.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {reversals.map(reversal => (
                        <li
                          key={`${reversal.reference}-${reversal.reason}`}
                          className="flex flex-wrap items-baseline justify-between gap-3 text-sm"
                        >
                          <span className="font-mono text-white/80">{reversal.reference}</span>
                          <span className="text-white/60">{reversal.reason}</span>
                          <span className="text-white/85">{reversal.amount}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {figure.key === FIGURE.SENDS_DISPATCHED && result.sendsByChannel.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {result.sendsByChannel.map(channel => (
                        <li key={channel.channelCode} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-white/70">{channel.channelCode}</span>
                          <span className="text-white/85">{channel.dispatched}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
