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
 *   both clear 3:1 comfortably. On the dark console the same two roles take the
 *   admin shell's own values; the whole token set for both surfaces is the one
 *   map below and there is no second copy anywhere.
 */

/**
 * TWO SURFACES, ONE CHART (close-out D1, 13 September 2026).
 *
 * WHY THIS EXISTS AT ALL. D1's last open leg was a render: "pull the complete
 * curve for the Afro-Fusion slot including order EL-9HE57YNV and render it". The
 * curve was pulled on 12 September and the numbers are established. The RENDER
 * lives on the organiser's own dashboard, and that event belongs to MKLStudios,
 * an outside organiser with one member who is not the founder, so on production
 * there was no surface in the whole platform where the person who owns the
 * platform could read it. The ledger row for that leg says exactly that: "no
 * admin surface renders the panel".
 *
 * That is a real gap rather than a proof inconvenience. The owner can read an
 * event's status, its tiers, its fee override and its orders in the console, and
 * could not read the one thing the ledger exists to answer: when those tickets
 * sold and what they went for.
 *
 * WHY A TONE AND NOT A SECOND COMPONENT. The arithmetic, the two plots, the
 * hover targets, the table fallback and every rule about what NOT to say when
 * nothing was recorded are the value here, and a second copy of them would drift
 * within a month. The console shell is dark (#0A0F1A page, #131A2A cards), so
 * the only thing that differs between the two is the token set and the heading,
 * and both live in one map below.
 *
 * CONTRAST, MEASURED ON THE REAL PAGE RATHER THAN ASSUMED, because S1 found
 * twelve elements on this exact shell painted white on white while axe reported
 * zero violations at every impact level in the same run. The numbers below are
 * what the drive read off the rendered console, not arithmetic done here:
 *
 *   53 text elements, every one at or above  6.52:1   (the floor is 4.5:1)
 *    2 series strokes, both at or above      9.32:1   (the floor is 3:1)
 *
 *   lowest of all: the table's own column headers at 6.52:1, then the two figure
 *   captions at 6.91:1, the subhead at 8.93:1, and solid white at 17.37:1.
 *
 * That measurement is itself drilled both ways, and it had to be: its first
 * version read 45 elements and a lowest of 17.37:1, which is the ratio of solid
 * white, because Tailwind v4 compiles an alpha utility to `oklab(...)` and a
 * hand-written rgb reader skipped every one of them in silence.
 * C:\dev\EVIDENCE\D1\2026-09-13\contrast-measurement-drill.txt carries both
 * directions.
 */
/*
 * The note-box key below is called noteBox rather than the obvious alternative,
 * and the alternative is deliberately not written here. `no-hardcoded-spacing`
 * recognises a CSS inset declaration by its property name followed by a quoted
 * value, so an object key of that name carrying a string of Tailwind classes was
 * read as a declaration and its classes parsed as lengths. The key name alone
 * failed the build. The guard is crude there and it is not wrong to be; a
 * clearer key costs nothing.
 */
type Tone = 'organiser' | 'console'

const TONE = {
  organiser: {
    heading: 'How your tickets sold',
    card: 'rounded-xl border border-ink-100 bg-white',
    pad: 'rounded-xl border border-ink-100 bg-white p-6',
    rule: 'border-b border-ink-100',
    h2: 'text-base font-semibold text-ink-900',
    sub: 'mt-1 text-sm text-ink-600',
    prose: 'mt-2 text-sm leading-6 text-ink-600',
    caption: 'text-xs font-semibold uppercase tracking-wide text-ink-600',
    noteBox: 'rounded-lg border border-ink-100 bg-ink-100/40 px-4 py-3 text-sm leading-6 text-ink-600',
    statBox: 'rounded-lg border border-ink-100 px-4 py-3',
    statLabel: 'text-xs uppercase tracking-wide text-ink-600',
    statValue: 'mt-1 text-2xl font-semibold text-ink-900',
    closing: 'text-sm text-ink-600',
    details: 'rounded-lg border border-ink-100 bg-ink-100/40 px-4 py-3',
    summary: 'cursor-pointer text-sm font-medium text-ink-900',
    theadRow: 'text-xs uppercase tracking-wide text-ink-600',
    tbody: 'text-ink-900',
    tr: 'border-t border-ink-100',
    axis: 'var(--color-ink-200)',
    tick: 'var(--color-ink-400)',
    sales: 'var(--color-ink-900)',
    price: 'var(--color-gold-800)',
  },
  /*
   * The console tones are the admin shell's own values, inherited rather than
   * invented: src/components/admin/admin-shell.tsx records #131A2A for a card and
   * rgba(255,255,255,0.08) for its border, and every section on
   * /admin/events/[id] already uses them. Nothing new is introduced here.
   */
  console: {
    heading: 'How this event sold',
    card: 'rounded-lg border border-white/[0.08] bg-[#131A2A]',
    pad: 'rounded-lg border border-white/[0.08] bg-[#131A2A] p-5',
    rule: 'border-b border-white/[0.08]',
    h2: 'font-display text-lg font-semibold text-white',
    sub: 'mt-1 text-sm text-white/70',
    prose: 'mt-2 text-sm leading-6 text-white/70',
    caption: 'text-xs font-semibold uppercase tracking-wide text-white/60',
    noteBox: 'rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/70',
    statBox: 'rounded-lg border border-white/[0.08] px-4 py-3',
    statLabel: 'text-xs uppercase tracking-wide text-white/60',
    statValue: 'mt-1 text-2xl font-semibold text-white',
    closing: 'text-sm text-white/70',
    details: 'rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-3',
    summary: 'cursor-pointer text-sm font-medium text-white',
    theadRow: 'text-xs uppercase tracking-wide text-white/60',
    tbody: 'text-white',
    tr: 'border-t border-white/[0.08]',
    axis: 'rgba(255,255,255,0.20)',
    tick: 'rgba(255,255,255,0.62)',
    sales: '#FFFFFF',
    price: 'var(--color-gold-400)',
  },
} as const

type Tokens = (typeof TONE)[Tone]

type Props = {
  curve: PaceCurve | null
  currency?: string
  /**
   * Which surface this is drawn on. `organiser` is the light dashboard card and
   * is the default, so every existing call site is unchanged. `console` is the
   * dark admin shell.
   */
  tone?: Tone
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

export function SalesPacePanel({ curve, currency = 'AUD', tone = 'organiser' }: Props) {
  const t = TONE[tone]
  /*
   * NOTHING RECORDED IS A REAL ANSWER AND IS SAID AS ONE. An event that sold out
   * before this ledger existed did not sell nothing, and telling its organiser
   * it did would be a lie the panel has no business telling.
   */
  if (!curve || curve.points.length === 0) {
    return (
      <div className={t.pad}>
        <h2 className={t.h2}>{t.heading}</h2>
        <p className={t.prose}>
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
    <div className={t.card}>
      <header className={`${t.rule} px-5 py-4`}>
        <h2 className={t.h2}>{t.heading}</h2>
        <p className={t.sub}>
          {curve.totals.units} sold, {money(curve.totals.amountCents, currency)} taken
          {curve.totals.unitsReturned > 0 ? `, ${curve.totals.unitsReturned} refunded` : ''}.
        </p>
      </header>

      <div className="space-y-6 px-5 py-5">
        {/* ── Cumulative sales, one series, no legend ─────────────────────── */}
        <figure className="m-0">
          <figcaption className={t.caption}>
            Tickets sold, adding up as the days counted down
          </figcaption>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-2 h-auto w-full"
            role="img"
            aria-label={`Cumulative tickets sold against days before the event. ${curve.totals.units} sold in total, the last on ${dayLabel(last.daysOut)}.`}
          >
            <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke={t.axis} strokeWidth="1" />
            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke={t.axis} strokeWidth="1" />
            <text x={PAD.left - 6} y={PAD.top + 4} textAnchor="end" fontSize="10" fill={t.tick}>
              {maxUnits}
            </text>
            <text x={PAD.left - 6} y={H - PAD.bottom} textAnchor="end" fontSize="10" fill={t.tick}>
              0
            </text>
            <text x={PAD.left} y={H - 8} fontSize="10" fill={t.tick}>
              {maxDays} days out
            </text>
            <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize="10" fill={t.tick}>
              {minDays === 0 ? 'the day itself' : `${minDays} days out`}
            </text>

            <path d={path(line)} fill="none" stroke={t.sales} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {curve.points.map((p, i) => (
              <g key={p.daysOut}>
                {/* A generous invisible target, because the mark is 4px and a
                    finger is not. The title is the tooltip and the label. */}
                <circle cx={line[i].x} cy={line[i].y} r="4" fill={t.sales} />
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
            <figcaption className={t.caption}>
              What one ticket cost on the days it sold
            </figcaption>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="mt-2 h-auto w-full"
              role="img"
              aria-label={`The price of one ticket on each day it sold, from ${money(Math.min(...priced.map(p => p.unitAmountCents as number)), currency)} to ${money(maxPrice, currency)}.`}
            >
              <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke={t.axis} strokeWidth="1" />
              <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke={t.axis} strokeWidth="1" />
              <text x={PAD.left - 6} y={PAD.top + 4} textAnchor="end" fontSize="10" fill={t.tick}>
                {money(maxPrice, currency)}
              </text>
              <text x={PAD.left - 6} y={H - PAD.bottom} textAnchor="end" fontSize="10" fill={t.tick}>
                {money(0, currency)}
              </text>
              <path
                d={path(priceLine)}
                fill="none"
                stroke={t.price}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {priced.map((p, i) => (
                <g key={p.daysOut}>
                  <circle cx={priceLine[i].x} cy={priceLine[i].y} r="4" fill={t.price} />
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
          <p className={t.noteBox}>
            Nothing is recorded yet about the people who looked and did not buy. That started being kept from now on,
            so the next tickets to sell will bring how many reached checkout and how many did not finish with them.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat t={t} label="Reached checkout" value={String(curve.demand.checkoutsStarted)} />
            <Stat
              t={t}
              label="Did not finish"
              value={
                curve.demand.abandonmentPercent === null
                  ? String(curve.demand.checkoutsAbandoned)
                  : `${curve.demand.checkoutsAbandoned} (${curve.demand.abandonmentPercent}%)`
              }
            />
            <Stat
              t={t}
              label={curve.demand.soldOutViews > 0 ? 'Arrived after it sold out' : 'Looked at the page'}
              value={String(curve.demand.soldOutViews > 0 ? curve.demand.soldOutViews : curve.demand.views)}
            />
          </div>
        )}

        {curve.close && (
          <p className={t.closing}>
            Final: {curve.close.finalUnits} sold, {money(curve.close.finalAmountCents, currency)} taken,{' '}
            {curve.close.fillPercent}% of capacity
            {curve.close.attended === null
              ? '. Nothing was scanned at the door, so attendance was not recorded.'
              : `, ${curve.close.attended} scanned in and ${curve.close.noShows} did not arrive.`}
          </p>
        )}

        {/* THE TABLE VIEW. Identity is never colour alone, and a chart nobody can
            read is not an accessible chart. */}
        <details className={t.details}>
          <summary className={t.summary}>
            Read it as a table
          </summary>
          <table className="mt-3 w-full text-left text-sm">
            <caption className="sr-only">Tickets sold and the price they sold at, by days before the event</caption>
            <thead>
              <tr className={t.theadRow}>
                <th scope="col" className="py-1 pr-3 font-semibold">Days out</th>
                <th scope="col" className="py-1 pr-3 font-semibold">Sold</th>
                <th scope="col" className="py-1 pr-3 font-semibold">Running total</th>
                <th scope="col" className="py-1 font-semibold">Price</th>
              </tr>
            </thead>
            <tbody className={t.tbody}>
              {curve.points.map(p => (
                <tr key={p.daysOut} className={t.tr}>
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

function Stat({ t, label, value }: { t: Tokens; label: string; value: string }) {
  return (
    <div className={t.statBox}>
      <div className={t.statLabel}>{label}</div>
      <div className={t.statValue}>{value}</div>
    </div>
  )
}
