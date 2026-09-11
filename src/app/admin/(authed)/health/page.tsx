import { runAllChecks, overallStatus, type HealthResult } from '@/lib/health/checks'
import { getSiteUrl } from '@/lib/site-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Platform Health | Admin | EventLinqs',
  robots: { index: false, follow: false },
}

/*
 * TWO TIERS, AND THE MEASUREMENTS THAT FORCED THE SECOND ONE.
 *
 * The dot is decorative and aria-hidden, so it stays as vivid as it reads. The
 * LABEL beside it is 14px text on a white card and has to clear WCAG AA at
 * 4.5:1, which two of the three did not. Measured against #ffffff on
 * 11 September 2026 and confirmed by axe at 390, 768 and 1440:
 *
 *     healthy   #1a9d5a  3.49:1  FAIL   ->  #047857  5.48:1
 *     degraded  #c99a10  2.59:1  FAIL   ->  #b45309  5.02:1
 *     down      #d12f3a  5.03:1  passes ->  unchanged
 *
 * This is the same two-tier move the constitution already makes for gold, where
 * gold-400 is a fill and gold-800 is the text tier because gold-400 fails 4.5:1
 * on white. A vivid colour is not a text colour.
 *
 * AND THE ONE THAT AXE COULD NOT SEE, WHICH IS THE WORSE FINDING.
 *
 * This page used `text-ink-500` and `border-ink-50` seven times. globals.css
 * defines ink-950, 900, 800, 600, 400, 200 and 100, and NEITHER of those two. An
 * undefined utility paints nothing, so the element inherits, and the admin shell
 * sets `text-white`. Measured in a real browser at 390 rather than reasoned
 * about:
 *
 *     colour rgb(255,255,255) on rgb(255,255,255)  "Fix: Open docs/payments/..."
 *     colour rgb(255,255,255) on rgb(255,255,255)  "SystemSeverityStatusDetail"
 *     colour rgb(255,255,255) on rgb(255,255,255)  "critical"
 *
 * White on white. The table had no visible column headers, the severity column
 * was blank, and the "Fix:" line - the sentence telling the owner what to DO
 * about a fault - was invisible on the screen they open when something is wrong.
 * axe reported ZERO violations on that page, at every impact level, on all three
 * widths. A scan cannot see this; a person reading the page can, which is the
 * whole of close-out UX2.5.
 *
 * Fixed here, on the surface this item owns: muted text on the dark shell now
 * uses the admin's own `text-white/60` (its idiom, 98 other uses), and text on a
 * white card uses ink-600 (#4A4A4A, 8.6:1) or ink-400 (#6B7280, 4.83:1).
 *
 * NOT FIXED HERE, AND REPORTED INSTEAD: `ink-500` is used 80 times across src/
 * and `ink-50` 31 times. The other 73 sit on light surfaces, where the inherited
 * colour is the body navy rather than white, so they are wrong but legible. This
 * page was the only admin file among them. Defining the missing tokens would
 * move colour on 100+ elements across public pages and is not a decision to make
 * inside a Stripe item. The banner colours below are also off-brand, Bootstrap's
 * rather than EventLinqs'.
 */
const dot = (r: HealthResult) => (r.ok ? '#1a9d5a' : r.severity === 'critical' ? '#d12f3a' : '#c99a10')
const statusText = (r: HealthResult) => (r.ok ? '#047857' : r.severity === 'critical' ? '#d12f3a' : '#b45309')

/** The coloured dot and its word, rendered once and used by both layouts, so the
 *  phone and the desktop can never disagree about what a check is saying. */
function StatusWord({ result }: { result: HealthResult }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dot(result) }} aria-hidden />
      <span style={{ color: statusText(result) }} className="font-semibold">
        {result.ok ? (result.skipped ? 'N/A' : 'Healthy') : result.severity === 'critical' ? 'DOWN' : 'Degraded'}
      </span>
    </span>
  )
}

/**
 * Private founder-only platform status page. Runs the full health battery LIVE
 * on every load (no stale cache) so the founder can look any moment without
 * waiting for an email. Gated by the admin (authed) layout - founder/admin only.
 */
export default async function HealthStatusPage() {
  const results = await runAllChecks()
  const status = overallStatus(results)
  const checkedAt = new Date()

  const banner =
    status === 'green'
      ? { text: 'All systems operational', bg: '#0f5132', fg: '#d1e7dd' }
      : status === 'warning'
        ? { text: 'Operational with warnings', bg: '#664d03', fg: '#fff3cd' }
        : { text: 'Critical fault detected', bg: '#842029', fg: '#f8d7da' }


  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-baseline justify-between">
        {/* No colour override. The admin shell paints #0A0F1A and sets
            text-white; this heading used to force text-ink-900, which is the
            brand NAVY, giving 1.05:1 against that background - a heading
            nobody could read, on the screen the owner opens when something is
            wrong. Every sibling admin page inherits the shell instead. */}
        <h1 className="font-display text-2xl font-bold tracking-tight">Platform health</h1>
        <p className="text-xs text-white/60">
          Checked {checkedAt.toLocaleString('en-AU')} · env {process.env.VERCEL_ENV || process.env.NODE_ENV || 'local'}
        </p>
      </div>

      <div className="mb-8 rounded-xl px-5 py-4 text-sm font-semibold" style={{ background: banner.bg, color: banner.fg }}>
        {banner.text}
      </div>

      {/*
        SCROLLS, NEVER CLIPS. Close-out UX6.3: "Where content genuinely cannot
        fit it must scroll inside its own container, never be silently clipped."

        This wrapper was `overflow-hidden`, and the table does not fit a phone:
        measured on the built tree at a 390 viewport, the table lays out at
        567px (System 116, Severity 90, Status 115, Detail 246), so 177px of the
        Detail column sat outside the box with no way to reach it. The page-level
        scrollWidth check passed, because `overflow-hidden` is exactly what makes
        a clip invisible to that check.

        The Detail column is where every answer lives, and close-out S1 made
        those answers LONGER on purpose, naming the organiser, the account and
        each outstanding Stripe requirement instead of counting them. Unreachable
        on the worst device is where that would have landed.
      */}
      {/*
        AND A REGION THAT SCROLLS BY FINGER MUST SCROLL BY KEYBOARD (WCAG 2.1.1).
        Making the wrapper scrollable immediately raised a second, real axe
        violation, `scrollable-region-focusable`: the table holds no focusable
        content, so without this the only way to reach the right-hand columns was
        a mouse or a finger. `tabIndex` makes it a tab stop that arrow keys
        scroll, and the role and label give a screen reader something to announce
        when it lands there.

        ON A PHONE THE TABLE IS NOT SHOWN AT ALL, and the reason is a human read
        rather than a measurement. With the clip fixed the content was reachable
        and the screen still read wrong: every row was a hand tall and almost
        entirely blank, because the Detail cell wraps in a 246px column and the
        row height is shared with the two columns a phone can see. Reachable is
        the law; legible is the job. Below `sm` each check is its own card, so the
        detail sits under the name it belongs to and nothing scrolls sideways.
      */}
      <ul className="space-y-3 sm:hidden">
        {results.map(r => (
          <li key={r.id} className="rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium text-ink-900">{r.label}</span>
              <StatusWord result={r} />
            </div>
            <p className="mt-2 text-ink-600">{r.detail}</p>
            {!r.ok && r.action ? (
              <p className="mt-1 text-xs text-ink-600">
                <strong>Fix:</strong> {r.action}
              </p>
            ) : null}
            {r.durationMs != null ? <p className="mt-1 text-[11px] text-ink-400">{r.durationMs}ms</p> : null}
          </li>
        ))}
      </ul>

      <div
        className="hidden overflow-x-auto rounded-xl border border-ink-200 bg-white sm:block"
        tabIndex={0}
        role="region"
        aria-label="Platform health checks"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3">System</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.id} className="border-b border-ink-100 last:border-0 align-top">
                <td className="px-4 py-3 font-medium text-ink-900">{r.label}</td>
                <td className="px-4 py-3 text-ink-400">{r.severity}</td>
                <td className="px-4 py-3">
                  <StatusWord result={r} />
                </td>
                <td className="px-4 py-3 text-ink-600">
                  {r.detail}
                  {!r.ok && r.action ? <div className="mt-1 text-xs text-ink-600"><strong>Fix:</strong> {r.action}</div> : null}
                  {r.durationMs != null ? <div className="mt-1 text-[11px] text-ink-400">{r.durationMs}ms</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-white/60">
        The sentinel also runs on a schedule and after every deployment, emailing the founder on any CRITICAL fault and a
        daily heartbeat. Canonical site: {getSiteUrl()}. Runbook: docs/ops/HEALTH-ALERTS.md.
      </p>
    </div>
  )
}
