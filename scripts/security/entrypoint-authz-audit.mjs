#!/usr/bin/env node
/**
 * Enumerate EVERY request entry point and adjudicate its authorisation posture.
 *
 * WHY. The security pass audited roughly 20 of 50 route handlers and a handful of
 * 119 server actions, then reported the rest as "unread, not known-good". That was
 * honest and useless: an attacker does not care which files were sampled. This
 * walks all 169 and produces a verdict per entry point, so the coverage claim is
 * mechanical rather than a promise.
 *
 * THE THREAT IT IS AIMED AT, from docs/security/THREAT-MODEL.md: the organiser is
 * the most dangerous authenticated actor, because the product deliberately hands
 * them bulk personal data for their own events. The only thing between an organiser
 * and a competitor's customer list is a correct ownership check on every query. So
 * the column that matters most here is not "is it authenticated" but "is the
 * caller's identity actually used to SCOPE the data".
 *
 * WHAT IT CANNOT DO. This is static analysis over source text. It cannot prove a
 * gate is correct, only that a recognised gate is present and that the identity
 * reaches a filter. Its output is a WORK LIST ranked for human reading, and every
 * RED verdict in the report was then read by hand. It is deliberately biased to
 * over-report: a false RED costs a read, a false GREEN costs a breach.
 *
 * Modes:
 *   (default)   human report, grouped by verdict
 *   --json      machine output for the test to assert against
 *   --check     exit 1 if any entry point has NO declared posture (build gate)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const APP = path.join(ROOT, 'src/app')

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (e.endsWith('.ts') || e.endsWith('.tsx')) out.push(full)
  }
  return out
}

/** Slice a function body from its export to the next top-level export or EOF. */
function bodies(src, kind) {
  const out = []
  const re =
    kind === 'route'
      ? /^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/gm
      : /^export\s+(?:(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)|const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\()/gm
  const marks = []
  let m
  while ((m = re.exec(src)) !== null) {
    marks.push({ name: m[1] || m[2] || m[3], start: m.index })
  }
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : src.length
    out.push({ name: marks[i].name, body: src.slice(marks[i].start, end) })
  }
  return out
}

// ── Signals ────────────────────────────────────────────────────────────────────

/** Proves the caller's identity was established by a trusted mechanism. */
const AUTH = [
  { re: /auth\.getUser\s*\(/, how: 'getUser' },
  { re: /getAdminSession\s*\(/, how: 'admin session' },
  { re: /requireCronAuth\s*\(/, how: 'CRON_SECRET' },
  { re: /constructWebhookEvent|constructEvent/, how: 'Stripe signature' },
  { re: /resolveOrganiserScope\s*\(/, how: 'organiser scope' },
  { re: /getOrganiserEvent\s*\(/, how: 'organiser event gate' },
  { re: /requireAdmin|assertAdmin|requireCapability/, how: 'admin capability' },
  { re: /verifyHealthToken|HEALTH_CHECK_TOKEN/, how: 'health token' },
]

/**
 * Proves the identity is used to SCOPE the work, not merely to prove someone is
 * logged in. This is the column that matters for the organiser threat.
 */
const AUTHZ = [
  { re: /getOrganiserEvent\s*\(/, how: 'getOrganiserEvent (owner gate)' },
  { re: /resolveOrganiserScope\s*\(/, how: 'resolveOrganiserScope (owner gate)' },
  { re: /owner_id\s*!==\s*\w+\.id|\w+\.owner_id\s*!==/, how: 'explicit owner_id comparison' },
  { re: /\.eq\(\s*['"]owner_id['"]\s*,\s*\w+(\.id)?\s*\)/, how: "eq('owner_id', user)" },
  { re: /\.eq\(\s*['"]user_id['"]\s*,\s*\w+(\.id)?\s*\)/, how: "eq('user_id', user)" },
  { re: /\.eq\(\s*['"]id['"]\s*,\s*user\.id\s*\)/, how: "eq('id', user.id)" },
  { re: /\.rpc\(/, how: 'SECURITY DEFINER rpc enforces it' },
  { re: /organisation_members/, how: 'membership check' },
  { re: /requireCapability|hasCapability/, how: 'capability check' },
  { re: /getAdminSession\s*\(/, how: 'admin-only surface' },
  { re: /requireCronAuth\s*\(/, how: 'machine caller, no user data scoping needed' },
  // Cross-module gates, each READ and verified during the 2026-08-09 sweep. A
  // call to one counts as an ownership check because the function itself performs
  // one and fails closed. Adding to this list means "I read it", not "the name
  // sounds reassuring".
  { re: /resolveSeatingOrganisation\s*\(/, how: 'resolveSeatingOrganisation: owner or seating-manager member, then the venue must belong to that org' },
  { re: /canManageOrganisationSeating\s*\(/, how: 'canManageOrganisationSeating: org-scoped' },
  { re: /requestTicketRefund\s*\(|resolveRefundScope\s*\(/, how: 'resolveRefundScope: admin, or owner_id === actorId, or organisation_members; defaults not_authorised' },
  { re: /assertSquadAccess\s*\(/, how: 'assertSquadAccess: signed-in member, or guest holding the squad share token' },
  // Broadened after the sweep found correct gates the first patterns missed. Each
  // was verified by reading the code, not inferred from the name.
  { re: /requireAdminSession\s*\(/, how: 'admin-only surface: an admin is authorised for every row by definition' },
  { re: /\w*_?user_id\s*!==\s*\w+(\.id)?/, how: 'explicit <x>_user_id !== caller comparison' },
  { re: /\.eq\(\s*['"]leader_user_id['"]\s*,\s*\w+(\.id)?\s*\)/, how: "eq('leader_user_id', user)" },
  { re: /\.eq\(\s*['"]session_id['"]/, how: 'scoped by the queue session id, which is the entry identity' },
  { re: /\.eq\(\s*['"]applicant_user_id['"]/, how: "eq('applicant_user_id', user)" },
  { re: /ByToken\s*\(|\.eq\(\s*['"](share_token|unsubscribe_token|invite_token|position_token)['"]/, how: 'the token is the credential' },
  { re: /fetchArtistForOwner\s*\(/, how: 'fetchArtistForOwner: resolves only the artist profile owned by the caller' },
  { re: /requireActiveOrganisation\s*\(/, how: 'requireActiveOrganisation: eq(owner_id, callerId)' },
]

const VALIDATION = [
  { re: /\.safeParse\s*\(/, how: 'zod safeParse' },
  { re: /z\.object\s*\(|Schema\.parse\s*\(/, how: 'zod schema' },
  { re: /EMAIL_RE|\.test\(|typeof \w+ !== ['"]string['"]/, how: 'explicit validation' },
  { re: /Number\.isFinite|Number\.isInteger/, how: 'numeric validation' },
]

/** An identifier arriving from the caller, which is what IDOR needs. */
const TAKES_ID =
  /params\s*[:)]|searchParams\.get\(|formData\.get\(|body\.[a-zA-Z_]*[Ii]d|\b\w*[Ii]d\s*:\s*string|\(\s*\w*[Ii]d\s*:/

/**
 * Reads or writes through a client that BYPASSES RLS.
 *
 * THE DECISIVE DISTINCTION IN THIS WHOLE AUDIT, and the first version got it
 * wrong by testing the whole FILE rather than the function.
 *
 * A session-client write is governed by Row Level Security, so the DATABASE
 * enforces row scope and the application does not have to. `deleteEvent` looks
 * alarming in isolation: it takes an eventId from the caller and runs
 * `.delete().eq('id', eventId)` with no owner filter anywhere in the function. It
 * is nonetheless safe, because it uses the session client and `public.events`
 * carries `[DELETE] "Org owners can delete draft events"` scoped to
 * `organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())`.
 * The same is true of publishEvent, pauseEvent and cancelEvent.
 *
 * A service-role write has no such backstop: RLS is off, so a missing ownership
 * check IS the vulnerability. That is why the threat model calls the 230
 * `createAdminClient()` sites the largest authorisation surface in the system.
 *
 * So: privileged is computed PER FUNCTION (body plus resolved local helpers), and
 * only a privileged path with no ownership check is ranked RED.
 */
const PRIVILEGED = /createAdminClient\s*\(|\badmin(?:Client)?\s*\.\s*from\s*\(/

/** Deliberately public surfaces, with the reason each is safe unauthenticated. */
const PUBLIC_BY_DESIGN = {
  'api/auth/signup/POST': 'creates an account; abuse bounded by auth-signup rate limit',
  'api/auth/recover/POST': 'password reset request; generic response, rate limited',
  'api/auth/magic-link/POST': 'magic link request; generic response, rate limited',
  'api/auth/resend-verification/POST': 'verification resend; generic response, rate limited',
  'api/newsletter/subscribe/POST': 'public newsletter opt-in',
  'api/location/set/POST': 'writes a non-sensitive location preference cookie',
  'api/home/surprise/GET': 'returns a random published event',
  'api/ai/status/GET': 'reports whether the assistant is configured',
  'api/broadcast/track/POST': 'anonymous view beacon, deduped server-side',
  'api/tickets/[code]/qr/GET': 'BEARER auth: (ticket_code, secret) pair is the credential',
  'api/og/event/[slug]/GET': 'public Open Graph image for a published event',
  'auth/callback/GET': 'OAuth/PKCE callback; the code is the credential',
  'auth/confirm/GET': 'email confirmation; the token_hash is the credential',
  's/[code]/GET': 'public short link redirect',
  'api/health/redis/GET': 'health probe, rate limited',
  'api/health/sentry-error/GET': 'synthetic error probe, token gated and rate limited',
  'dev/connect-onboarding-preview/GET': 'dev-only; /dev/* returns 404 in production via proxy',
  'api/cron/warm/GET': 'cache warmer, CRON_SECRET gated',
  // Server actions with no caller identity, each READ during the 2026-08-09 sweep
  // and confirmed safe unauthenticated. The reason is recorded because "it has no
  // auth check" is a fact, and "that is correct" is a judgement someone must own.
  'actions/access-codes.ts::validateAccessCode': 'a guest redeems a tier access code; the code IS the credential',
  'actions/access-codes.ts::getUnlockedTierIds': 'reads codes already unlocked in this session cookie',
  'actions/auth-rate-limit.ts::assertLoginRateLimit': 'the rate limiter itself, called before any identity exists',
  'actions/auth.ts::signOut': 'ends whatever session the caller has; nothing to authorise',
  'actions/best-available.ts::pickBestAvailableAction': 'seat suggestion over public availability; guests check out',
  'actions/consent.ts::unsubscribeFromDigestAction': 'per-row unsubscribe token IS the credential; returns void, so no enumeration',
  'actions/consent.ts::unsubscribeFromOrganiserAction': 'per-row unsubscribe token IS the credential; returns void',
  'actions/discount-codes.ts::validateDiscountCode': 'a guest applies a discount code at checkout',
  'actions/email-subscribe.ts::submitEmailSignup': 'public newsletter opt-in',
  'actions/queue.ts::getQueuePosition': 'reads a position by queue id; positions are not sensitive',
  'actions/queue.ts::validateQueueToken': 'verifies a signed admission token; the signature is the credential',
  'actions/reservations.ts::getReservation': 'SESSION client, so RLS applies: reservations SELECT is auth.uid() = user_id',
  'actions/squads.ts::getSquadByToken': 'the squad share token IS the credential',
  'actions/waitlist.ts::getWaitlistPosition': 'reads a position by waitlist id; positions are not sensitive',
  'events/actions.ts::loadEventsInBbox': 'public event map data for published public events',
  'events/actions.ts::loadMoreEventCards': 'public event pagination',
  'waitlist/actions.ts::joinCityWaitlist': 'public city waitlist opt-in, rate limited',
  'waitlist/actions.ts::leaveCityWaitlistAction': 'per-row token IS the credential',
  'actions/lineup.ts::searchArtistsAction': 'searches the public artists table by name; returns no private field',
}

function match(list, body) {
  for (const s of list) if (s.re.test(body)) return s.how
  return null
}

/**
 * Module-local helper bodies, so a gate reached through one is still seen.
 *
 * WITHOUT THIS the audit is worthless. src/app/actions/gigs.ts has eleven exported
 * actions, every one of which authenticates by calling a local `requireUser()` and
 * scopes by calling `requireActiveOrganisation(userId)`, which filters
 * `eq('owner_id', userId)`. A per-function text slice sees neither, so the first
 * run reported all eleven as RED-NO-AUTH. Thirty-nine false REDs would have buried
 * the real ones, which is the failure mode that makes a scanner get ignored.
 */
function localHelpers(src) {
  const map = new Map()
  const re = /^(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(/gm
  const marks = []
  let m
  while ((m = re.exec(src)) !== null) marks.push({ name: m[1], start: m.index })
  const alt = /^const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]*)?=>/gm
  while ((m = alt.exec(src)) !== null) marks.push({ name: m[1], start: m.index })
  marks.sort((a, b) => a.start - b.start)
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : src.length
    map.set(marks[i].name, src.slice(marks[i].start, end))
  }
  return map
}

/** Body plus the bodies of local helpers it calls, resolved two levels deep. */
function withHelpers(body, helpers, depth = 2, seen = new Set()) {
  if (depth === 0) return body
  let out = body
  for (const [name, hbody] of helpers) {
    if (seen.has(name)) continue
    if (new RegExp(`\\b${name}\\s*\\(`).test(body)) {
      seen.add(name)
      out += '\n' + withHelpers(hbody, helpers, depth - 1, seen)
    }
  }
  return out
}

const rows = []

for (const file of walk(APP)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const src = readFileSync(file, 'utf8')
  const isRoute = /\/route\.tsx?$/.test(rel)
  const isAction = /^['"]use server['"]/m.test(src)
  if (!isRoute && !isAction) continue

  const routeId = rel.replace(/^src\/app\//, '').replace(/\/route\.tsx?$/, '')
  const helpers = localHelpers(src)

  for (const { name, body: raw } of bodies(src, isRoute ? 'route' : 'action')) {
    const body = withHelpers(raw, helpers)
    const id = isRoute ? `${routeId}/${name}` : `${routeId}::${name}`
    rows.push({
      id,
      file: rel,
      kind: isRoute ? 'route' : 'action',
      name,
      auth: match(AUTH, body),
      authz: match(AUTHZ, body),
      validation: match(VALIDATION, body),
      takesId: TAKES_ID.test(body),
      privileged: PRIVILEGED.test(body),
      publicReason: PUBLIC_BY_DESIGN[id] ?? null,
    })
  }
}

/**
 * Verdict.
 *
 * RED is the work list, not an accusation: it means a human has to read it.
 * The combination that matters most is "takes an id from the caller, reads through
 * a client that bypasses RLS, and nothing ties the caller's identity to the row".
 */
for (const r of rows) {
  if (r.publicReason) r.verdict = 'PUBLIC-BY-DESIGN'
  else if (!r.auth) r.verdict = 'RED-NO-AUTH'
  else if (r.authz) r.verdict = 'GREEN'
  // Not privileged means the session client, which means RLS is the enforcer.
  // The database scopes the rows; the application does not have to.
  else if (!r.privileged) r.verdict = 'GREEN-VIA-RLS'
  else r.verdict = r.takesId ? 'RED-IDOR-RISK' : 'AMBER-PRIVILEGED-NO-SCOPE'
}

const order = ['RED-NO-AUTH', 'RED-IDOR-RISK', 'AMBER-PRIVILEGED-NO-SCOPE', 'GREEN', 'GREEN-VIA-RLS', 'PUBLIC-BY-DESIGN']
rows.sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict) || a.id.localeCompare(b.id))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2))
  process.exit(0)
}

const counts = {}
for (const r of rows) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1

console.log(`Entry points: ${rows.length} (${rows.filter((r) => r.kind === 'route').length} route handlers, ${rows.filter((r) => r.kind === 'action').length} server actions)\n`)
for (const v of order) if (counts[v]) console.log(`  ${v.padEnd(18)} ${counts[v]}`)
console.log('')

for (const v of order) {
  const group = rows.filter((r) => r.verdict === v)
  if (!group.length || v.startsWith('GREEN') || v === 'PUBLIC-BY-DESIGN') continue
  console.log(`\n### ${v} (${group.length})`)
  for (const r of group) {
    console.log(`  ${r.id}`)
    console.log(
      `      ${r.file}  auth=${r.auth ?? 'NONE'}  authz=${r.authz ?? 'NONE'}` +
        `  validation=${r.validation ?? 'none'}  takesId=${r.takesId}  privileged=${r.privileged}`,
    )
  }
}

if (true) {
  const undeclared = rows.filter((r) => r.verdict === 'RED-NO-AUTH')
  if (undeclared.length) {
    console.error(
      `\n[entrypoint-authz] FAIL - ${undeclared.length} entry point(s) establish no caller identity\n` +
        `and are not declared PUBLIC_BY_DESIGN. Every entry point must do one or the other,\n` +
        `so a route added next month cannot skip this silently.\n` +
        `Either add an auth check, or add the id to PUBLIC_BY_DESIGN with the reason it is safe.`,
    )
    process.exit(1)
  }
  console.log('[entrypoint-authz] PASS - every entry point declares an auth posture.')
}
