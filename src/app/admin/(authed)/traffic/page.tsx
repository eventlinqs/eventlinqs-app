import Link from 'next/link'
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { readTrafficSummary } from '@/lib/growth/organic-reach'
import {
  TRAFFIC_WINDOWS,
  parseWindow,
  windowLabel,
  type ChannelTotals,
  type TrafficWindow,
} from '@/lib/growth/organic-reach-math'
import { TRAFFIC_CHANNEL_COPY } from '@/lib/growth/traffic-channel'
import { SOURCE_CATEGORY_FETCHED_ON, SOURCE_CATEGORY_PROVENANCE } from '@/lib/growth/source-categories.generated'
import { formatPlatformDate } from '@/lib/dates/event-time'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Free traffic | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * IS THE SEARCH WORK PAYING FOR ITSELF, AND IS IT SEARCH OR IS IT PEOPLE WHO
 * ALREADY KNEW US.
 *
 * Close-out AQ3, lane B's half. AQ3's acceptance line is "organic attributed
 * orders reported separately from direct", and that separation is the whole
 * point of the page: a platform that adds the two together can grow its direct
 * traffic for a year and believe its search work is compounding.
 *
 * NO CLIENT JAVASCRIPT. The window is four links, so the address bar carries
 * the period and the page can be sent to somebody. The admin console has one
 * dark surface and no theme switch, and this is built to it rather than
 * inventing a second theme on one screen.
 *
 * EVERY NUMBER IS THE LEDGER'S. Nothing here comes from an analytics tool, and
 * nothing here depends on the consent banner: a referring host is not
 * identifying, so it is recorded whatever the visitor answered. That is what
 * AQ3 means by traffic that belongs to the platform.
 */

type Props = { searchParams: Promise<{ days?: string }> }

function windowHref(days: TrafficWindow): string {
  return `/admin/traffic?days=${days}`
}

function number(value: number): string {
  return value.toLocaleString('en-AU')
}

/** A rate, or the words for "we cannot know". Never a 0 standing in for both. */
function rateText(value: number | null): string {
  return value === null ? 'no visits' : `${value.toLocaleString('en-AU')} per 100`
}

/**
 * ONE CELL, WHICH IS A TABLE CELL ON A LAPTOP AND A LABELLED LINE ON A PHONE.
 *
 * THE DEFECT THIS EXISTS TO FIX, seen in the driven capture rather than argued.
 * The first version was a plain table with `min-w-[40rem]` inside an
 * `overflow-x-auto`. At 390 that put EVERY FIGURE off the right-hand edge behind
 * a scroll nobody can see, so the one screen whose entire purpose is four
 * numbers per channel showed a phone none of them. The page passed its own
 * horizontal-overflow check the whole time, because the overflow was inside a
 * container and the document fitted perfectly.
 *
 * So the cell carries its own label, hidden from md upwards where the column
 * header says the same thing, and it is announced to assistive technology only
 * once: the header row is a real `<thead>` at every width, and the repeated
 * label is `aria-hidden`.
 */
function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <td className="flex items-baseline justify-between gap-6 py-1 tabular-nums text-white/80 md:table-cell md:py-3 md:pr-4 md:text-right md:align-top">
      <span aria-hidden className="text-[11px] uppercase tracking-[0.16em] text-white/50 md:hidden">
        {label}
      </span>
      <span>{children}</span>
    </td>
  )
}

function ChannelRow({ row }: { row: ChannelTotals }) {
  const copy = TRAFFIC_CHANNEL_COPY[row.channel]
  return (
    <tr className="block border-t border-white/[0.06] py-4 md:table-row md:py-0">
      <th scope="row" className="block pb-2 pr-4 text-left md:table-cell md:py-3 md:align-top">
        <span className="font-display text-sm font-semibold text-white">{copy.label}</span>
        <span className="mt-1 block max-w-md text-xs font-normal text-white/50">{copy.meaning}</span>
      </th>
      <Figure label="Visits">{number(row.visits)}</Figure>
      <Figure label="Orders">{number(row.orders)}</Figure>
      <Figure label="Tickets">{number(row.tickets)}</Figure>
      <Figure label="Orders per 100 visits">{rateText(row.ordersPerHundredVisits)}</Figure>
    </tr>
  )
}

export default async function AdminTrafficPage({ searchParams }: Props) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.traffic.view', session })

  const { days: rawDays } = await searchParams
  const days = parseWindow(rawDays)
  const { summary, since, topHosts, unresolvedSaleRows } = await readTrafficSummary(days)

  const organic = summary.organicSearch
  const direct = summary.direct
  const nothingYet = summary.totals.visits === 0 && summary.totals.orders === 0

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Free traffic</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Where the people who look at event pages came from, and which of those channels produced
          orders. Search traffic nobody paid for is counted separately from people who arrived with
          no referring site at all, because adding the two together is how a platform convinces
          itself its search work is compounding when it is not.
        </p>
      </header>

      <nav aria-label="Period" className="mb-8 flex flex-wrap gap-2">
        {TRAFFIC_WINDOWS.map(option => {
          const selected = option === days
          return (
            <Link
              key={option}
              href={windowHref(option)}
              aria-current={selected ? 'page' : undefined}
              className={
                selected
                  ? 'inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)]'
                  : 'inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white/70 transition-colors hover:border-white/40 hover:text-white'
              }
            >
              {windowLabel(option)}
            </Link>
          )
        })}
      </nav>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatTile
          label="Organic search visits"
          value={number(organic.visits)}
          hint="visitor days on event pages"
          status={organic.visits > 0 ? 'ok' : 'pending'}
        />
        <AdminStatTile
          label="Organic search orders"
          value={number(organic.orders)}
          hint={`${rateText(organic.ordersPerHundredVisits)} visits`}
          status={organic.orders > 0 ? 'ok' : 'pending'}
        />
        <AdminStatTile
          label="Direct visits"
          value={number(direct.visits)}
          hint="no referring site, no campaign label"
        />
        <AdminStatTile
          label="Direct orders"
          value={number(direct.orders)}
          hint={`${rateText(direct.ordersPerHundredVisits)} visits`}
        />
      </div>

      <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">Every channel</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          A visit is one visitor, one event page, one day, which is how the demand beacon records
          it, so somebody who refreshes a page nine times counts once. An order is counted once
          however many ticket types it holds.
        </p>

        {nothingYet ? (
          <p className="mt-6 rounded-lg border border-white/[0.08] bg-white/[0.02] p-5 text-sm text-white/70">
            Nothing has been recorded in this period. Event pages write a row the first time each
            visitor opens them, so this fills as soon as there is traffic. Try a longer period, or
            check that events are published.
          </p>
        ) : (
          /*
           * `relative` IS LOAD-BEARING, NOT DECORATION. The caption below is
           * `sr-only`, which is `position: absolute`, and an absolutely
           * positioned element is clipped by an ancestor's overflow ONLY when
           * that ancestor is its containing block. Overflow alone does not make
           * one. Without it the label is laid out at its position in the FULL
           * table width, outside the scroller, and the document grows to fit
           * it: lane C measured 569px against a 390px viewport on /admin/users
           * that way, which renders the whole screen at about 69 per cent.
           * `sr-only-cannot-escape-a-scroller` fails the build on it.
           *
           * AND THIS IS A JS COMMENT RATHER THAN A `{/* *\/}` ONE, because a
           * JSX comment inside a ternary's parentheses is a SECOND expression
           * where only one is allowed. I made exactly that mistake on
           * /admin/pricing this morning and every admin route answered 500.
           */
          <div className="relative mt-6 md:overflow-x-auto">
            <table className="w-full border-collapse text-sm md:min-w-[40rem]">
              <caption className="sr-only">
                Event page visits, orders and tickets by traffic channel, {windowLabel(days)}
              </caption>
              <thead className="sr-only md:not-sr-only">
                <tr className="text-[11px] uppercase tracking-[0.16em] text-white/50">
                  <th scope="col" className="pb-3 pr-4 text-left font-normal">Channel</th>
                  <th scope="col" className="pb-3 pr-4 text-right font-normal">Visits</th>
                  <th scope="col" className="pb-3 pr-4 text-right font-normal">Orders</th>
                  <th scope="col" className="pb-3 pr-4 text-right font-normal">Tickets</th>
                  <th scope="col" className="pb-3 text-right font-normal">Orders per 100 visits</th>
                </tr>
              </thead>
              <tbody>
                {summary.active.map(row => (
                  <ChannelRow key={row.channel} row={row} />
                ))}
                <tr className="block border-t border-white/20 py-4 font-semibold md:table-row md:py-0">
                  <th
                    scope="row"
                    className="block pb-2 pr-4 text-left font-display text-sm font-semibold text-white md:table-cell md:py-3"
                  >
                    Total
                  </th>
                  <Figure label="Visits">{number(summary.totals.visits)}</Figure>
                  <Figure label="Orders">{number(summary.totals.orders)}</Figure>
                  <Figure label="Tickets">{number(summary.totals.tickets)}</Figure>
                  <Figure label="Orders per 100 visits">{rateText(summary.totals.ordersPerHundredVisits)}</Figure>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {summary.silent.length > 0 ? (
          <p className="mt-5 text-xs text-white/50">
            Recorded nothing in this period:{' '}
            {summary.silent.map(channel => TRAFFIC_CHANNEL_COPY[channel].label).join(', ')}.
          </p>
        ) : null}

        {unresolvedSaleRows > 0 ? (
          <p className="mt-3 text-xs text-amber-300">
            {number(unresolvedSaleRows)} sale row{unresolvedSaleRows === 1 ? '' : 's'} could not be
            traced back to an order, so {unresolvedSaleRows === 1 ? 'it is' : 'they are'} counted
            separately rather than dropped. That is worth looking into.
          </p>
        ) : null}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
          <h2 className="font-display text-lg font-semibold text-white">Who sent them</h2>
          <p className="mt-2 text-sm text-white/60">
            The referring sites behind those visits, busiest first. A host only, never the search
            somebody typed or the page they were on.
          </p>
          {topHosts.length === 0 ? (
            <p className="mt-5 text-sm text-white/60">
              No visit in this period carried a referring site. Everything arrived direct, or with a
              campaign label and no referrer.
            </p>
          ) : (
            <ul className="mt-5 space-y-3">
              {topHosts.map(host => (
                <li key={host.host} className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0 truncate text-sm text-white/85">{host.host}</span>
                  <span className="shrink-0 text-xs text-white/50">
                    {TRAFFIC_CHANNEL_COPY[host.channel].label}
                    <span className="ml-3 tabular-nums text-white/80">{number(host.visits)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
          <h2 className="font-display text-lg font-semibold text-white">How a channel is decided</h2>
          <p className="mt-2 text-sm text-white/60">
            Which sites count as search engines is not something this platform is entitled to decide
            for itself, so it does not. The rules, and the list of sites each rule matches, are the
            default channel group Google publishes, fetched into the build and checked by a guard on
            every release. The list was last confirmed on{' '}
            {formatPlatformDate(SOURCE_CATEGORY_FETCHED_ON)}.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-white/70">
            <li>
              <a
                href={SOURCE_CATEGORY_PROVENANCE.rules}
                className="font-semibold text-[var(--brand-accent)] underline underline-offset-2"
                rel="noreferrer noopener"
                target="_blank"
              >
                The channel rules
              </a>
            </li>
            <li>
              <a
                href={SOURCE_CATEGORY_PROVENANCE.table}
                className="font-semibold text-[var(--brand-accent)] underline underline-offset-2"
                rel="noreferrer noopener"
                target="_blank"
              >
                The list of sites and what each one is
              </a>
            </li>
          </ul>
          <p className="mt-5 text-xs text-white/50">
            Where a rule needs something this platform does not hold, the rule is left out rather
            than approximated, and a visit it would have claimed stays a referral. So this
            under-reports search rather than flattering it.
            {since ? ` Counting from ${formatPlatformDate(since)}.` : ' Counting the whole ledger.'}
          </p>
        </div>
      </section>
    </div>
  )
}
