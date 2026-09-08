/**
 * ONE COMMAND: exempt the platform's machine callers from Vercel's system-level
 * DDoS mitigation, and record what was done so the guard can hold it.
 *
 *   npm run firewall:bypass              show the plan, change nothing
 *   npm run firewall:bypass -- --apply   install the rules and verify them
 *   npm run firewall:bypass -- --remove  take them off again, same verification
 *
 * WHY (close-out H2.1, 8 September 2026, Law 10). On 7 September production
 * reset a TLS handshake from a GitHub Actions runner. The reset arrived during
 * the handshake, so nothing that reads an HTTP request can have sent it, and
 * this project has no firewall configuration at all: the Vercel API answers
 * `{"active":null,"draft":null,"versions":[]}`. What is left is the always-on
 * system mitigation, which Vercel documents as covering "L3, L4, and L7 DDoS
 * attacks" and which it says "can happen [to] block traffic from trusted
 * sources like proxies or shared networks"
 * (https://vercel.com/docs/vercel-firewall/ddos-mitigation, fetched 2026-09-08).
 *
 * The owner asked the right question about the blast radius: the same thing
 * could drop a Stripe webhook, and a dropped payment webhook is a paid order
 * nobody is told about. The documented exemption is a System Bypass Rule, IP
 * based, 25 per project on the Pro plan
 * (https://vercel.com/docs/vercel-firewall/vercel-waf/system-bypass-rules).
 * Stripe publishes exactly 15 webhook source addresses
 * (https://stripe.com/files/ips/ips_webhooks.json, and
 * https://docs.stripe.com/ips says seven days notice is given before they
 * change). Fifteen fits inside twenty-five with ten to spare.
 *
 * WHY IT IS NOT DONE AUTOMATICALLY. Installing them changes production
 * infrastructure, and production is not changed without the owner's approval.
 * So this script is the whole of the work except the decision: it fetches the
 * live list from Stripe, diffs it against what is installed, prints the plan,
 * and refuses to act without --apply.
 *
 * IT PROVES ITSELF (Law 10, rule 3, the shape of copy-spine-category-objects.mjs
 * and rotate-db-password.mjs):
 *   it refuses before it acts, and prints exactly what it would do
 *   it never prints the token
 *   it is idempotent: an address already bypassed is left alone
 *   it verifies by RE-READING the rules from Vercel afterwards, never by
 *     trusting the answer to its own POST
 *   it rewrites scripts/guards/lib/firewall-bypass-expected.json only after
 *     that re-read agrees, so the guard and reality cannot drift apart
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveVercelToken } from '../lib/vercel-login.mjs'

const ROOT = process.cwd()
const RECORD_PATH = join(ROOT, 'scripts', 'guards', 'lib', 'firewall-bypass-expected.json')
const STRIPE_WEBHOOK_IPS_URL = 'https://stripe.com/files/ips/ips_webhooks.json'
const BYPASS_LIMIT_PRO = 25

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const REMOVE = args.includes('--remove')

if (APPLY && REMOVE) {
  console.error('firewall:bypass: --apply and --remove are opposites. Pick one.')
  process.exit(2)
}

/*
 * process.exit() rather than process.exitCode HERE, deliberately, because the
 * rest of this change went the other way and the difference should not read as
 * an oversight. The scripts a GATE consumes now set process.exitCode and let
 * the loop drain, because process.exit() with a live undici socket aborted with
 * a libuv assertion on Windows and a guard that crashes instead of failing
 * misleads its next reader. This script is run by a person at a terminal, its
 * message is printed before it stops, and nothing machine-reads its exit code,
 * so stopping immediately is the clearer behaviour.
 */
function fail(message) {
  console.error(`firewall:bypass: ${message}`)
  process.exit(1)
}

const resolved = resolveVercelToken(process.env)
if (!resolved.token) fail(`no Vercel token: ${resolved.reason}. Run \`vercel login\` once, or set VERCEL_TOKEN.`)
console.log(`firewall:bypass: authenticated by ${resolved.source}`)

/*
 * The environment FIRST, the link file second, the same order as
 * preview-deployment-state.mjs and production-parity.mjs. `.vercel/project.json`
 * is gitignored, so a fresh clone has a token and no link file, and dying there
 * with a stack trace would be worse than naming what is missing.
 */
let projectId = process.env.VERCEL_PROJECT_ID
let teamId = process.env.VERCEL_ORG_ID
if (!projectId || !teamId) {
  const file = join(ROOT, '.vercel', 'project.json')
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      projectId = projectId || parsed.projectId
      teamId = teamId || parsed.orgId
    } catch (err) {
      fail(`could not read ${file}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
if (!projectId || !teamId) {
  fail('no project or team id: set VERCEL_PROJECT_ID and VERCEL_ORG_ID, or run `vercel link` in this checkout.')
}
const query = `projectId=${projectId}&teamId=${teamId}`

async function vercel(path, init = {}) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${resolved.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  return { status: res.status, text }
}

/** Read the live rules, and normalise the capitalised keys Vercel answers with. */
async function readInstalled() {
  const res = await vercel(`/v1/security/firewall/bypass?${query}`)
  if (res.status !== 200) fail(`Vercel answered ${res.status} listing the System Bypass rules: ${res.text.slice(0, 300)}`)
  const parsed = JSON.parse(res.text)
  const rules = Array.isArray(parsed.result) ? parsed.result : []
  return rules.map((r) => ({
    id: r.Id ?? r.id ?? null,
    ip: r.Ip ?? r.ip ?? r.sourceIp ?? null,
    domain: r.Domain ?? r.domain ?? null,
    note: r.Note ?? r.note ?? '',
  }))
}

/** The addresses that should be exempt, fetched from the vendor, never typed. */
async function readStripeWebhookIps() {
  let res
  try {
    res = await fetch(STRIPE_WEBHOOK_IPS_URL, { signal: AbortSignal.timeout(30_000) })
  } catch (err) {
    fail(`could not fetch ${STRIPE_WEBHOOK_IPS_URL}: ${err instanceof Error ? err.message : String(err)}. Refusing to act on a remembered list.`)
  }
  if (!res.ok) fail(`${STRIPE_WEBHOOK_IPS_URL} answered ${res.status}. Refusing to act on a remembered list.`)
  const payload = await res.json()
  const ips = Array.isArray(payload.WEBHOOKS) ? payload.WEBHOOKS : []
  if (ips.length === 0) fail(`${STRIPE_WEBHOOK_IPS_URL} returned no addresses. Refusing to act on an empty list.`)
  return ips
}

const installed = await readInstalled()
const wanted = await readStripeWebhookIps()

console.log('')
console.log(`STRIPE publishes ${wanted.length} webhook source address(es) at ${STRIPE_WEBHOOK_IPS_URL}`)
console.log(`VERCEL has ${installed.length} System Bypass rule(s) on this project (Pro allows ${BYPASS_LIMIT_PRO})`)
for (const rule of installed) console.log(`  installed: ${rule.ip ?? rule.domain} ${rule.note ? `(${rule.note})` : ''}`.trimEnd())

const installedIps = new Set(installed.map((r) => r.ip).filter(Boolean))
const toAdd = REMOVE ? [] : wanted.filter((ip) => !installedIps.has(ip))
const toRemove = REMOVE ? installed.filter((r) => r.ip && wanted.includes(r.ip)) : []

console.log('')
if (toAdd.length === 0 && toRemove.length === 0) {
  console.log('PLAN: nothing to do. The installed rules already match what was asked for.')
} else {
  console.log('PLAN:')
  for (const ip of toAdd) console.log(`  ADD    ${ip}  (Stripe webhook source)`)
  for (const rule of toRemove) console.log(`  REMOVE ${rule.ip}  ${rule.note ? `(${rule.note})` : ''}`.trimEnd())
}

if (wanted.length + installed.length > BYPASS_LIMIT_PRO && !REMOVE) {
  fail(`this would need ${wanted.length + installed.length} rules and the Pro plan allows ${BYPASS_LIMIT_PRO}. Refusing before acting.`)
}

if (!APPLY && !REMOVE) {
  console.log('')
  console.log('Nothing was changed. This is a production infrastructure change and it is the owner\'s decision.')
  console.log('To make it:  npm run firewall:bypass -- --apply')
  process.exit(0)
}

console.log('')
for (const ip of toAdd) {
  const res = await vercel(`/v1/security/firewall/bypass?${query}`, {
    method: 'POST',
    body: JSON.stringify({ sourceIp: ip, projectScope: true, note: 'Stripe webhook source. Never let system mitigation drop a paid order.' }),
  })
  console.log(`  POST ${ip}: ${res.status}`)
  if (res.status >= 400) console.log(`       ${res.text.slice(0, 300)}`)
}
for (const rule of toRemove) {
  const res = await vercel(`/v1/security/firewall/bypass?${query}`, {
    method: 'DELETE',
    body: JSON.stringify({ sourceIp: rule.ip, projectScope: true }),
  })
  console.log(`  DELETE ${rule.ip}: ${res.status}`)
  if (res.status >= 400) console.log(`       ${res.text.slice(0, 300)}`)
}

// VERIFY BY OBSERVING, never by trusting the answer to our own call.
const after = await readInstalled()
const afterIps = after.map((r) => r.ip).filter(Boolean).sort()
console.log('')
console.log(`VERIFIED by re-reading: ${afterIps.length} rule(s) now installed`)
for (const ip of afterIps) console.log(`  ${ip}`)

const expectedAfter = REMOVE ? afterIps : [...wanted].sort()
const missing = expectedAfter.filter((ip) => !afterIps.includes(ip))
if (!REMOVE && missing.length > 0) {
  fail(`${missing.length} address(es) are still not bypassed after the apply: ${missing.join(', ')}. The record was NOT updated.`)
}

const record = JSON.parse(readFileSync(RECORD_PATH, 'utf8'))
record.decision = REMOVE ? 'PENDING-OWNER' : 'BYPASSED'
record.decidedOn = new Date().toISOString().slice(0, 10)
record.note = REMOVE
  ? 'The bypass rules were removed. Reinstall with: npm run firewall:bypass -- --apply'
  : `Stripe's ${wanted.length} published webhook source addresses bypass Vercel's system mitigation, so a paid order can never be dropped at the network layer. Re-run npm run firewall:bypass after Stripe announces an address change (they give seven days notice).`
record.expectedSourceIps = afterIps
writeFileSync(RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`)
console.log('')
console.log(`Record updated: ${RECORD_PATH.replace(ROOT, '.')}`)
console.log('Commit it. The guard scripts/guards/machine-callers-reachable.mjs compares it to the live rules on every build,')
console.log('so a rule added or deleted outside this script will fail the build rather than drift quietly.')
