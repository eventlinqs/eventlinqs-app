import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { readGrowthWeek } from '@/lib/growth/weekly'
import type { Best, WeekFigures } from '@/lib/growth/weekly-math'
import { TRAFFIC_CHANNEL_COPY, type TrafficChannel } from '@/lib/growth/traffic-channel'
import { formatMoneyDisplay } from '@/lib/money/format'
import { formatPlatformDate } from '@/lib/dates/event-time'
import { getCity } from '@/lib/cities/data'
import { ADMIN_CELL, ADMIN_CELL_LABEL, ADMIN_CELL_NAME, ADMIN_ROW, ADMIN_TABLE, ADMIN_TABLE_WRAP, ADMIN_TBODY, ADMIN_THEAD } from '@/components/admin/table-card'
import { readOrganiserFunnel } from '@/lib/growth/organiser-funnel'
import { readQaPresses } from '@/lib/growth/qa-presses'
import { readSupplyScorecard } from '@/lib/growth/supply-scorecard'
import { HORIZON_DAYS, WEEK_DAYS } from '@/lib/growth/supply-scorecard-math'
import { monthOf } from '@/lib/growth/organiser-funnel-math'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Growth | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * LAST WEEK ON ONE SCREEN: RELEVANCE, ATTENTION, ENGAGEMENT, CONVERSION AND
 * BUSINESS HEALTH, BESIDE THE WEEK BEFORE.
 *
 * The plan ("EventLinqs, the discovery-to-booking foundation", 27 October 2026):
 * "one growth page with the five, weekly", done when "Lawal reads last week's
 * numbers on one screen", and "Each Monday the page names the best city,
 * category and channel of last week". Every figure is a count of rows the
 * platform already keeps (src/lib/growth/weekly.ts reads them, weekly-math.ts
 * counts them); nothing is estimated. Revenue sits here, so the page asks for the
 * GMV screen's capability as well as the traffic screen's.
 */

const number = (n: number) => n.toLocaleString('en-AU')
const money = (cents: number) => formatMoneyDisplay(cents, 'AUD')

function against(now: number, then: number, show: (n: number) => string = number): string {
  if (now === then) return `the same as the week before (${show(then)})`
  return `${show(then)} the week before`
}

function bestWords(best: Best | null, what: string, label: (key: string) => string = (k) => k): string {
  return best === null ? `No ${what} had a visit last week.` : `${label(best.key)}, ${number(best.views)} ${best.views === 1 ? 'page view' : 'page views'}.`
}

const channelName = (key: string) => TRAFFIC_CHANNEL_COPY[key as TrafficChannel]?.label ?? key
const cityName = (slug: string) => getCity(slug)?.name ?? slug
const met = (yes: boolean) => (yes ? 'ok' : 'pending')
/** A YYYY-MM month in words, e.g. 'October 2026', on the platform's clock (the 15th sits inside the month in every zone). */
const monthWords = (m: string) => new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: PLATFORM_TIME_ZONE }).format(new Date(`${m}-15T12:00:00Z`))
const percent = (share: number) => `${Math.round(share * 100)} percent`

function Dimension({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <section data-dimension={title.toLowerCase().replace(/\s+/g, '-')} className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-white/60">{lead}</p>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  )
}

export default async function AdminGrowthPage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage') || !can(session, 'admin.pricing.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.growth.view', session })

  const [g, funnel, qa, supply] = await Promise.all([readGrowthWeek(), readOrganiserFunnel(), readQaPresses(), readSupplyScorecard()])
  const thisMonth = monthOf(funnel.readAt, PLATFORM_TIME_ZONE)
  const f: WeekFigures = g.lastFigures
  const b: WeekFigures = g.beforeFigures
  const lastSunday = new Date(new Date(g.last.to).getTime() - 1).toISOString()

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Last week</h1>
        <p data-week={g.last.monday} className="mt-2 max-w-2xl text-sm text-white/60">
          Monday {formatPlatformDate(g.last.from)} to Sunday {formatPlatformDate(lastSunday)}, on the platform&apos;s clock, beside the week before. Every
          figure is counted from the platform&apos;s own records; seed listings are never counted.
        </p>
      </header>

      <section data-section="learning-loop" className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">What worked last week</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-white/50">Best city</dt>
            <dd data-best="city" className="mt-1 text-white">{bestWords(g.best.city, 'city', cityName)}</dd>
          </div>
          <div>
            <dt className="text-white/50">Best category</dt>
            <dd data-best="category" className="mt-1 text-white">{bestWords(g.best.category, 'category')}</dd>
          </div>
          <div>
            <dt className="text-white/50">Best channel</dt>
            <dd data-best="channel" className="mt-1 text-white">{bestWords(g.best.channel, 'channel', channelName)}</dd>
          </div>
          <div>
            <dt className="text-white/50">Best post</dt>
            <dd data-best="post" data-stage="next" className="mt-1 text-white/70">
              Next stage, ready: named here once the week&apos;s posts are recorded by the social engine.
            </dd>
          </div>
        </dl>
      </section>

      <Dimension title="Relevance" lead="What people could find: listings live and still to come at the week's end, and the listings published during it.">
        <AdminStatTile label="Listings live" value={number(f.relevance.live)} hint={against(f.relevance.live, b.relevance.live)} />
        <AdminStatTile label="Published in the week" value={number(f.relevance.published)} hint={against(f.relevance.published, b.relevance.published)} />
      </Dimension>

      <Dimension
        title="Attention"
        lead="Who looked: distinct visitors to event pages and their page views. A visitor is the ledger's key, the address and browser together, so one person on two devices counts twice. Returning means seen in the 90 days before the week."
      >
        <AdminStatTile label="Visitors" value={number(f.attention.visitors)} hint={against(f.attention.visitors, b.attention.visitors)} />
        <AdminStatTile label="Returning visitors" value={number(f.attention.returning)} hint={against(f.attention.returning, b.attention.returning)} />
        <AdminStatTile label="Page views" value={number(f.attention.views)} hint={against(f.attention.views, b.attention.views)} />
      </Dimension>

      <Dimension title="Engagement" lead="What people did besides look: calendar adds, shares, follows, saves, and new subscribers who confirmed.">
        <AdminStatTile label="Calendar adds" value={number(f.engagement.calendarAdds)} hint={against(f.engagement.calendarAdds, b.engagement.calendarAdds)} />
        <AdminStatTile label="Shares" value={number(f.engagement.shares)} hint={against(f.engagement.shares, b.engagement.shares)} />
        <AdminStatTile label="Follows" value={number(f.engagement.follows)} hint={against(f.engagement.follows, b.engagement.follows)} />
        <AdminStatTile label="Saves" value={number(f.engagement.saves)} hint={against(f.engagement.saves, b.engagement.saves)} />
        <AdminStatTile label="New subscribers" value={number(f.engagement.subscribers)} hint={against(f.engagement.subscribers, b.engagement.subscribers)} />
      </Dimension>

      <Dimension
        title="Conversion"
        lead="Who bought: paid orders on EventLinqs and what they came to, and orders for every 100 visitors. Clicks out to another booking site are counted once the tracked button is live."
      >
        <AdminStatTile label="Paid orders" value={number(f.conversion.orders)} hint={against(f.conversion.orders, b.conversion.orders)} />
        <AdminStatTile label="Order value" value={money(f.conversion.orderValueCents)} hint={against(f.conversion.orderValueCents, b.conversion.orderValueCents, money)} />
        <AdminStatTile
          label="Orders per 100 visitors"
          value={f.conversion.ordersPer100Visitors === null ? 'No visitors' : f.conversion.ordersPer100Visitors.toLocaleString('en-AU')}
          hint={b.conversion.ordersPer100Visitors === null ? 'no visitors the week before' : `${b.conversion.ordersPer100Visitors.toLocaleString('en-AU')} the week before`}
        />
      </Dimension>

      <Dimension
        title="Business health"
        lead="What the platform earned: its fee on the week's orders, the refunds completed, the contribution margin (the fee the platform kept, less Stripe's processing estimate, over the orders that record both), and the organisers who sold."
      >
        <AdminStatTile label="Fee revenue" value={money(f.health.feeRevenueCents)} hint={against(f.health.feeRevenueCents, b.health.feeRevenueCents, money)} />
        <AdminStatTile
          label="Contribution margin"
          value={money(f.health.marginCents)}
          hint={f.health.marginUnrecorded === 0 ? against(f.health.marginCents, b.health.marginCents, money) : `${number(f.health.marginUnrecorded)} ${f.health.marginUnrecorded === 1 ? 'order does' : 'orders do'} not record it`}
          status={f.health.marginCents > 0 ? 'ok' : 'pending'}
        />
        <AdminStatTile label="Refunded" value={money(f.health.refundedCents)} hint={against(f.health.refundedCents, b.health.refundedCents, money)} />
        <AdminStatTile label="Organisers who sold" value={number(f.health.organisersSold)} hint={against(f.health.organisersSold, b.health.organisersSold)} />
        <AdminStatTile
          label="Of them, sold before"
          value={number(f.health.organisersSoldBefore)}
          hint={f.health.organisersSold === 0 ? 'nobody sold last week' : `of ${number(f.health.organisersSold)} who sold`}
        />
      </Dimension>

      <Dimension
        title="Victoria, the state scorecard"
        lead="Whether the next state can open (the plan, Expansion): 50 recurring events, repeat organisers, returning visitors up and a positive margin, each counted on the listings in Victoria's cities."
      >
        <AdminStatTile
          label="Recurring events live"
          value={`${number(g.victoria.recurringLive)} of ${number(g.victoria.recurringTarget)}`}
          hint="listings that repeat, still to come"
          status={met(g.victoria.recurringLive >= g.victoria.recurringTarget)}
        />
        <AdminStatTile label="Repeat organisers" value={number(g.victoria.repeatOrganisers)} hint="two or more listings published" />
        <AdminStatTile label="Returning visitors" value={g.victoria.returningUp ? 'Up' : 'Not up'} hint="last week against the week before" status={met(g.victoria.returningUp)} />
        <AdminStatTile label="Margin" value={g.victoria.marginPositive ? 'Positive' : 'Not positive'} hint="last week" status={met(g.victoria.marginPositive)} />
      </Dimension>

      <section data-section="supply-by-city" className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">Supply by city, this week</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Verified upcoming means published, still listed, starting in the next {HORIZON_DAYS} days and checked against its source recently enough to
          stay listed. Expiring means that check lapses within {WEEK_DAYS} days. Images counted are the organiser&apos;s own, never a library
          photograph or a cover EventLinqs set in type. Seed listings are never counted.
        </p>
        <div className={`mt-5 ${ADMIN_TABLE_WRAP}`}>
          <table data-table="supply-by-city" className={ADMIN_TABLE}>
            <thead className={ADMIN_THEAD}>
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">City</th>
                <th scope="col" className="px-4 py-3 font-medium">Verified upcoming</th>
                <th scope="col" className="px-4 py-3 font-medium">New</th>
                <th scope="col" className="px-4 py-3 font-medium">Expiring</th>
                <th scope="col" className="px-4 py-3 font-medium">Cancelled</th>
                <th scope="col" className="px-4 py-3 font-medium">Awaiting check</th>
                <th scope="col" className="px-4 py-3 font-medium">Own images</th>
                <th scope="col" className="px-4 py-3 font-medium">Organisers</th>
                <th scope="col" className="px-4 py-3 font-medium">Recurring</th>
              </tr>
            </thead>
            <tbody className={ADMIN_TBODY}>
              {supply.cities.map((c) => (
                <tr key={c.city} data-city={c.city} className={ADMIN_ROW}>
                  <th scope="row" className={`${ADMIN_CELL_NAME} text-left font-medium text-white`}>
                    {cityName(c.city)}
                  </th>
                  <td className={`${ADMIN_CELL} text-white/80`}>
                    <span className={ADMIN_CELL_LABEL}>Verified upcoming</span>
                    {number(c.verifiedUpcoming)}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/80`}>
                    <span className={ADMIN_CELL_LABEL}>New</span>
                    {number(c.newThisWeek)}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/80`}>
                    <span className={ADMIN_CELL_LABEL}>Expiring</span>
                    {number(c.expiringSoon)}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/80`}>
                    <span className={ADMIN_CELL_LABEL}>Cancelled</span>
                    {number(c.cancelledThisWeek)}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/80`}>
                    <span className={ADMIN_CELL_LABEL}>Awaiting check</span>
                    {number(c.awaitingVerification)}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/80`}>
                    <span className={ADMIN_CELL_LABEL}>Own images</span>
                    {number(c.withApprovedImagery)}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/80`}>
                    <span className={ADMIN_CELL_LABEL}>Organisers</span>
                    {number(c.activeOrganisers)}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/80`}>
                    <span className={ADMIN_CELL_LABEL}>Recurring</span>
                    {number(c.recurringSuppliers)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {supply.waitingWithNoCity > 0 ? (
          <p data-state="waiting-with-no-city" className="mt-3 text-sm text-amber-300">
            {number(supply.waitingWithNoCity)} collected {supply.waitingWithNoCity === 1 ? 'event waits' : 'events wait'} from a source with no city, so{' '}
            {supply.waitingWithNoCity === 1 ? 'it is' : 'they are'} not in any row above.
          </p>
        ) : null}

        <h3 className="mt-8 font-display text-base font-semibold text-white">Gaps: categories with nothing verified upcoming</h3>
        <ul className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {supply.cities.map((c) => (
            <li key={c.city} data-gaps={c.city} className="rounded-lg border border-white/[0.06] p-4">
              <p className="font-medium text-white">{cityName(c.city)}</p>
              <p className="mt-1 text-white/60">{c.gaps.length === 0 ? 'Every category has a verified upcoming night.' : c.gaps.join(', ')}</p>
            </li>
          ))}
        </ul>
      </section>

      <section data-section="organiser-funnel" className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">Organisers, from found to reported</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Each organiser counts at the stages recorded for them, read now from the table that stage&apos;s owner keeps. One who claimed without an invitation
          counts at claimed and not at invited, so a step can read over 100 percent. A stage whose table is not on this database is not counted, never 0.
        </p>
        <ol className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {funnel.steps.map((step, i) => (
            <li key={step.stage} data-stage={step.stage} className="rounded-lg border border-white/[0.06] p-4">
              <p className="text-white/50">
                {i + 1}. {step.words}
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-white">{step.organisers === null ? 'Not counted' : number(step.organisers)}</p>
              <p className="mt-1 text-white/60">
                {step.organisers === null
                  ? 'Its table is not on this database yet.'
                  : step.fromBefore === null
                    ? i === 0
                      ? 'Real hosts on record.'
                      : 'No share: the step before has none or is not counted.'
                    : `${percent(step.fromBefore)} of the step before`}
              </p>
            </li>
          ))}
        </ol>

        <h3 className="mt-8 font-display text-base font-semibold text-white">Events per active organiser</h3>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          An organiser is active in a month when a public night of theirs starts in it. Organisations that hold their own nights only: the EventLinqs listings
          account, which holds every curated night whatever its host, and seed listings are left out.
        </p>
        <div className={`mt-4 ${ADMIN_TABLE_WRAP}`}>
          <table data-table="events-per-active-organiser" className={ADMIN_TABLE}>
            <thead className={ADMIN_THEAD}>
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Month</th>
                <th scope="col" className="px-4 py-3 font-medium">Active organisers</th>
                <th scope="col" className="px-4 py-3 font-medium">Public nights</th>
                <th scope="col" className="px-4 py-3 font-medium">Per active organiser</th>
              </tr>
            </thead>
            <tbody className={ADMIN_TBODY}>
              {funnel.months.map((m) => (
                <tr key={m.month} data-month={m.month} className={ADMIN_ROW}>
                  <th scope="row" className={`${ADMIN_CELL_NAME} text-left font-medium text-white`}>
                    {monthWords(m.month)}
                    {m.month === thisMonth ? ', so far' : ''}
                  </th>
                  <td className={`${ADMIN_CELL} text-white/80`}>
                    <span className={ADMIN_CELL_LABEL}>Active organisers</span>
                    {number(m.activeOrganisers)}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/80`}>
                    <span className={ADMIN_CELL_LABEL}>Public nights</span>
                    {number(m.nights)}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/80`}>
                    <span className={ADMIN_CELL_LABEL}>Per active organiser</span>
                    {m.perActive === null ? 'No organiser active' : m.perActive.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p data-state="qa-presses" className="mb-4 text-sm text-white/50">
        QA presses in the last 7 days, made by test drives with a verified marker and left out of every figure on this
        page: {number(qa.shareEvents)} on share links and booking buttons, {number(qa.goPresses)} on /go.
      </p>

      {g.unreadVisitRows > 0 ? (
        <p data-state="unread-rows" className="text-sm text-amber-300">
          {number(g.unreadVisitRows)} page view {g.unreadVisitRows === 1 ? 'row' : 'rows'} could not be read as an event, a visitor and a day, and {g.unreadVisitRows === 1 ? 'is' : 'are'} left out.
        </p>
      ) : null}
    </div>
  )
}
