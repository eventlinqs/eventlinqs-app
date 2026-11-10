/**
 * RESEND'S DELIVERY WEBHOOK, REGISTERED AND ITS SECRET STORED, IN ONE COMMAND (LAW 10, script the founder's step;
 * WINDOW 5A, 10 November 2026).
 *
 * Why: production's email_delivery_events had no row at all on 10 November 2026, because POST /api/webhooks/resend on
 * www answered 503 {"error":"not configured"}: RESEND_WEBHOOK_SECRET is not set on production
 * (src/app/api/webhooks/resend/route.ts), so no delivery, bounce or complaint has ever been recorded. The manifest
 * (src/lib/env/manifest.mjs) names the fix 'a scripted production configuration write under the project manager's YES'.
 *
 * What it does, refusing before it acts:
 *   1. checks the Resend key it holds belongs to the account that sends EventLinqs mail (the domain eventlinqs.com is
 *      verified there), so the webhook is made in the right account;
 *   2. lists that account's webhooks and finds one aimed at the route;
 *   3. lists production's variable names through the Vercel CLI (names only, never values);
 *   4. probes the route with an unsigned POST (503 means the secret is missing, 400 means it is set and verifying).
 * The dry run (the default) stops there and prints the plan.
 * With --apply, and APPLY typed: makes the webhook if none exists (Resend's create call returns its signing_secret,
 * https://resend.com/docs/api-reference/webhooks/create-webhook), or reads the existing one's
 * (https://resend.com/docs/api-reference/webhooks/get-webhook, both read 10 November 2026); then stores it as a
 * sensitive production variable with `vercel env add RESEND_WEBHOOK_SECRET production --sensitive --force --yes` on
 * standard input (https://vercel.com/docs/cli/env), and logs one line, no secret, to C:\dev\PRODUCTION-WRITES.txt. The
 * secret is never printed or written to a file. The next production deployment carries it (a merge's own deploy).
 * With --prove: the unsigned probe must answer 400 'missing signature headers', not 503.
 *
 * Usage (PowerShell, from a checkout, logged in to the Vercel CLI). The Resend key is set in YOUR shell session only,
 * never in a file or a chat: the local .env.local files hold a blank RESEND_API_KEY, and production's lives in Vercel
 * as a sensitive value nobody can read back. Copy it from Resend's dashboard (API Keys) into the session:
 *   $env:RESEND_API_KEY = '<the key from Resend>'
 *   node scripts/ops/register-resend-webhook.mjs            (dry run)
 *   node scripts/ops/register-resend-webhook.mjs --apply    (asks for APPLY)
 *   node scripts/ops/register-resend-webhook.mjs --prove    (after the next production deploy; needs no key)
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, readSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SITE = 'https://www.eventlinqs.com.au'
const ROUTE = `${SITE}/api/webhooks/resend`
const SENDING_DOMAIN = 'eventlinqs.com'
const VAR = 'RESEND_WEBHOOK_SECRET'
const WRITES_LOG = 'C:\\dev\\PRODUCTION-WRITES.txt'
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const PROVE = args.includes('--prove')

/** A refusal stops the run before anything is written; the runner prints it and exits 2. */
class Refusal extends Error {}
function fail(message) {
  throw new Refusal(message)
}

/** The events the route records, read from its one source so the two can never differ. */
function recordedEvents() {
  const src = readFileSync(resolve(REPO, 'src', 'lib', 'email', 'delivery-events.ts'), 'utf8')
  const m = src.match(/export const RECORDED_EVENTS = \[([^\]]+)\] as const/)
  if (!m) fail('RECORDED_EVENTS is not declared in src/lib/email/delivery-events.ts')
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

async function probe() {
  const res = await fetch(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'EventLinqs-ops-crawler/1.0 (register-resend-webhook)' },
    body: '{}',
  })
  const body = await res.text()
  return { status: res.status, body: body.slice(0, 120) }
}

async function resend(path, init = {}) {
  const key = process.env.RESEND_API_KEY
  if (!key) fail("RESEND_API_KEY is not in this shell session. Set it from Resend's dashboard: $env:RESEND_API_KEY = '<key>'")
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await res.text()
  if (!res.ok) fail(`Resend ${init.method ?? 'GET'} ${path} answered ${res.status}: ${text.slice(0, 160)}`)
  return JSON.parse(text)
}

function vercel(argv, input) {
  const vc = process.env.APPDATA ? resolve(process.env.APPDATA, 'npm', 'node_modules', 'vercel', 'dist', 'vc.js') : null
  if (!vc || !existsSync(vc)) fail('the Vercel CLI is not installed (npm i -g vercel).')
  return spawnSync(process.execPath, [vc, ...argv], { cwd: REPO, input, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
}

function askLine(question) {
  process.stdout.write(question)
  const buf = Buffer.alloc(256)
  let read = 0
  try {
    read = readSync(0, buf, 0, 256, null)
  } catch (error) {
    fail(`could not read the typed answer: ${error instanceof Error ? error.message : String(error)}`)
  }
  return buf.subarray(0, read).toString('utf8')
}

async function main() {
  if (PROVE) {
    const p = await probe()
    console.log(`  unsigned POST ${ROUTE}: ${p.status} ${p.body}`)
    if (p.status === 400 && p.body.includes('missing signature headers')) {
      console.log('PROVED: the route holds its secret and refuses an unsigned request.')
      return 0
    }
    console.log('NOT PROVED: the route does not yet answer 400 for an unsigned request; the secret is not live.')
    return 1
  }

  // 1. The right account.
  const domains = await resend('/domains')
  const sending = (domains.data ?? []).find((d) => d.name === SENDING_DOMAIN)
  if (!sending) fail(`this Resend key's account has no domain ${SENDING_DOMAIN}; it is not the account that sends EventLinqs mail.`)
  if (sending.status !== 'verified') fail(`${SENDING_DOMAIN} is '${sending.status}' in this account, not verified.`)
  console.log(`  Resend account       sends as ${SENDING_DOMAIN} (verified)`)

  // 2. The webhook.
  const hooks = await resend('/webhooks')
  const ours = (hooks.data ?? []).filter((h) => h.endpoint === ROUTE)
  if (ours.length > 1) fail(`${ours.length} webhooks already aim at ${ROUTE}; read them in Resend before anything is made.`)
  const events = recordedEvents()
  console.log(`  webhook              ${ours.length ? `${ours[0].id}, ${ours[0].status}, ${ours[0].events.length} events` : 'none aimed at the route'}`)

  // 3. Production's variable names.
  if (!existsSync(resolve(REPO, '.vercel', 'project.json'))) fail('.vercel/project.json is missing; run `vercel link` first.')
  const ls = vercel(['env', 'ls', 'production'])
  if (ls.status !== 0) fail(`vercel env ls production failed: ${(ls.stderr || ls.stdout).trim().slice(0, 200)}`)
  const hasVar = new RegExp(`^\\s*${VAR}\\s`, 'm').test(ls.stdout)
  console.log(`  ${VAR} on production: ${hasVar ? 'present' : 'absent'}`)

  // 4. The route.
  const before = await probe()
  console.log(`  unsigned POST        ${before.status} ${before.body}`)

  if (!APPLY) {
    console.log(`\nDRY RUN. With --apply it would ${ours.length ? `read webhook ${ours[0].id}'s signing secret` : `make a webhook at ${ROUTE} for ${events.join(', ')}`},`)
    console.log(`then store it as ${VAR} on production (sensitive, never printed), and log one line to ${WRITES_LOG}.`)
    return 0
  }

  if (askLine(`Type APPLY to ${ours.length ? 'read the webhook' : 'make the webhook'} and store ${VAR} on production: `).trim() !== 'APPLY') {
    fail('not applied: APPLY was not typed.')
  }

  const secretHolder = ours.length
    ? await resend(`/webhooks/${ours[0].id}`)
    : await resend('/webhooks', { method: 'POST', body: JSON.stringify({ endpoint: ROUTE, events }) })
  const secret = secretHolder.signing_secret
  if (typeof secret !== 'string' || secret.length < 10) fail('Resend returned no signing secret.')
  const add = vercel(['env', 'add', VAR, 'production', '--sensitive', '--force', '--yes'], secret)
  if (add.status !== 0) fail(`vercel env add failed: ${(add.stderr || add.stdout).replaceAll(secret, '[secret]').trim().slice(0, 200)}`)

  const after = vercel(['env', 'ls', 'production'])
  const stored = after.status === 0 && new RegExp(`^\\s*${VAR}\\s`, 'm').test(after.stdout)
  appendFileSync(
    WRITES_LOG,
    `${new Date().toISOString()} register-resend-webhook: webhook ${secretHolder.id} at ${ROUTE}; ${VAR} stored on production (sensitive, ${secret.length} characters, never printed); read back ${stored ? 'present' : 'ABSENT'}\n`,
  )
  if (!stored) fail(`${VAR} did not read back on production.`)
  console.log(`STORED: ${VAR} on production, read back present. It is live from the next production deployment; then run --prove.`)
  return 0
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    if (error instanceof Refusal) console.error(`REFUSED: ${error.message}`)
    else console.error(`FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    process.exitCode = error instanceof Refusal ? 2 : 1
  },
)
