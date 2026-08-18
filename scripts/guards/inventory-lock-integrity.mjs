/**
 * GUARD: two buyers can never be sold the same seat.
 *
 * WHY THIS GUARD EXISTS, and it is the one failure on this platform that cannot be
 * undone. Every other defect can be refunded. An oversell is an organiser turning
 * somebody away at the door who is holding a valid ticket, in front of a queue, and
 * in a scene built on word of mouth that does not get forgiven.
 *
 * WHAT WAS MEASURED, on 2026-08-19, against the real TEST database:
 *
 *   50 simultaneous buyers, 1 seat, live create_reservation   ->  1 won   (1/1)
 *   50 simultaneous buyers, 1 seat, FOR UPDATE removed        -> 16 won  (16/1)
 *
 * Those two runs used the same body, the same transport and the same concurrency.
 * The only difference was the row lock, and without it fifteen people would have
 * been turned away. The lock is therefore not a detail of the implementation, it is
 * the entire protection, and a refactor that drops it produces a platform that
 * passes every existing test and oversells under load.
 *
 * The runtime proofs are scripts/verify/oversell-concurrency-drill.mjs (no
 * oversell at N = 5, 20, 50) and scripts/verify/oversell-negative-control.mjs
 * (the oversell reappears when the lock is removed, which is what makes the first
 * one mean anything).
 *
 * WHAT THIS CHECKS, and what it cannot.
 *
 * It cannot run 50 concurrent buyers at build time. What it CAN do is pin the
 * three structural facts that the measurement above showed to be load-bearing:
 *
 *   A. The effective create_reservation still takes the row lock AND still
 *      computes availability as capacity minus sold minus reserved. Both halves
 *      matter: a lock that serialises around the wrong arithmetic still oversells,
 *      and correct arithmetic without the lock is what produced the 16.
 *   B. The effective confirm_order still takes the row lock and still early-returns
 *      on an already-confirmed order. Stripe retries webhooks, so without that
 *      latch one payment moves inventory many times.
 *   C. No application code writes sold_count or reserved_count. The counters have
 *      exactly one owner, the locked RPCs. A second writer in application code
 *      cannot hold the lock and would reintroduce the race from outside the
 *      function this guard protects. Initialising a NEW tier to 0 is allowed and
 *      is the only permitted mention.
 *
 * It prints what it scanned on every run.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const SRC = join(ROOT, 'src')

const failures = []
const scanned = []

/** The LAST migration defining a function is the definition the database holds. */
function effectiveDefinition(fnName) {
  if (!existsSync(MIGRATIONS)) return null
  const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
  const re = new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fnName}\\b`, 'i')
  const defining = files.filter(f => re.test(readFileSync(join(MIGRATIONS, f), 'utf8')))
  if (defining.length === 0) return null
  const file = defining[defining.length - 1]
  // SQL comments are stripped before matching. The refund guard learnt this the
  // hard way: a migration that DESCRIBES a clause in its header will satisfy a
  // naive text search even after the clause itself is deleted.
  const body = readFileSync(join(MIGRATIONS, file), 'utf8')
    .split(/\r?\n/).map(l => l.replace(/--.*$/, '')).join('\n')
  return { file, body, count: defining.length }
}

// ---------------------------------------------------------------------------
// A + B. The two locked RPCs.
// ---------------------------------------------------------------------------
const CHECKS = [
  {
    fn: 'create_reservation',
    required: [
      {
        label: 'takes the row lock (FOR UPDATE) before deciding availability',
        re: /FOR\s+UPDATE/i,
        why: 'without it, 50 simultaneous buyers all read the same availability and 16 won a single seat',
      },
      {
        label: 'computes availability as capacity minus sold minus reserved',
        re: /total_capacity\s*-\s*\w*\.?sold_count\s*-\s*\w*\.?reserved_count/i,
        why: 'a lock around the wrong arithmetic still oversells',
      },
      {
        label: 'refuses when the request exceeds what remains',
        re: /IF\s+v_available\s*<\s*v_quantity\s+THEN/i,
        why: 'this is the refusal itself; without it the lock protects nothing',
      },
      {
        label: 'increments reserved_count rather than assigning it',
        re: /reserved_count\s*=\s*reserved_count\s*\+/i,
        why: 'an assignment from a value read earlier discards concurrent reservations',
      },
    ],
  },
  {
    fn: 'confirm_order',
    required: [
      {
        label: 'takes the row lock (FOR UPDATE)',
        re: /FOR\s+UPDATE/i,
        why: 'two concurrent confirmations of one order would both move inventory',
      },
      {
        label: 'early-returns on an already-confirmed order',
        re: /status\s*=\s*'confirmed'/i,
        why: 'Stripe retries webhooks; without the latch one payment sells the seat repeatedly',
      },
      {
        label: 'moves reserved into sold rather than adding to both',
        re: /sold_count\s*=\s*sold_count\s*\+[\s\S]{0,120}reserved_count\s*=\s*GREATEST/i,
        why: 'incrementing sold without releasing reserved double-counts the seat',
      },
      {
        label: 're-acquires the seat when the hold has LAPSED, with the availability test inside the UPDATE',
        re: /sold_count\s*=\s*sold_count\s*\+\s*v_quantity\s*WHERE\s+id\s*=\s*v_tier_id\s*AND\s+total_capacity\s*-\s*sold_count\s*-\s*reserved_count\s*>=\s*v_quantity/i,
        why:
          'measured 2026-08-19: without this, a payment landing after its 10 minute hold '
          + 'expired confirmed into a ticket while sold_count stayed 0, and produced 2 admitting '
          + 'tickets for a 1 seat tier with both buyers charged. The predicate must sit INSIDE the '
          + 'UPDATE so it is evaluated under the write lock and cannot be raced',
      },
      {
        label: 'REFUSES when the lapsed seat is gone (ROW_COUNT of 0 raises)',
        re: /GET\s+DIAGNOSTICS\s+v_taken\s*=\s*ROW_COUNT[\s\S]{0,400}?RAISE\s+EXCEPTION/i,
        why:
          'if the re-acquire takes nothing the seat belongs to somebody else, and confirming '
          + 'anyway mints a second ticket for it. Refusing leaves a paid order pending, which is '
          + 'a refund; an oversell cannot be undone at the door',
      },
      {
        label: 'decides inventory BEFORE confirming the order',
        // The ticket trigger fires on the confirmation, so the seat must already be
        // taken by then. If the orders UPDATE moves back above the tier UPDATE, the
        // ticket is minted from the confirmation while the seat comes from the
        // reservation, which is exactly the defect that was reproduced.
        re: /ticket_tiers[\s\S]*?UPDATE\s+public\.orders\s+SET\s+status\s*=\s*'confirmed'/i,
        why: 'the ticket-issuing trigger fires on the confirmation, so the seat must be secured first',
      },
    ],
  },
]

for (const check of CHECKS) {
  const def = effectiveDefinition(check.fn)
  if (!def) {
    failures.push(`no migration defines public.${check.fn}: the inventory gate has no implementation`)
    continue
  }
  scanned.push(`public.${check.fn}: ${def.count} definition(s) found, effective one is ${def.file} (SQL comments stripped)`)
  for (const r of check.required) {
    if (!r.re.test(def.body)) {
      failures.push(`${def.file}: the effective ${check.fn} no longer ${r.label}. ${r.why}.`)
    }
  }
  scanned.push(`public.${check.fn}: checked ${check.required.length} required structural properties`)
}

// ---------------------------------------------------------------------------
// C. The counters have exactly one owner.
// ---------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p)
  }
  return out
}

/**
 * A WRITE, NOT A MENTION. The first version of this check flagged any
 * `sold_count: <value>` in an object literal, and its first run reported
 * src/lib/dev/fixture-events.ts as an offender. That file builds an in-memory
 * TicketTier for the homepage fixture and contains ZERO write verbs, so the
 * finding was false: the guard was reading object CONSTRUCTION as a database
 * write. A guard that accuses correct code gets switched off, so the counter
 * assignment now has to sit inside the argument of an actual write call.
 *
 * The window is a bounded character span after the verb rather than true brace
 * matching. That is a deliberate limit and it errs toward missing a write spread
 * across more than one long payload, not toward inventing one. The SQL-side
 * checks above are the real backstop; this clause exists to catch a second
 * counter owner appearing in application code, which is a short and obvious edit
 * when somebody makes it.
 */
const WRITE_VERB = /\.(insert|update|upsert)\s*\(/g
const WINDOW = 700

const files = existsSync(SRC) ? walk(SRC) : []
const offenders = []
let writeSites = 0
for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .split(/\r?\n/).map(l => l.replace(/\/\/.*$/, '')).join('\n')

  WRITE_VERB.lastIndex = 0
  let verb
  while ((verb = WRITE_VERB.exec(code)) !== null) {
    writeSites += 1
    const payload = code.slice(verb.index, verb.index + WINDOW)
    const m = /\b(sold_count|reserved_count)\s*:\s*([^,}\n]+)/.exec(payload)
    if (!m) continue
    const value = m[2].trim()
    // Permitted: initialising a brand NEW tier to zero. That is not a race,
    // because nothing has reserved against a tier that does not exist yet.
    if (value === '0') continue
    /*
     * Also permitted: a DESTRUCTURING DISCARD. duplicateEvent strips the counters
     * off the source tier with `{ sold_count: _sc, reserved_count: _rc,
     * ...tierRest }` and then inserts 0, which is the correct thing to do when
     * copying an event. `sold_count: _sc` is a binding NAME in a pattern, not a
     * value in a payload, and the leading underscore is this repo's own convention
     * for a deliberately unused binding (it is what the eslint unused-vars rule is
     * configured to allow). Flagging it reported the one place that handles the
     * counters correctly as the offender.
     */
    if (/^_/.test(value)) continue
    const line = code.slice(0, verb.index).split('\n').length
    offenders.push(`${relative(ROOT, file).split('\\').join('/')}:${line}  ${m[1]}: ${value.slice(0, 46)}`)
  }
}
scanned.push(`${files.length} TypeScript file(s) under src, ${writeSites} insert/update/upsert call site(s), checked for a counter write`)

if (offenders.length > 0) {
  failures.push(
    `${offenders.length} application-level write(s) to the inventory counters. The counters are owned `
    + 'ONLY by create_reservation and confirm_order, which hold the row lock. Application code cannot '
    + 'hold that lock, so a write from here reintroduces the oversell from outside the protected '
    + `function:\n        ${offenders.join('\n        ')}`,
  )
}

// ---------------------------------------------------------------------------
console.log('[inventory-lock-integrity] what this guard scanned:')
for (const s of scanned) console.log(`    - ${s}`)

if (failures.length > 0) {
  console.error('\n[inventory-lock-integrity] FAILED\n')
  for (const f of failures) console.error(`    ${f}\n`)
  console.error('    Measured 2026-08-19: with the lock 1 of 50 buyers won a single seat; with the')
  console.error('    lock removed 16 of 50 won it. Re-run the proofs:')
  console.error('      node --env-file=.env.test scripts/verify/oversell-concurrency-drill.mjs')
  console.error('      node --env-file=.env.test scripts/verify/oversell-negative-control.mjs\n')
  process.exit(1)
}

console.log('[inventory-lock-integrity] OK: the seat count has one owner and it holds a row lock.')
