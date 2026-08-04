import { runAllChecks, overallStatus, type HealthResult } from '@/lib/health/checks'
import { getSiteUrl } from '@/lib/site-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Platform Health | Admin | EventLinqs',
  robots: { index: false, follow: false },
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

  const dot = (r: HealthResult) => (r.ok ? '#1a9d5a' : r.severity === 'critical' ? '#d12f3a' : '#c99a10')

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-ink-900">Platform health</h1>
        <p className="text-xs text-ink-500">
          Checked {checkedAt.toLocaleString('en-AU')} · env {process.env.VERCEL_ENV || process.env.NODE_ENV || 'local'}
        </p>
      </div>

      <div className="mb-8 rounded-xl px-5 py-4 text-sm font-semibold" style={{ background: banner.bg, color: banner.fg }}>
        {banner.text}
      </div>

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3">System</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.id} className="border-b border-ink-50 last:border-0 align-top">
                <td className="px-4 py-3 font-medium text-ink-900">{r.label}</td>
                <td className="px-4 py-3 text-ink-500">{r.severity}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dot(r) }} aria-hidden />
                    <span style={{ color: dot(r) }} className="font-semibold">
                      {r.ok ? (r.skipped ? 'N/A' : 'Healthy') : r.severity === 'critical' ? 'DOWN' : 'Degraded'}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-600">
                  {r.detail}
                  {!r.ok && r.action ? <div className="mt-1 text-xs text-ink-500"><strong>Fix:</strong> {r.action}</div> : null}
                  {r.durationMs != null ? <div className="mt-1 text-[11px] text-ink-400">{r.durationMs}ms</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-ink-500">
        The sentinel also runs on a schedule and after every deployment, emailing the founder on any CRITICAL fault and a
        daily heartbeat. Canonical site: {getSiteUrl()}. Runbook: docs/ops/HEALTH-ALERTS.md.
      </p>
    </div>
  )
}
