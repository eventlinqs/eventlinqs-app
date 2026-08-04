import { sendEmail } from '@/lib/email/send'
import { getRedisClient } from '@/lib/redis/client'
import { getSiteUrl } from '@/lib/site-url'
import { type HealthResult, overallStatus } from '@/lib/health/checks'

/**
 * Health sentinel runner: severity routing, no-false-alarm dedupe, and the
 * founder-facing email format. CRITICAL faults email the founder immediately;
 * WARNING faults roll into the daily heartbeat. Reuses the existing Resend
 * rails (sendEmail) and the PAYMENT_ALERT_EMAIL address.
 */

const ALERT_COOLDOWN_SECONDS = 30 * 60 // re-alert a still-broken check at most every 30 min
const DEDUPE_PREFIX = 'health:alert:'

export function alertRecipient(): string {
  return process.env.PAYMENT_ALERT_EMAIL || 'lawaladams9@gmail.com'
}

function deployIdentity() {
  const origin = getSiteUrl()
  const deployment = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : origin
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown'
  return { origin, deployment, environment }
}

/**
 * Dedupe gate. Returns the subset of failing critical checks we should email
 * about NOW (first occurrence, or cooldown elapsed), and the checks that have
 * RECOVERED since the last alert. Fails OPEN: if Redis is unavailable, every
 * failing critical check is treated as new (alert rather than stay silent).
 */
async function dedupe(results: HealthResult[]): Promise<{ toAlert: HealthResult[]; recovered: string[] }> {
  const failingCritical = results.filter(r => !r.ok && r.severity === 'critical')
  const redis = getRedisClient()
  if (!redis) {
    return { toAlert: failingCritical, recovered: [] }
  }
  const toAlert: HealthResult[] = []
  for (const r of failingCritical) {
    const key = `${DEDUPE_PREFIX}${r.id}`
    // NX+EX: set only if not present, with the cooldown TTL. If it set, this is
    // a new (or cooled-down) fault we should alert on.
    const set = await redis.set(key, Date.now(), { nx: true, ex: ALERT_COOLDOWN_SECONDS })
    if (set === 'OK') toAlert.push(r)
  }
  // Recovery: any check that is now OK but still has a live alert key.
  const recovered: string[] = []
  for (const r of results) {
    if (r.ok) {
      const key = `${DEDUPE_PREFIX}${r.id}`
      const existed = await redis.getdel(key)
      if (existed) recovered.push(r.label)
    }
  }
  return { toAlert, recovered }
}

function failureBlock(results: HealthResult[]): string {
  return results
    .map(r => `- [${r.severity.toUpperCase()}] ${r.label}\n    What: ${r.detail}${r.probableCause ? `\n    Likely cause: ${r.probableCause}` : ''}${r.action ? `\n    Fix: ${r.action}` : ''}`)
    .join('\n\n')
}

function failureHtml(results: HealthResult[]): string {
  return results
    .map(r => `<li><strong>[${r.severity.toUpperCase()}] ${r.label}</strong><br/><em>What:</em> ${r.detail}${r.probableCause ? `<br/><em>Likely cause:</em> ${r.probableCause}` : ''}${r.action ? `<br/><em>Fix:</em> ${r.action}` : ''}</li>`)
    .join('')
}

/**
 * Send the CRITICAL alert email for the given failing checks (already deduped).
 * Returns whether an email was actually dispatched.
 */
export async function sendCriticalAlert(toAlert: HealthResult[], recovered: string[]): Promise<boolean> {
  if (toAlert.length === 0 && recovered.length === 0) return false
  const { deployment, environment } = deployIdentity()
  const when = new Date().toISOString()

  if (toAlert.length === 0) {
    // Only recoveries - send a short all-clear so silence is never ambiguous.
    await sendEmail({
      to: alertRecipient(),
      subject: `EventLinqs RECOVERED: ${recovered.join(', ')}`,
      text: `Good news. The following systems have recovered:\n\n${recovered.map(r => `- ${r}`).join('\n')}\n\nEnvironment: ${environment}\nDeployment: ${deployment}\nTime: ${when}\n\nEventLinqs health sentinel`,
      html: `<p><strong>Good news - systems recovered.</strong></p><ul>${recovered.map(r => `<li>${r}</li>`).join('')}</ul><p>Environment: ${environment}<br/>Deployment: ${deployment}<br/>Time: ${when}</p><p>EventLinqs health sentinel</p>`,
    })
    return true
  }

  const headline = toAlert[0].probableCause ?? toAlert[0].label
  await sendEmail({
    to: alertRecipient(),
    subject: `EventLinqs CRITICAL: ${headline}`,
    text:
      `A CRITICAL platform fault was detected. You are seeing this first.\n\n` +
      `Environment: ${environment}\nDeployment: ${deployment}\nTime: ${when}\n\n` +
      `${failureBlock(toAlert)}\n\n` +
      (recovered.length ? `Also recovered: ${recovered.join(', ')}\n\n` : '') +
      `Full runbook: docs/ops/HEALTH-ALERTS.md\nLive status: ${getSiteUrl()}/admin/health\n\nEventLinqs health sentinel`,
    html:
      `<p><strong style="color:#b00">A CRITICAL platform fault was detected.</strong> You are seeing this first.</p>` +
      `<p>Environment: ${environment}<br/>Deployment: ${deployment}<br/>Time: ${when}</p>` +
      `<ul>${failureHtml(toAlert)}</ul>` +
      (recovered.length ? `<p>Also recovered: ${recovered.join(', ')}</p>` : '') +
      `<p>Full runbook: docs/ops/HEALTH-ALERTS.md<br/>Live status: <a href="${getSiteUrl()}/admin/health">${getSiteUrl()}/admin/health</a></p><p>EventLinqs health sentinel</p>`,
  })
  return true
}

/** Evaluate results, dedupe, and dispatch any critical alert. */
export async function routeAlerts(results: HealthResult[]): Promise<{ alerted: boolean; toAlertIds: string[]; recovered: string[] }> {
  const { toAlert, recovered } = await dedupe(results)
  const alerted = await sendCriticalAlert(toAlert, recovered)
  return { alerted, toAlertIds: toAlert.map(t => t.id), recovered }
}

/** The daily heartbeat email - green summary, or a digest of any warnings. */
export async function sendHeartbeat(results: HealthResult[]): Promise<void> {
  const { deployment, environment } = deployIdentity()
  const status = overallStatus(results)
  const when = new Date().toISOString()
  const rows = results.map(r => `${r.ok ? 'OK  ' : (r.severity === 'critical' ? 'DOWN' : 'WARN')}  ${r.label}${r.ok ? '' : ` - ${r.detail}`}`).join('\n')
  const htmlRows = results
    .map(r => `<tr><td>${r.ok ? '🟢' : r.severity === 'critical' ? '🔴' : '🟡'}</td><td>${r.label}</td><td>${r.ok ? 'OK' : r.detail}</td></tr>`)
    .join('')
  const headline = status === 'green' ? 'All systems green' : status === 'warning' ? 'Green with warnings' : 'CRITICAL faults present'

  await sendEmail({
    to: alertRecipient(),
    subject: `EventLinqs daily heartbeat: ${headline}`,
    text: `EventLinqs daily heartbeat.\n\nStatus: ${headline}\nEnvironment: ${environment}\nDeployment: ${deployment}\nTime: ${when}\n\n${rows}\n\nLive status: ${getSiteUrl()}/admin/health\nRunbook: docs/ops/HEALTH-ALERTS.md\n\n(If you ever stop receiving this daily note, the monitor itself may be down - treat a MISSING heartbeat as a signal.)`,
    html: `<p><strong>EventLinqs daily heartbeat: ${headline}</strong></p><p>Environment: ${environment}<br/>Deployment: ${deployment}<br/>Time: ${when}</p><table cellpadding="4">${htmlRows}</table><p>Live status: <a href="${getSiteUrl()}/admin/health">${getSiteUrl()}/admin/health</a><br/>Runbook: docs/ops/HEALTH-ALERTS.md</p><p style="color:#666">If you ever stop receiving this daily note, the monitor itself may be down - treat a missing heartbeat as a signal.</p>`,
  })
}
