import type { PaceCurve } from '@/lib/ledger/pace'

/**
 * HOW YOUR TICKETS SOLD. Close-out D1, the panel an organiser actually looks at.
 *
 * Every number here is read out of the slot ledger and nowhere else. That is the
 * whole point of the ledger: `sold 240` cannot say WHEN those 240 sold, what
 * they paid, or how many people reached checkout and gave up, and by the time
 * anybody asks, the rows that could have told you were overwritten as they
 * changed.
 *
 * THE CHART DECISIONS, and why each one is what it is.
 *
 *   TWO CHARTS, NEVER TWO AXES. Cumulative sales and price are measures of
 *   different scale, and putting them on one plot with two y-scales is the
 *   single most common way a chart lies: the crossing point is an artefact of
 *   where you put the axes. They are two plots sharing one x-domain instead, so
 *   a reader compares by looking down rather than by trusting a scale.
 *
 *   ONE SERIES PER PLOT, so there is no legend to read and no colour to decode.
 *   The heading names the line.
 *
 *   NO CHART FOR THE ABANDONMENT. Three numbers are three numbers. Drawing them
 *   as a chart would make them harder to read, not easier.
 *
 *   NO JAVASCRIPT. The hover is an SVG <title> on a generous invisible target,
 *   which every browser turns into a tooltip and every screen reader announces,
 *   and the whole series is also a real table underneath. The Lighthouse mobile
 *   gate is a blocking check on this platform, and a charting library on an
 *   organiser's dashboard is a cost the reader never asked for.
 *
 *   NO NEW COLOURS. Navy for the line on the canvas, gold-800 for the price,
 *   both from globals.css. One series per plot, so the categorical separation
 *   rules do not apply; what does apply is contrast against the surface, and
 *   both clear 3:1 comfortably.
 */

type Props = {
  curve: PaceCurve | null
  currency?: string
}

const money = (cents: number, currency = 'AUD') =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)

/** The plot area, in the SVG's own units. The viewBox scales it to any width. */
const W = 640
const H = 180
const PAD = { top: 12, right: 12, bottom: 26, left: 40 }

function path(points: Array<{ x: number; y: number }>): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

export function SalesPacePanel({ curve, currency = 'AUD' }: Props) {
  /*
   * NOTHING RECORDED IS A REAL ANSWER AND IS SAID AS ONE. An event that sold out
   * before this ledger existed did not sell nothing, and telling its organiser
   * it did would be a lie the panel has no business telling.
   */
  if (!curve || curve.points.length === 0) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white p-6">
        <h2 className="text-base font-semibold text-ink-900">How your tickets sold</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          {curve
            ? 'Nothing has sold yet. As soon as the first ticket goes, this fills in with the day it sold, the price it sold at, and how many people reached checkout without finishing.'
            : 'This event was created before the platform started keeping a sales history, so there is nothing to draw. Everything from here on is recorded.'}
        </p>
      </div>
    )
  }

  const maxDays = Math.max(...curve.points.map(p => p.daysOut))
  const minDays = Math.min(...curve.points.map(p => p.daysOut))
  const span = Math.max(1, maxDays - minDays)
  const maxUnits = Math.max(1, ...curve.points.map(p => p.cumulativeUnits))

  // Days count DOWN towards the slot, so the axis runs furthest-out on the left
  // to the day itself on the right, the way a person reads a calendar.
  const x = (daysOut: number) => PAD.left + ((maxDays - daysOut) / span) * (W - PAD.left - PAD.right)
  const y = (units: number) => H - PAD.bottom - (units / maxUnits) * (H - PAD.top - PAD.bottom)

  const line = curve.points.map(p => ({ x: x(p.daysOut), y: y(p.cumulativeUnits) }))
  const last = curve.points[curve.points.length - 1]

  const priced = curve.points.filter(p => p.unitAmountCents !== null)
  const maxPrice = Math.max(1, ...priced.map(p => p.unitAmountCents as number))
  const priceY = (cents: number) => H - PAD.bottom - (cents / maxPrice) * (H - PAD.top - PAD.bottom)
  const priceLine = priced.map(p => ({ x: x(p.daysOut), y: priceY(p.unitAmountCents as number) }))

  const dayLabel = (daysOut: number) => (daysOut === 0 ? 'the day itself' : `${daysOut} day${daysOut === 1 ? '' : 's'} out`)

  return (
    <div className="rounded-xl border border-ink-100 bg-white">
      <header className="border-b border-ink-100 px-5 py-4">
        <h2 className="text-base font-semibold text-ink-900">How your tickets sold</h2>
        <p className="mt-1 text-sm text-ink-600">
          {curve.totals.units} sold, {money(curve.totals.amountCents, currency)} taken
          {curve.totals.unitsReturned > 0 ? `, ${curve.totals.unitsReturned} refunded` : ''}.
        </p>
      </header>

      <div className="space-y-6 px-5 py-5">
        {/* ── Cumulative sales, one series, no legend ─────────────────────── */}
        <figure className="m-0">
          <figcaption className="text-xs font-semibold uppercase tracking-wide text-ink-600">
            Tickets sold, adding up as the days counted down
          </figcaption>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-2 h-auto w-full"
            role="img"
            aria-label={`Cumulative tickets sold against days before the event. ${curve.totals.units} sold in total, the last on ${dayLabel(last.daysOut)}.`}
          >
            <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="var(--color-ink-200)" strokeWidth="1" />
            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="var(--color-ink-200)" strokeWidth="1" />
            <text x={PAD.left - 6} y={PAD.top + 4} textAnchor="end" fontSize="10" fill="var(--color-ink-400)">
              {maxUnits}
            </text>
            <text x={PAD.left - 6} y={H - PAD.bottom} textAnchor="end" fontSize="10" fill="var(--color-ink-400)">
              0
            </text>
            <text x={PAD.left} y={H - 8} fontSize="10" fill="var(--color-ink-400)">
              {maxDays} days out
            </text>
            <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize="10" fill="var(--color-ink-400)">
              {minDays === 0 ? 'the day itself' : `${minDays} days out`}
            </text>

            <path d={path(line)} fill="none" stroke="var(--color-ink-900)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {curve.points.map((p, i) => (
              <g key={p.daysOut}>
                {/* A generous invisible target, because the mark is 4px and a
                    finger is not. The title is the tooltip and the label. */}
                <circle cx={line[i].x} cy={line[i].y} r="4" fill="var(--color-ink-900)" />
                <circle cx={line[i].x} cy={line[i].y} r="14" fill="transparent" tabIndex={0}>
                  <title>
                    {`${dayLabel(p.daysOut)}: ${p.units > 0 ? `${p.units} sold` : `${Math.abs(p.units)} returned`}, ${p.cumulativeUnits} in total, ${money(p.cumulativeAmountCents, currency)} taken`}
                  </title>
                </circle>
              </g>
            ))}
          </svg>
        </figure>

        {/* ── Price, sharing the same x-domain. Never a second y-axis. ────── */}
        {priced.length > 0 && (
          <figure className="m-0">
            <figcaption className="text-xs font-semibold uppercase tracking-wide text-ink-600">
              What one ticket cost on the days it sold
            </figcaption>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="mt-2 h-auto w-full"
              role="img"
              aria-label={`The price of one ticket on each day it sold, from ${money(Math.min(...priced.map(p => p.unitAmountCents as number)), currency)} to ${money(maxPrice, currency)}.`}
            >
              <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="var(--color-ink-200)" strokeWidth="1" />
              <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="var(--color-ink-200)" strokeWidth="1" />
              <text x={PAD.left - 6} y={PAD.top + 4} textAnchor="end" fontSize="10" fill="var(--color-ink-400)">
                {money(maxPrice, currency)}
              </text>
              <text x={PAD.left - 6} y={H - PAD.bottom} textAnchor="end" fontSize="10" fill="var(--color-ink-400)">
                {money(0, currency)}
              </text>
              <path
                d={path(priceLine)}
                fill="none"
                stroke="var(--color-gold-800)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {priced.map((p, i) => (
                <g key={p.daysOut}>
                  <circle cx={priceLine[i].x} cy={priceLine[i].y} r="4" fill="var(--color-gold-800)" />
                  <circle cx={priceLine[i].x} cy={priceLine[i].y} r="14" fill="transparent" tabIndex={0}>
                    <title>{`${dayLabel(p.daysOut)}: ${money(p.unitAmountCents as number, currency)} a ticket`}</title>
                  </circle>
                </g>
              ))}
            </svg>
          </figure>
        )}

        {/*
          ── Three numbers, as three numbers ────────────────────────────────

          UNLESS NOTHING WAS EVER RECORDED, in which case they are not three
          numbers, they are a sentence. Found by driving this panel on 10
          September 2026 against a slot with 28 real backfilled sales: it read
          "Reached checkout 0 / Did not finish 0 / Looked at the page 0" beside
          "28 sold, $665 taken", which is not a small number, it is a false one.
          Nobody recorded who reached checkout before the ledger existed, and
          the backfill deliberately writes no demand rows for exactly that
          reason ("writing zero abandonment for a period nobody measured would
          be a lie the recovery engine would then act on"). The panel was
          telling that lie on the backfill's behalf.

          A slot with sales and NO demand rows of any kind can only be one that
          predates the recording: a live sale writes a checkout_started row on
          its way through. So the two cases are distinguishable, and they are
          different answers.
        */}
        {curve.demand.views +
          curve.demand.soldOutViews +
          curve.demand.checkoutsStarted +
          curve.demand.checkoutsAbandoned +
          curve.demand.waitlistJoins ===
        0 ? (
          <p className="rounded-lg border border-ink-100 bg-ink-100/40 px-4 py-3 text-sm leading-6 text-ink-600">
            Nothing is recorded yet about the people who looked and did not buy. That started being kept from now on,
            so the next tickets to sell will bring how many reached checkout and how many did not finish with them.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Reached checkout" value={String(curve.demand.checkoutsStarted)} />
            <Stat
              label="Did not finish"
              value={
                curve.demand.abandonmentPercent === null
                  ? String(curve.demand.checkoutsAbandoned)
                  : `${curve.demand.checkoutsAbandoned} (${curve.demand.abandonmentPercent}%)`
              }
            />
            <Stat
              label={curve.demand.soldOutViews > 0 ? 'Arrived after it sold out' : 'Looked at the page'}
              value={String(curve.demand.soldOutViews > 0 ? curve.demand.soldOutViews : curve.demand.views)}
            />
          </div>
        )}

        {curve.close && (
          <p className="text-sm text-ink-600">
            Final: {curve.close.finalUnits} sold, {money(curve.close.finalAmountCents, currency)} taken,{' '}
            {curve.close.fillPercent}% of capacity
            {curve.close.attended === null
              ? '. Nothing was scanned at the door, so attendance was not recorded.'
              : `, ${curve.close.attended} scanned in and ${curve.close.noShows} did not arrive.`}
          </p>
        )}

        {/* THE TABLE VIEW. Identity is never colour alone, and a chart nobody can
            read is not an accessible chart. */}
        <details className="rounded-lg border border-ink-100 bg-ink-100/40 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-900">
            Read it as a table
          </summary>
          <table className="mt-3 w-full text-left text-sm">
            <caption className="sr-only">Tickets sold and the price they sold at, by days before the event</caption>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-600">
                <th scope="col" className="py-1 pr-3 font-semibold">Days out</th>
                <th scope="col" className="py-1 pr-3 font-semibold">Sold</th>
                <th scope="col" className="py-1 pr-3 font-semibold">Running total</th>
                <th scope="col" className="py-1 font-semibold">Price</th>
              </tr>
            </thead>
            <tbody className="text-ink-900">
              {curve.points.map(p => (
                <tr key={p.daysOut} className="border-t border-ink-100">
                  <td className="py-1 pr-3">{p.daysOut}</td>
                  <td className="py-1 pr-3">{p.units}</td>
                  <td className="py-1 pr-3">{p.cumulativeUnits}</td>
                  <td className="py-1">{p.unitAmountCents === null ? '' : money(p.unitAmountCents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ink-600">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink-900">{value}</div>
    </div>
  )
}
