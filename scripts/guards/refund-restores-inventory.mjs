/**
 * GUARD: a refund that succeeds at Stripe can never fail to return the seat.
 *
 * WHY THIS GUARD EXISTS, from an incident rather than from a principle.
 *
 * On 2026-08-18 a drill refunded a real test-mode charge from OUTSIDE the
 * application (the shape of a Stripe-dashboard refund) and watched what happened:
 * the buyer was refunded, the ticket stopped admitting, and
 * `ticket_tiers.sold_count` STAYED AT 1. The order stayed `confirmed`. The same
 * handler then promoted the waitlist, inviting somebody into a tier its own
 * counter called full. Nothing errored, nothing alerted, and no test failed,
 * because two separate code paths handled refunds and only one of them knew about
 * inventory:
 *
 *   in-app refund      -> refunds row exists -> reconcile_refund -> seat returned
 *   out-of-app refund  -> no refunds row     -> orphanOrderLevelVoid -> seat LOST
 *
 * That is the worst shape a money bug can take. Every party sees a correct
 * outcome, the loss is invisible, and it only surfaces when a room looks sold out
 * and is not. A unit test could not catch it: both paths were individually
 * correct for what they claimed to do.
 *
 * WHAT THIS GUARD CHECKS, and what it deliberately does not.
 *
 * It cannot execute a refund at build time, so it does not try to. What it CAN do
 * is pin the STRUCTURE that makes the leak impossible, because every version of
 * this bug is a structural one: a second path that voids a ticket without
 * returning its seat.
 *
 *   A. The effective reconcile_refund (the LAST migration that defines it, which
 *      is the definition the database ends up with) still returns inventory,
 *      still voids tickets, and still carries the ::public.order_status cast.
 *      That cast is not cosmetic: migration 20260621000002 dropped it, which made
 *      the whole function RAISE, so refunds stopped reconciling entirely until
 *      20260621000005 put it back. A guard that only looked for sold_count would
 *      have passed that broken version.
 *   B. The charge.refunded handler routes an unmatched refund into adoption
 *      instead of straight to the door-safety void, and reconciles afterwards.
 *   C. Adoption refuses a refund that carries metadata.refund_id. Without that
 *      refusal a late binding would produce a SECOND refunds row for one Stripe
 *      refund, and the seat would be returned twice, overselling the tier. The
 *      opposite failure to the original one, from the same fix.
 *   D. There is exactly ONE place in the application that voids a ticket without
 *      returning inventory: the named door-safety fallback. A new one appearing
 *      anywhere is the original defect returning under a new name, so it fails
 *      here rather than in production.
 *
 * It prints what it scanned, every run, so a reader can see the basis of the pass
 * rather than trusting the exit code.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const WEBHOOK = join(ROOT, 'src', 'app', 'api', 'webhooks', 'stripe', 'route.ts')

const failures = []
const scanned = []
const note = (s) => scanned.push(s)

// ---------------------------------------------------------------------------
// A. The effective reconcile_refund definition.
// ---------------------------------------------------------------------------
if (!existsSync(MIGRATIONS)) {
  failures.push('supabase/migrations does not exist, so the reconcile definition cannot be checked')
} else {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  const defining = files.filter((f) =>
    /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.reconcile_refund/i.test(
      readFileSync(join(MIGRATIONS, f), 'utf8'),
    ),
  )
  note(`${files.length} migration files scanned for a reconcile_refund definition`)

  if (defining.length === 0) {
    failures.push('no migration defines public.reconcile_refund: the refund reconcile has no implementation')
  } else {
    // Migrations apply in filename order, so the LAST definition is the one the
    // database ends up holding. Checking every definition would fail on the
    // historical broken one, which is still legitimately in the tree.
    const effective = defining[defining.length - 1]
    /*
     * SQL COMMENTS ARE STRIPPED FIRST, and the drill is why. These migrations
     * document themselves heavily, and 20260621000005's header explains at length
     * that it "restores the explicit ::public.order_status cast". So the first
     * version of this guard passed a tree with the real cast deleted from line
     * 133, because the SENTENCE ABOUT the cast on line 11 still matched. The guard
     * was reading the migration's prose as evidence of its behaviour. Caught by
     * scripts/verify/guard-failure-drills.mjs reporting "guard PASSED on a
     * violating tree", which is exactly what that harness is for.
     */
    const body = readFileSync(join(MIGRATIONS, effective), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n')
    note(`reconcile_refund is defined in ${defining.length} migration(s); the effective one is ${effective} (SQL comments stripped before checking)`)

    const required = [
      {
        label: 'returns inventory (decrements ticket_tiers.sold_count)',
        re: /UPDATE\s+public\.ticket_tiers[\s\S]{0,200}?sold_count\s*=\s*GREATEST\s*\(\s*0\s*,\s*tt\.sold_count\s*-/i,
        why: 'without this a refund takes the money back and keeps the seat sold',
      },
      {
        label: 'voids the refunded tickets',
        re: /UPDATE\s+public\.tickets[\s\S]{0,200}?status\s*=\s*'refunded'/i,
        why: 'without this a refunded buyer still holds an admitting QR',
      },
      {
        label: 'casts the order status (::public.order_status)',
        re: /::public\.order_status/,
        why: 'migration 20260621000002 dropped this cast and the whole function raised, so no refund reconciled at all',
      },
      {
        label: 'does NOT reverse a sale that was never recorded',
        re: /order_confirmed'?\s*\)\s*INTO\s+v_sale_recorded|INTO\s+v_sale_recorded/i,
        why:
          'proven 2026-08-19: when a refund arrived BEFORE its confirmation the ledger had never '
          + 'credited the sale, and the reversal debited the organiser 2500c for income they had '
          + 'never received. The reversal must be conditional on there being something to reverse',
      },
      {
        label: 'sets the order to refunded or partially_refunded',
        re: /partially_refunded/,
        why: 'without this the order stays confirmed and revenue reporting counts refunded money',
      },
      {
        label: 'RELEASES THE SEAT (returns public.seats to available)',
        re: /UPDATE\s+public\.seats[\s\S]{0,400}?status\s*=\s*'available'/i,
        why:
          'REPRODUCED 20 August 2026 by scripts/verify/refund-seat-drill.mjs against TEST: a '
          + 'seated ticket was refunded, the ticket voided, the tier inventory returned, the '
          + 'order marked refunded, and the SEAT stayed sold. Nobody can sit in it, because the '
          + 'ticket will not scan, and nobody can buy it, because the map says taken. That seat '
          + 'is dead for the event and the first person to find out is a steward at the door',
      },
      {
        label: 'UNHOOKS the dead ticket from the seat (clears tickets.seat_id)',
        re: /SET\s+released_seat_id\s*=\s*t\.seat_id[\s\S]{0,200}?seat_id\s*=\s*NULL/i,
        why:
          'this is not tidiness. assign_order_seats treats a seat as occupied while ANY ticket '
          + 'row points at it, so a refunded ticket that kept its seat_id would let the seat be '
          + 'resold and then refuse to pair it to the new buyer, leaving them charged with no '
          + 'seat. Releasing the seat WITHOUT this is worse than not releasing it at all',
      },
    ]
    for (const r of required) {
      if (!r.re.test(body)) {
        failures.push(`${effective}: the effective reconcile_refund no longer ${r.label}. ${r.why}.`)
      }
    }
    note(`the effective definition was checked for ${required.length} required behaviours`)
  }
}

// ---------------------------------------------------------------------------
// B, C, D. The charge.refunded handler.
// ---------------------------------------------------------------------------
if (!existsSync(WEBHOOK)) {
  failures.push('the Stripe webhook route is missing, so the refund handler cannot be checked')
} else {
  const src = readFileSync(WEBHOOK, 'utf8')
  note('src/app/api/webhooks/stripe/route.ts scanned for the refund handling structure')

  // B. An unmatched refund must be adopted, and reconciled after adoption.
  //
  // The CALL is matched, not the name. `/adoptOrphanRefund\s*\(/` also matches the
  // function's own DEFINITION, so the first version of this check passed a tree
  // where the call site had been replaced with `const adopted = false` and the
  // (now dead) function was left behind. A guard that is satisfied by the presence
  // of a definition is checking that code EXISTS, not that it RUNS.
  if (!/no_refund_row['"]?\s*&&/.test(src) || !/await\s+adoptOrphanRefund\s*\(/.test(src)) {
    failures.push(
      'the charge.refunded handler no longer adopts an unmatched refund (adoptOrphanRefund on the '
      + "no_refund_row branch). Without it, a refund created in the Stripe dashboard voids the ticket "
      + 'and permanently keeps the seat sold.',
    )
  }
  if (!/async function adoptOrphanRefund/.test(src)) {
    failures.push('adoptOrphanRefund is not defined in the webhook route')
  }
  // The adoption must be followed by a reconcile, or the row is written and nothing acts on it.
  const adoptBlock = src.slice(src.indexOf('no_refund_row'), src.indexOf('no_refund_row') + 1400)
  if (!/reconcile_refund/.test(adoptBlock)) {
    failures.push('adoption is not followed by a reconcile_refund call, so an adopted refund would never be applied')
  }
  note('the adoption branch was checked for both the adoption call and the following reconcile')

  // C. Adoption must refuse an in-app refund, or one Stripe refund gets two rows.
  const fnStart = src.indexOf('async function adoptOrphanRefund')
  if (fnStart !== -1) {
    const fnBody = src.slice(fnStart, fnStart + 4000)
    // The window is generous because the refusal legitimately logs and reports
    // before returning. Pinning it tightly would fail on the correct code every
    // time somebody added a line to that block, and a guard that cries wolf on
    // correct code is a guard somebody switches off.
    if (!/metadata\s*as[\s\S]{0,160}refund_id[\s\S]{0,1400}?return false/.test(fnBody)) {
      failures.push(
        'adoptOrphanRefund no longer refuses a refund carrying metadata.refund_id. An in-app refund '
        + 'would be adopted a second time, reversing the ledger twice and returning the same seat twice.',
      )
    }
    note('adoptOrphanRefund was checked for the in-app refusal that prevents a duplicate refund row')
  }

  // D. Exactly one sanctioned ticket-void that does not return inventory.
  //
  // Comments and the guard's own message strings are stripped first: this file's
  // text and the route's own explanatory comments both mention voiding, and a
  // naive scan would count those as code.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const voidWrites = [...code.matchAll(/status:\s*['"]void['"]/g)]
  note(`${voidWrites.length} code-level write(s) of tickets.status = 'void' found in the route`)
  if (voidWrites.length > 1) {
    failures.push(
      `${voidWrites.length} places in the webhook route void a ticket. Exactly one is sanctioned `
      + '(orphanOrderLevelVoid, the door-safety fallback, which cannot return inventory because there is '
      + 'no refund row to reverse against). A second one is the original inventory leak returning: it '
      + 'stops a buyer entering while silently keeping the seat sold.',
    )
  }
  if (voidWrites.length === 1) {
    // The one that exists must be inside the named fallback, not somewhere new.
    const fallbackStart = code.indexOf('async function orphanOrderLevelVoid')
    const at = code.indexOf("status: 'void'")
    if (fallbackStart === -1 || at < fallbackStart || at > fallbackStart + 3000) {
      failures.push(
        "the single tickets.status = 'void' write is no longer inside orphanOrderLevelVoid. A void "
        + 'outside that named fallback returns no inventory and nothing reports it.',
      )
    }
  }
}

// ---------------------------------------------------------------------------
console.log('[refund-restores-inventory] what this guard scanned:')
for (const s of scanned) console.log(`    - ${s}`)

if (failures.length > 0) {
  console.error('\n[refund-restores-inventory] FAILED\n')
  for (const f of failures) console.error(`    ${f}\n`)
  console.error('    A refund must never take the money back and keep the seat sold. The proof this')
  console.error('    guard protects is scripts/verify/refund-orphan-inventory-drill.mjs (reproduces the')
  console.error('    leak) and scripts/verify/refund-orphan-repair-proof.mjs (proves the fix).\n')
  process.exit(1)
}

console.log('[refund-restores-inventory] OK: every refund path returns inventory through reconcile_refund.')
