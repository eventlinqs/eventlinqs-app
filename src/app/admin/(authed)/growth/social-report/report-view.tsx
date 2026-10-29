import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { ADMIN_CELL, ADMIN_CELL_LABEL, ADMIN_CELL_NAME, ADMIN_ROW, ADMIN_TABLE, ADMIN_TABLE_WRAP, ADMIN_TBODY, ADMIN_THEAD } from '@/components/admin/table-card'
import { formatMoneyDisplay } from '@/lib/money/format'
import { formatPlatformDate, formatPlatformDateTime } from '@/lib/dates/event-time'
import { getCity } from '@/lib/cities/data'
import type { Decision, SocialReportPage } from '@/lib/growth/social-report'
import { weekOf } from '@/lib/growth/weekly-math'
import { KIND_NAMES, PLATFORM_METRICS, PLATFORMS, type EnteredTotals, type PieceReport, type Platform, type PlatformMetric, type WeekCounted } from '@/lib/growth/social-report-math'

/**
 * THE WEEKLY SOCIAL REPORT ON ONE SCREEN (J16, J17, G1 to G5, K14). Two sections that never share a figure: what
 * EventLinqs counted, and what Instagram and Facebook reported, entered by a person. Then each piece, the earlier
 * campaigns, at most three recommendations waiting for an answer, and what the numbers cannot see.
 *
 * Presentation only: page.tsx reads the rows and hands in the two presses, so this renders the same in a test.
 */

const number = (n: number) => new Intl.NumberFormat('en-AU').format(n)
const money = (cents: number) => formatMoneyDisplay(cents, 'AUD')
const kindName = (k: string) => KIND_NAMES[k] ?? k
const cityName = (slug: string) => getCity(slug)?.name ?? slug

export const PLATFORM_NAMES: Readonly<Record<Platform, string>> = { instagram: 'Instagram', facebook: 'Facebook' }
export const METRIC_NAMES: Readonly<Record<PlatformMetric, string>> = {
  reach: 'Reach',
  watch_time_seconds: 'Watch time (seconds)',
  saves: 'Saves',
  shares: 'Shares',
}

/** Each counted figure, its label and how the week before is said. A press out is a press, never a sale (K14). */
const COUNTED: readonly { key: keyof Omit<WeekCounted, 'liveByCity' | 'socialVisitorsByCity'>; label: string; show?: (n: number) => string; hint?: string }[] = [
  { key: 'visitors', label: 'Visitors to event pages' },
  { key: 'eventViews', label: 'Event page views' },
  { key: 'visitorsFromSocial', label: 'Visitors from social', hint: 'first touch on Instagram, Facebook or another social site' },
  { key: 'externalBookingClicks', label: 'Presses out to booking sites', hint: "a press to the organiser's own page, not a sale" },
  { key: 'nativeOrders', label: 'Orders on EventLinqs' },
  { key: 'nativeOrderCents', label: 'Order value on EventLinqs', show: money },
  { key: 'subscriptions', label: 'Subscribers confirmed' },
  { key: 'organiserEnquiries', label: 'Organiser enquiries' },
]

/** The earlier campaigns' columns; below lg each cell carries its own heading (src/components/admin/table-card.ts). */
const EARLIER_COLUMNS = ['Week of', 'Pieces that went', 'Visitors from social', 'Presses out', 'Orders on EventLinqs', 'Instagram reach (entered)'] as const

function against(now: number, then: WeekCounted | null, key: (typeof COUNTED)[number]['key'], show: (n: number) => string): string {
  if (then === null) return 'no earlier campaign counted'
  const was = then[key]
  if (was === null) return 'not counted the campaign before'
  return now === was ? `the same as the campaign before (${show(was)})` : `${show(was)} the campaign before`
}

function Section({ name, title, lead, children }: { name: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <section data-section={name} className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-white/60">{lead}</p>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function EnteredGrid({ totals }: { totals: EnteredTotals }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {PLATFORMS.map((platform) => (
        <div key={platform} data-platform={platform} className="rounded-lg border border-white/[0.08] p-4">
          <h3 className="font-display text-sm font-semibold text-white">{PLATFORM_NAMES[platform]}</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {PLATFORM_METRICS.map((metric) => {
              const t = totals[platform][metric]
              return (
                <div key={metric}>
                  <dt className="text-white/50">{METRIC_NAMES[metric]}</dt>
                  <dd data-entered={`${platform}.${metric}`} className="mt-1 text-white">
                    {t === null ? 'Not entered' : `${number(t.value)} over ${t.pieces} ${t.pieces === 1 ? 'piece' : 'pieces'}`}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      ))}
    </div>
  )
}

function PieceCard({ p, campaignId, readAtDefault, enterFigure }: { p: PieceReport; campaignId: string; readAtDefault: string; enterFigure: (f: FormData) => Promise<void> }) {
  return (
    <li data-piece={p.id} data-kind={p.kind} className="rounded-lg border border-white/[0.08] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-white">
          {kindName(p.kind)}, {cityName(p.city)}
          {p.partnerName ? `, ${p.partnerName}` : ''}
        </h3>
        <span data-went={p.posted ? 'yes' : 'no'} className="text-xs text-white/60">
          {p.posted && p.postedAt ? `Went ${formatPlatformDateTime(p.postedAt)}` : 'Not gone yet'}
        </span>
      </div>
      <p className="mt-1 text-xs text-white/50">
        For {p.audience}, {p.objective === 'organiser_growth' ? 'organiser growth' : 'audience growth'}. Measured by: {p.outcome}.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 text-sm lg:grid-cols-2">
        <div data-piece-counted>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Counted by EventLinqs</p>
          {p.counted === null ? (
            <p className="mt-1 text-white/70">{p.countedWords}</p>
          ) : (
            <p className="mt-1 text-white">
              {number(p.counted.arrived)} arrived through its link, {number(p.counted.pressedOut)} pressed out to a booking site, {number(p.counted.orders)}{' '}
              {p.counted.orders === 1 ? 'order' : 'orders'} on EventLinqs ({number(p.counted.tickets)} tickets, {money(p.counted.cents)}).
            </p>
          )}
          {p.goTaps !== null && p.claimsAfter !== null ? (
            <p data-piece-poster className="mt-1 text-white/70">
              {number(p.goTaps)} {p.goTaps === 1 ? 'tap' : 'taps'} through /go; {number(p.claimsAfter)} {p.claimsAfter === 1 ? 'claim' : 'claims'}. {p.claimsWords}
            </p>
          ) : null}
        </div>
        <div data-piece-entered>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Entered from the apps</p>
          <ul className="mt-1 space-y-1 text-white/80">
            {PLATFORMS.map((platform) => {
              const got = PLATFORM_METRICS.map((m) => ({ m, e: p.entered[platform][m] })).filter((x) => x.e !== null)
              return (
                <li key={platform}>
                  {PLATFORM_NAMES[platform]}:{' '}
                  {got.length === 0
                    ? 'nothing entered'
                    : got.map(({ m, e }) => `${METRIC_NAMES[m].toLowerCase()} ${number(e!.value)} (read ${formatPlatformDateTime(e!.readAt)})`).join(', ')}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      {p.posted ? (
        <form action={enterFigure} className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5" aria-label={`Enter a figure for ${kindName(p.kind)}, ${cityName(p.city)}`}>
          <input type="hidden" name="campaign" value={campaignId} />
          <input type="hidden" name="piece" value={p.id} />
          <label className="flex flex-col gap-1 text-white/60">
            Platform
            <select name="platform" className="min-h-11 rounded-md bg-[#0A1628] px-2 text-white">
              {PLATFORMS.map((x) => (
                <option key={x} value={x}>
                  {PLATFORM_NAMES[x]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-white/60">
            Figure
            <select name="metric" className="min-h-11 rounded-md bg-[#0A1628] px-2 text-white">
              {PLATFORM_METRICS.filter((m) => m !== 'watch_time_seconds' || p.kind === 'discovery_reel').map((m) => (
                <option key={m} value={m}>
                  {METRIC_NAMES[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-white/60">
            Number
            <input name="value" type="number" min={0} step={1} required inputMode="numeric" className="min-h-11 rounded-md bg-[#0A1628] px-2 text-white" />
          </label>
          <label className="flex flex-col gap-1 text-white/60">
            Read at
            <input name="readAt" type="datetime-local" required defaultValue={readAtDefault} className="min-h-11 rounded-md bg-[#0A1628] px-2 text-white" />
          </label>
          <button type="submit" className="min-h-11 self-end rounded-md bg-[var(--brand-accent)] px-3 font-semibold text-[#0A1628]">
            Keep figure
          </button>
        </form>
      ) : null}
    </li>
  )
}

function DecisionLine({ d }: { d: Decision }) {
  return (
    <p data-decided={d.decision} className="mt-3 text-sm text-white/70">
      {d.decision === 'approved' ? 'Approved' : 'Declined'} {formatPlatformDateTime(d.decidedAt)}. It changes nothing by itself.
    </p>
  )
}

export function SocialReportView({
  page,
  said,
  readAtDefault,
  enterFigure,
  decide,
}: {
  page: SocialReportPage
  said: string | null
  readAtDefault: string
  enterFigure: (f: FormData) => Promise<void>
  decide: (f: FormData) => Promise<void>
}) {
  const r = page.report
  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Weekly social report</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          What each piece of a weekly campaign did, beside the campaigns before it. What EventLinqs counted and what Instagram and Facebook reported are
          kept apart and never added together.
        </p>
        {page.campaigns.length > 0 ? (
          <nav aria-label="Campaign weeks" className="mt-4 flex flex-wrap gap-2 text-sm">
            {page.campaigns.map((c) => (
              <a
                key={c.id}
                href={`/admin/growth/social-report?campaign=${c.id}`}
                aria-current={r?.campaign.id === c.id ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-md border px-3 ${r?.campaign.id === c.id ? 'border-[var(--brand-accent)] text-white' : 'border-white/[0.12] text-white/70'}`}
              >
                Week of {formatPlatformDate(weekOf(c.weekStart).from)}
              </a>
            ))}
          </nav>
        ) : null}
        {said ? (
          <p role="status" data-said className="mt-4 rounded-md border border-white/[0.12] bg-[#0A1628] p-3 text-sm text-white">
            {said}
          </p>
        ) : null}
      </header>

      {r === null ? (
        <p data-state="no-campaign" className="text-sm text-white/70">
          No weekly campaign has been planned yet. Plan this week on the social page, and its report appears here.
        </p>
      ) : (
        <>
          <p data-baseline={r.baseline === null ? 'none' : String(r.baseline.campaigns)} className="mb-8 max-w-2xl text-sm text-white">
            {r.baselineWords}
          </p>

          <Section
            name="counted"
            title="Counted by EventLinqs"
            lead="From the platform's own records for the campaign's week, Monday to Sunday on the platform's clock. A figure for a week that has not begun is not counted, never zero."
          >
            {r.counted === null ? (
              <p data-counted="none" className="text-sm text-white/70">
                Not counted: this campaign&apos;s week has not begun.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {COUNTED.map((c) => {
                  const show = c.show ?? number
                  const value = r.counted![c.key]
                  if (value === null) return <AdminStatTile key={c.key} label={c.label} value="Not counted" hint="this database keeps no record of it yet" />
                  return <AdminStatTile key={c.key} label={c.label} value={show(value)} hint={c.hint ?? against(value, r.previous[0]?.counted ?? null, c.key, show)} />
                })}
              </div>
            )}
          </Section>

          <Section
            name="entered"
            title="Entered from Instagram and Facebook"
            lead="What each app reported, typed in by a person from its insights with when it was read, until Meta's app review lets EventLinqs read them. Added only to the same figure on the same platform."
          >
            <EnteredGrid totals={r.enteredTotals} />
          </Section>

          <Section name="pieces" title="Each piece" lead="One audience, one objective and one measured outcome a piece. A figure is entered only once the piece has gone.">
            {r.pieces.length === 0 ? (
              <p className="text-sm text-white/70">This campaign has no pieces.</p>
            ) : (
              <ul className="space-y-3">
                {r.pieces.map((p) => (
                  <PieceCard key={p.id} p={p} campaignId={r.campaign.id} readAtDefault={readAtDefault} enterFigure={enterFigure} />
                ))}
              </ul>
            )}
          </Section>

          <Section name="earlier" title="Earlier campaigns" lead="The campaigns before this one that went, newest first, counted the same way.">
            {r.previous.length === 0 ? (
              <p data-earlier="none" className="text-sm text-white/70">
                None yet.
              </p>
            ) : (
              <div className={ADMIN_TABLE_WRAP}>
                <table className={ADMIN_TABLE}>
                  <thead className={ADMIN_THEAD}>
                    <tr>
                      {EARLIER_COLUMNS.map((h) => (
                        <th key={h} scope="col" className="px-4 py-3 font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={ADMIN_TBODY}>
                    {r.previous.map((c) => {
                      const cells = [
                        number(c.piecesPosted),
                        c.counted === null ? 'Not counted' : number(c.counted.visitorsFromSocial),
                        c.counted === null ? 'Not counted' : number(c.counted.externalBookingClicks),
                        c.counted === null ? 'Not counted' : number(c.counted.nativeOrders),
                        c.enteredTotals.instagram.reach === null ? 'Not entered' : number(c.enteredTotals.instagram.reach.value),
                      ]
                      return (
                        <tr key={c.id} data-earlier={c.weekStart} className={ADMIN_ROW}>
                          <td className={`${ADMIN_CELL_NAME} text-white`}>
                            <span className={ADMIN_CELL_LABEL}>{EARLIER_COLUMNS[0]}</span>
                            {c.weekStart}
                          </td>
                          {cells.map((v, i) => (
                            <td key={EARLIER_COLUMNS[i + 1]} className={`${ADMIN_CELL} text-white/80`}>
                              <span className={ADMIN_CELL_LABEL}>{EARLIER_COLUMNS[i + 1]}</span>
                              {v}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section name="recommendations" title="Recommendations" lead={r.recommendationWords}>
            {r.recommendations.length === 0 ? null : (
              <ol className="space-y-4">
                {r.recommendations.map((rec) => {
                  const done = page.decisions.find((d) => d.rule === rec.rule)
                  return (
                    <li key={rec.rule} data-rule={rec.rule} className="rounded-lg border border-white/[0.08] p-4">
                      <p className="text-sm text-white">{rec.words}</p>
                      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-white/60 sm:grid-cols-2">
                        {Object.entries(rec.evidence).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <dt>{k}</dt>
                            <dd className="text-white/80">{typeof v === 'number' ? number(v) : v}</dd>
                          </div>
                        ))}
                      </dl>
                      {done ? (
                        <DecisionLine d={done} />
                      ) : (
                        <form action={decide} className="mt-3 flex flex-wrap gap-2">
                          <input type="hidden" name="campaign" value={r.campaign.id} />
                          <input type="hidden" name="rule" value={rec.rule} />
                          <button type="submit" name="decision" value="approved" className="min-h-11 rounded-md bg-[var(--brand-accent)] px-4 text-sm font-semibold text-[#0A1628]">
                            Approve
                          </button>
                          <button type="submit" name="decision" value="declined" className="min-h-11 rounded-md border border-white/[0.2] px-4 text-sm text-white">
                            Decline
                          </button>
                        </form>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </Section>

          <Section name="limits" title="What these numbers cannot see" lead="Said plainly, so no figure is read as more than it is.">
            <ul className="list-disc space-y-1 pl-5 text-sm text-white/70">
              {r.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  )
}
