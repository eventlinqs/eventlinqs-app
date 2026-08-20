/**
 * A QUERY THAT FEEDS A GATE MUST SELECT EVERY FIELD THAT GATE READS.
 *
 * FOUNDER RULING, 18 August 2026: "Every gate on this platform that reads a set
 * of fields must be unable to run on an incomplete set."
 *
 * THE SHAPE, twice in one week, and it is a design flaw rather than two typos.
 * A gate reads N fields. A query supplies them. Nothing connects the two, so the
 * query can narrow while the gate goes on reading, and the fields it no longer
 * supplies arrive `undefined`. At a boolean test BOTH `!undefined` and
 * `undefined !== true` are true, so the gate refuses, and its refusal is
 * indistinguishable from a real one.
 *
 *   15 August  a security migration revoked two of five organisation columns
 *              from anon. The embed was narrowed correctly, the gate went on
 *              reading all five, and EVERY PAID EVENT went off sale behind a
 *              message blaming the organiser payment setup.
 *   18 August  a select named events.external_ticket_url, a column production
 *              did not have. PostgREST failed the whole request, the caller
 *              discarded the error, and the organisation was never read at all.
 *              Same outcome, same message, a whole evening spent editing a
 *              sales-start field that does not exist in this codebase.
 *
 * WHAT THIS CHECKS, and it is deliberately mechanical rather than clever:
 *
 *   1. Each registered gate declares its required fields as a Pick<Organisation,
 *      ...> in its own signature. That list is READ OUT OF THE SOURCE, not
 *      duplicated here, so a gate that grows a sixth field is covered the moment
 *      it is added rather than when somebody remembers to update this file.
 *   2. Every file that BOTH selects from `organisations` AND calls that gate must
 *      have a select carrying every field the gate reads.
 *   3. A gate boundary must not end in a bare cast. `return data as OrgFields` is
 *      an assertion by the author that nobody checks, and it is what let the
 *      narrowed select compile.
 *
 * WHAT IT CANNOT SEE, stated plainly. It reads source text and matches a query
 * to a gate by FILE, so a row loaded in one module and passed to a gate in
 * another is outside its reach; that case is covered by the branded type on
 * VerifiedOrgSaleFields, which cannot be constructed without the verifier. The
 * two together are the belt and the braces, and neither is claimed to be both.
 *
 * IT PRINTS WHAT IT SCANNED and FAILS if it scanned nothing, because a guard
 * that silently matches zero gates reports safety it never checked.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'src')

const failures = []

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry)) acc.push(full)
  }
  return acc
}
const files = walk(SRC)
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/')
const read = (f) => readFileSync(f, 'utf8')

/**
 * Comment lines are documentation, not code.
 *
 * The first run of this guard flagged its own explanation twice, because the
 * comment describing the defect quotes the defect verbatim. Only WHOLE-LINE
 * comments are dropped, never a fragment after code on the same line, so nothing
 * real can hide behind a trailing `//`.
 */
const codeOnly = (src) =>
  src
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim()
      return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'))
    })
    .join('\n')

/**
 * The registered gates: a decision function whose parameter is a
 * `Pick<Organisation, ...>`. The required list comes from that Pick.
 */
const GATES = [
  {
    fn: 'isOrganiserSellable',
    declaredIn: 'src/lib/payments/sale-status.ts',
    typeAlias: 'OrgSaleFields',
    /*
     * THE ENTRY POINTS, and this list exists because the drill caught its
     * absence. The first version matched only a direct call to
     * `isOrganiserSellable`, so narrowing the select in reservations.ts to two
     * columns PASSED: that file reaches the gate through `ticketsOnSaleDetailed`
     * and never names the gate itself. A guard that only sees direct callers is
     * blind to every caller that goes through the front door, which is all of
     * them.
     */
    reachedVia: ['ticketsOnSaleDetailed', 'ticketsOnSale'],
  },
  {
    fn: 'assertOrganiserCanReceiveFunds',
    declaredIn: 'src/lib/payments/application-fee.ts',
    inline: true,
    /*
     * NO ENTRY POINTS, and that is a finding rather than an omission.
     *
     * `createPlatformCharge` was listed here first, and it made the guard fire on
     * checkout.ts and squad-checkout.ts. Both were FALSE: those files select
     * `name` from organisations for the statement descriptor, nothing to do with
     * the gate, and the gate's row is loaded inside createPlatformCharge by
     * loadOrgChargeFields, which selects the full list and now verifies its
     * presence rather than casting. A caller that supplies no row cannot supply
     * an incomplete one, so requiring the caller to select gate fields would be
     * demanding a query it has no reason to run.
     *
     * The lesson is kept because it is the same lesson twice: a guard that
     * cannot tell a query feeding a gate from a query beside one produces noise,
     * and noise is how a gate ends up switched off.
     */
    reachedVia: [],
  },
  {
    fn: 'assertCanCreateDestinationCharge',
    declaredIn: 'src/lib/payments/application-fee.ts',
    inline: true,
    reachedVia: [],
  },
]

/** Pull the field names out of a Pick<Organisation, 'a' | 'b'> block. */
function fieldsFromPick(src, anchor) {
  const at = src.indexOf(anchor)
  if (at === -1) return null
  const pickAt = src.indexOf('Pick<', at)
  if (pickAt === -1 || pickAt - at > 400) return null
  const close = src.indexOf('>', pickAt)
  const body = src.slice(pickAt, close === -1 ? pickAt + 400 : close)
  const names = [...body.matchAll(/'([a-z0-9_]+)'/gi)].map((m) => m[1])
  return names.length > 0 ? names : null
}

const resolved = []
for (const gate of GATES) {
  const src = read(join(ROOT, gate.declaredIn))
  const anchor = gate.inline
    ? `export function ${gate.fn}(`
    : `type ${gate.typeAlias} = `
  const fields = fieldsFromPick(src, anchor)
  if (!fields) {
    failures.push(
      `${gate.declaredIn}: could not read the required field list for ${gate.fn}. The guard has ` +
        `gone blind on a gate it is registered to protect, which is a failure, not a pass.`,
    )
    continue
  }
  resolved.push({ ...gate, fields })
}

console.log(`[gate-fields-complete] scanned ${files.length} TypeScript file(s) under src`)
console.log(`[gate-fields-complete] ${resolved.length} of ${GATES.length} registered gate(s) resolved their required fields from source:`)
for (const g of resolved) console.log(`    ${g.fn.padEnd(34)} needs ${g.fields.join(', ')}`)

if (resolved.length === 0) {
  failures.push('ZERO gates resolved. Nothing was checked, so nothing was protected.')
}

/* -------------------------------------------------------------------------
 * 1. A file that selects organisations AND calls a gate must select its fields.
 * ----------------------------------------------------------------------- */
let pairsChecked = 0
for (const file of files) {
  const src = read(file)
  if (!/\.from\(\s*['"]organisations['"]\s*\)/.test(src)) continue

  for (const gate of resolved) {
    // The gate must actually be REACHED here, directly or through one of its
    // entry points, not merely imported.
    const names = [gate.fn, ...(gate.reachedVia ?? [])]
    const reached = names.some((n) => new RegExp(String.raw`\b${n}\s*\(`).test(src))
    if (!reached) continue
    if (rel(file) === gate.declaredIn) continue
    pairsChecked += 1

    // Every select list in the file, plus any select-list constant it defines.
    const selects = [...src.matchAll(/\.select\(\s*([^)]*)\)/g)].map((m) => m[1])
    const constants = [...src.matchAll(/=\s*'([^']*(?:stripe_|payout_)[^']*)'/g)].map((m) => m[1])
    const haystack = [...selects, ...constants].join(' | ')

    // A select referring to a shared constant is the CORRECT pattern and is
    // recognised rather than punished.
    const usesSharedList = /_FIELDS_SELECT/.test(haystack)

    const missing = usesSharedList
      ? []
      : gate.fields.filter((f) => !haystack.includes(f))

    if (missing.length > 0) {
      failures.push(
        `${rel(file)}: calls ${gate.fn}, which reads ${gate.fields.join(', ')}, but its ` +
          `organisations select does not supply ${missing.join(', ')}. A field the gate reads and ` +
          `the query does not select arrives undefined, and undefined refuses. Select the shared ` +
          `list instead of a hand-typed one.`,
      )
    }
  }
}
console.log(`[gate-fields-complete] checked ${pairsChecked} query-and-gate pairing(s) for a short select`)

/* -------------------------------------------------------------------------
 * 2. A gate boundary must not end in a bare cast.
 * ----------------------------------------------------------------------- */
const CAST_AT_BOUNDARY = /return\s+data\s+as\s+(Org\w*|\w*OrgFields|\w*SaleFields|\w*ChargeFields)\b/g
let castsChecked = 0
for (const file of files) {
  const src = codeOnly(read(file))
  if (!/\.from\(\s*['"]organisations['"]\s*\)/.test(src)) continue
  castsChecked += 1
  for (const m of src.match(CAST_AT_BOUNDARY) ?? []) {
    failures.push(
      `${rel(file)}: "${m}" asserts a shape nobody checked. A cast at a gate boundary is what let ` +
        `a narrowed select compile. Use verifyRowFields so a missing column is a named error ` +
        `rather than an undefined that reads as false.`,
    )
  }
}
console.log(`[gate-fields-complete] checked ${castsChecked} file(s) reading organisations for a bare cast at the boundary`)

/* -------------------------------------------------------------------------
 * 3. The shared mechanism exists and still asserts PRESENCE, not truthiness.
 * ----------------------------------------------------------------------- */
const mech = read(join(ROOT, 'src/lib/payments/required-fields.ts'))
if (!/!\(key in present\)/.test(mech)) {
  failures.push(
    'src/lib/payments/required-fields.ts no longer tests key PRESENCE. Testing the VALUE collapses ' +
      '"the column is null" into "the column is missing", which is the exact conflation this ' +
      'mechanism exists to prevent.',
  )
}
if (!/NODE_ENV !== 'production'/.test(mech) || !/throw new Error/.test(mech)) {
  failures.push(
    'src/lib/payments/required-fields.ts no longer fails loudly outside production. A missing gate ' +
      'field is a programming error and must not be discoverable only by a founder losing an evening.',
  )
}
console.log('[gate-fields-complete] verified the shared mechanism asserts presence and fails loudly outside production')

if (failures.length > 0) {
  console.error(
    `\n[gate-fields-complete] FAILED. ${failures.length} way(s) a gate could decide on an ` +
      `incomplete row.\n`,
  )
  for (const f of failures) console.error(`    ${f}\n`)
  process.exit(1)
}

console.log('[gate-fields-complete] PASS - every gate is fed every field it reads.')
