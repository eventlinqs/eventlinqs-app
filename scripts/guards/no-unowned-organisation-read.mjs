/**
 * GUARD: a service-role read of an organisation's SALE POSTURE must be preceded by
 * an ownership check, in the same function.
 *
 * WHY THIS EXISTS. Migration 20260819000002 revokes SELECT on public.organisations
 * from anon and authenticated and re-grants six columns (id, name, slug,
 * description, logo_url, website). The five sale-posture columns are not among
 * them, so every legitimate reader of those columns had to move to the service
 * role. The service role bypasses RLS entirely. That trade is only safe while each
 * of those reads proves the caller may act for the organisation FIRST: without the
 * check it does not remove an exposure, it converts it into a cross-tenant read,
 * which is worse. Founder condition, 20 August 2026.
 *
 * WHAT IT CANNOT SEE, stated so nobody mistakes a pass for more than it is. It is a
 * lexical check over one function body at a time. It cannot follow an ownership
 * check performed in a caller, which is why the admitted entries below are listed
 * individually with a reason rather than matched by a pattern. It does not read the
 * database and cannot tell you what the live grants are; scripts/probe/
 * refund-and-privilege-probe.mjs does that.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SALE_COLUMNS = [
  'stripe_account_id',
  'stripe_charges_enabled',
  'stripe_payouts_enabled',
  'stripe_account_country',
  'payout_status',
]

/** Anything that proves the caller may act for this organisation. */
const OWNERSHIP_PROOFS = [
  'assertCallerMayActForOrganisation',
  'resolveOrganisationScope',
  'resolveOrganiserScope',
  'resolveEventAccess',
  'resolveRefundScope',
  'requireAdmin',
  'assertAdmin',
]

/**
 * Reviewed admissions. Printed in full on every run so the list cannot rot into
 * something nobody has looked at. A path here is NOT excused from the rule; it is
 * recorded as having been checked by hand and found to satisfy it another way.
 */
const ADMITTED = [
  ['src/lib/admin/', 'Platform admin surfaces. Authorisation is the admin role plus 2FA enforced by the admin layout and the server guards, not organisation ownership: an admin legitimately reads every organiser.'],
  ['src/app/admin/', 'Same: the admin route group, gated by role + 2FA server-side.'],
  ['src/app/api/webhooks/', 'Stripe webhooks. There is no interactive caller to own anything; the authorisation is the Stripe signature check at the top of the route.'],
  ['src/app/api/cron/', 'Cron routes. Authorisation is CRON_SECRET; no user session exists.'],
  ['src/lib/stripe/', 'Connect reconciliation and divergence detection. System-initiated, keyed by the Stripe account id that Stripe itself supplied.'],
  ['src/lib/payments/', 'The money path: charge preconditions, payout, ledger and transfer. These run from webhooks, crons and already-scoped services; resolveRefundScope and the connect gates carry the authorisation.'],
  ['src/lib/organisations/act-for.ts', 'The ownership check itself. It reads owner_id to answer the question; requiring it to call itself first would be circular.'],
  ['src/lib/events/publish-gate.ts', 'The gate. Its callers prove ownership before invoking it, enforced at those call sites and covered by tests/unit/security/publish-gate-ownership.test.ts.'],
  ['src/lib/venues/', 'Venue surfaces reading venue Connect posture, not an organisation sale decision.'],
  ['src/lib/payouts/', 'Payout notification assembly, invoked from the disbursement cron.'],
  ['src/lib/reporting/', 'Organiser reporting, scoped upstream by resolveEventAccess.'],
  ['src/app/events/', "The PUBLIC event page. There is no caller to own anything: the reader is an anonymous visitor, and the whole point is to decide whether to render a ticket selector. The five columns are collapsed to a single boolean inside the server component (organiserCanSell) and never cross the client boundary, so nothing about another organisation's Stripe posture is disclosed."],
  ['src/app/actions/reservations.ts', 'The BUYER checkout path. A buyer is not an owner and must never be required to be one; the sale gate has to run before a stranger may reserve. The verdict is collapsed to a refusal reason, never the raw columns.'],
  ['src/lib/health/', 'The platform health sentinel. System-initiated with no user session, and it reports posture to the founder alerting channel rather than to any browser.'],
]

const SRC = 'src'
const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(d, e.name)] : [],
  )

const rel = (f) => relative('.', f).split(sep).join('/')
const admittedFor = (f) => ADMITTED.find(([p]) => rel(f).startsWith(p))

/** Split a file into rough function bodies so "same function" means something. */
function functionsOf(src) {
  const lines = src.split(/\r?\n/)
  const starts = []
  lines.forEach((l, i) => {
    if (/^\s*(export\s+)?(async\s+)?function\s+\w+|^\s*(export\s+)?const\s+\w+\s*=\s*(async\s*)?\(/.test(l)) starts.push(i)
  })
  if (starts.length === 0) return [{ from: 0, to: lines.length, text: src }]
  return starts.map((s, k) => {
    const to = k + 1 < starts.length ? starts[k + 1] : lines.length
    return { from: s, to, text: lines.slice(s, to).join('\n') }
  })
}

const files = walk(SRC)
let scannedFiles = 0
let orgQueryFns = 0
let saleReads = 0
const violations = []
const admittedHits = []

for (const f of files) {
  const src = readFileSync(f, 'utf8')
  scannedFiles++
  if (!/\.from\(\s*['"]organisations['"]\s*\)/.test(src)) continue
  for (const fn of functionsOf(src)) {
    if (!/\.from\(\s*['"]organisations['"]\s*\)/.test(fn.text)) continue
    orgQueryFns++
    const readsSale = SALE_COLUMNS.filter((c) => new RegExp(`['"\`][^'"\`]*\\b${c}\\b`).test(fn.text))
    const viaConstant = /ORG_SALE_FIELDS_SELECT/.test(fn.text)
    if (readsSale.length === 0 && !viaConstant) continue
    saleReads++
    // An INLINE comparison is a proof too, and is how the Connect routes do it:
    // read with the service role, then `if (org.owner_id !== user.id) return 403`.
    const inlineOwnerCheck = /owner_id\s*!==\s*[\w.]+\.id|owner_id\s*===\s*[\w.]+\.id|\.eq\(\s*['"]owner_id['"]/.test(fn.text)
    const proof = OWNERSHIP_PROOFS.find((p) => fn.text.includes(p)) || (inlineOwnerCheck ? 'inline owner_id comparison' : undefined)
    const adm = admittedFor(f)
    if (proof) continue
    if (adm) { admittedHits.push([rel(f), adm[1]]); continue }
    violations.push({
      file: rel(f),
      line: fn.from + 1,
      cols: viaConstant ? ['ORG_SALE_FIELDS_SELECT (the five)'] : readsSale,
    })
  }
}

/*
 * RULE 2: a caller of a PRIVILEGED GATE must prove ownership too.
 *
 * Rule 1 alone has a hole, and it is the hole that matters most here. The publish
 * gate's organisations read lives inside publish-gate.ts, which is an admitted
 * path, so the CALL SITES - which pass the service-role client into it - contain no
 * `.from('organisations')` of their own and rule 1 never looks at them. Deleting
 * the ownership check in createEvent would therefore have passed. This rule closes
 * that: any function handing a service-role client to one of these gates must carry
 * an ownership proof in the same function.
 */
const PRIVILEGED_GATES = ['checkPublishGate']
const GATE_ADMITTED = [
  ['src/lib/events/publish-scheduled.ts', 'The scheduled-publish cron. There is no interactive caller: the event was already gated when the organiser scheduled it, and authorisation is CRON_SECRET.'],
]
let gateCallers = 0
const gateViolations = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  if (!PRIVILEGED_GATES.some((g) => src.includes(g + '('))) continue
  if (rel(f).startsWith('src/lib/events/publish-gate.ts')) continue
  for (const fn of functionsOf(src)) {
    const gate = PRIVILEGED_GATES.find((g) => fn.text.includes(g + '(') || fn.text.includes(g + ' ('))
    if (!gate) continue
    // Only a SERVICE-ROLE invocation is privileged. A gate handed the session
    if (!/create(Admin|Service)Client\s*\(/.test(fn.text)) continue
    gateCallers++
    const inline = /owner_id\s*!==\s*[\w.]+\.id|owner_id\s*===\s*[\w.]+\.id|\.eq\(\s*['"]owner_id['"]/.test(fn.text)
    const proof = OWNERSHIP_PROOFS.find((pr) => fn.text.includes(pr)) || (inline ? 'inline owner_id comparison' : undefined)
    if (proof) continue
    if (GATE_ADMITTED.find(([pp]) => rel(f).startsWith(pp))) continue
    gateViolations.push({ file: rel(f), line: fn.from + 1, gate })
  }
}

console.log(`[no-unowned-organisation-read] scanned ${scannedFiles} TypeScript file(s) under ${SRC}/`)
console.log(`[no-unowned-organisation-read] rule 2: ${gateCallers} function(s) hand a service-role client to ${PRIVILEGED_GATES.join(', ')}`)
console.log(`[no-unowned-organisation-read] ${orgQueryFns} function(s) query organisations; ${saleReads} of them read the sale posture`)
console.log(`[no-unowned-organisation-read] ownership proofs recognised: ${OWNERSHIP_PROOFS.join(', ')}`)
console.log(`[no-unowned-organisation-read] reviewed admissions, ${ADMITTED.length} entr(ies), printed so they cannot rot:`)
for (const [p, why] of ADMITTED) {
  const used = admittedHits.some(([f]) => f.startsWith(p))
  console.log(`    ${used ? 'matched     ' : 'no match now'} ${p}`)
  console.log(`        ${why}`)
}

if (saleReads === 0) {
  console.error('[no-unowned-organisation-read] FAIL - zero sale-posture reads found. This guard has nothing to judge,')
  console.error('  which means the matcher is broken rather than the tree being clean. A zero is a failure here.')
  process.exit(1)
}

if (gateCallers === 0) {
  console.error('[no-unowned-organisation-read] FAIL - rule 2 found zero privileged gate callers.')
  console.error('  checkPublishGate is called from the organiser dashboard; finding none means the matcher broke.')
  process.exit(1)
}

if (gateViolations.length > 0) {
  console.error(`
[no-unowned-organisation-read] FAIL - ${gateViolations.length} caller(s) hand a service-role client to a privileged gate with no ownership check.`)
  for (const v of gateViolations) console.error(`    ${v.file}:${v.line}  calls ${v.gate}`)
  console.error("  Prove the caller may act for the organisation BEFORE invoking the gate:")
  console.error("    const authority = await assertCallerMayActForOrganisation(user.id, organisationId, 'owner_or_manager')")
  process.exit(1)
}

if (violations.length > 0) {
  console.error(`\n[no-unowned-organisation-read] FAIL - ${violations.length} service-role read(s) of an organisation's sale posture with no ownership check in the same function.`)
  for (const v of violations) {
    console.error(`    ${v.file}:${v.line}`)
    console.error(`        reads: ${v.cols.join(', ')}`)
  }
  console.error('\n  The service role bypasses RLS. Prove the caller may act for the organisation first:')
  console.error("    const authority = await assertCallerMayActForOrganisation(user.id, organisationId, 'owner_or_manager')")
  console.error("    if (!authority.ok) return { error: 'Not found' }")
  process.exit(1)
}

console.log(`[no-unowned-organisation-read] PASS - ${saleReads} sale-posture read(s) and ${gateCallers} privileged gate caller(s), every one behind an ownership check or a reviewed admission.`)
