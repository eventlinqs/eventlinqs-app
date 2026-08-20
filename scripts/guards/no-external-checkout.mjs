/**
 * AN EXTERNALLY TICKETED EVENT CAN NEVER REACH A CHECKOUT SURFACE.
 *
 * Founder ruling 15 August 2026, non-negotiable 3: "The sale gate and the charge
 * precondition must both refuse it by construction, not by a flag someone can
 * forget."
 *
 * WHY A GUARD RATHER THAN TRUSTING THE TESTS. The tests prove the four refusals
 * behave correctly TODAY. What they cannot see is somebody moving a check, or
 * reordering one behind an early return, six months from now. Each refusal here
 * depends on its POSITION as much as its presence:
 *
 *   - `ticketsOnSale` must check external FIRST. Move it below the
 *     `if (!isPaidEvent) return true` line and every FREE external event becomes
 *     sellable, which is the single most likely external shape.
 *   - `assertCanCreateDestinationCharge` must refuse BEFORE the organiser
 *     checks. Below them, an external event belonging to a fully onboarded
 *     organiser passes every one and takes the money.
 *   - The reservation action must refuse OUTSIDE its `isPaid` branch. Inside it,
 *     a free external event skips the gate entirely.
 *
 * All three are "still passes the unit tests, silently wrong in production",
 * which is exactly the class a static check catches and a behavioural test does
 * not.
 *
 * WHAT IT CANNOT SEE, stated plainly: it reads source text, so it cannot prove
 * a NEW checkout surface added tomorrow consults any of these. It pins the four
 * refusals that exist. The tests cover behaviour; this covers structure.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const failures = []
const passes = []

function read(rel) {
  const p = join(ROOT, rel)
  if (!existsSync(p)) {
    failures.push(`${rel}: file is missing entirely`)
    return null
  }
  return readFileSync(p, 'utf8')
}

/**
 * The BODY of a function, from the brace that opens it to the one that closes
 * it at column zero.
 *
 * Written this way because the obvious version was wrong and the guard reported
 * a false failure on its first run: `/export function name\([\s\S]*?\n\}/` is
 * non-greedy, and `ticketsOnSale` takes a destructured object whose TYPE closes
 * with `}` at the start of a line. The match therefore ended inside the
 * signature, the "body" contained no statements at all, and the guard announced
 * that a check sitting three lines below was missing.
 *
 * So the open brace is located after the parameter list, and the body runs to
 * the next `\n}` from there.
 */
function functionBody(src, declaration) {
  const start = src.indexOf(declaration)
  if (start === -1) return ''
  // The opening brace of the body is the last `{` on the signature line group,
  // i.e. the first `{` that follows the final `)` of the parameter list.
  const openBrace = src.indexOf('{', src.indexOf('):', start))
  if (openBrace === -1) return ''
  const end = src.indexOf('\n}', openBrace)
  return end === -1 ? src.slice(openBrace) : src.slice(openBrace, end)
}

/*
 * 1. The sale decision refuses external FIRST, before the paid/free split.
 *
 * RE-POINTED 18 August 2026, and NOT weakened. The decision moved out of
 * `ticketsOnSale` and into `ticketsOnSaleDetailed`, which now carries the cause
 * as well as the verdict; `ticketsOnSale` is a one-line wrapper over it. The
 * ordering property this guard exists for is unchanged and is still pinned, at
 * the function that now decides it, and a second check below pins that the
 * wrapper really does delegate rather than deciding anything of its own. If the
 * wrapper ever grows a body again, that check fails and this one is re-pointed
 * back, deliberately, rather than silently passing on a function that no longer
 * governs anything.
 */
{
  const rel = 'src/lib/payments/sale-status.ts'
  const src = read(rel)
  if (src) {
    const wrapper = functionBody(src, 'export function ticketsOnSale(')
    if (!/return ticketsOnSaleDetailed\(/.test(wrapper)) {
      failures.push(
        `${rel}: ticketsOnSale no longer delegates to ticketsOnSaleDetailed, so the ordering pinned below is not the ordering it uses`,
      )
    } else {
      passes.push('ticketsOnSale delegates to the one decision rather than re-deriving it')
    }
    const body = functionBody(src, 'export function ticketsOnSaleDetailed(')
    const externalAt = body.indexOf('isExternallyTicketed')
    const paidAt = body.indexOf('isPaidEvent')
    const sellableAt = body.indexOf('isOrganiserSellable')
    if (externalAt === -1) {
      failures.push(`${rel}: ticketsOnSaleDetailed does not consult isExternallyTicketed at all`)
    } else if (paidAt !== -1 && externalAt > paidAt) {
      failures.push(
        `${rel}: ticketsOnSaleDetailed checks isPaidEvent BEFORE isExternallyTicketed. A FREE external event would be sellable.`,
      )
    } else if (sellableAt !== -1 && externalAt > sellableAt) {
      failures.push(`${rel}: ticketsOnSaleDetailed checks the organiser before the external refusal`)
    } else {
      passes.push('ticketsOnSaleDetailed refuses an externally ticketed event first')
    }
  }
}

/* 2. The charge precondition refuses external before every organiser check. */
{
  const rel = 'src/lib/payments/application-fee.ts'
  const src = read(rel)
  if (src) {
    const body = functionBody(src, 'export function assertCanCreateDestinationCharge(')
    const externalAt = body.indexOf('event_externally_ticketed')
    const firstOrgAt = body.indexOf('org_not_connected')
    if (externalAt === -1) {
      failures.push(
        `${rel}: assertCanCreateDestinationCharge never throws event_externally_ticketed. Money could move for an event we do not sell.`,
      )
    } else if (firstOrgAt !== -1 && externalAt > firstOrgAt) {
      failures.push(
        `${rel}: the external refusal sits BELOW the organiser checks. An external event with a fully onboarded organiser would be charged.`,
      )
    } else {
      passes.push('assertCanCreateDestinationCharge refuses external before any organiser check')
    }
    if (!/ChargePreconditionFailure[\s\S]{0,400}event_externally_ticketed/.test(src)) {
      failures.push(`${rel}: event_externally_ticketed is not a declared ChargePreconditionFailure`)
    }
  }
}

/* 3. The reservation action refuses OUTSIDE its isPaid branch. */
{
  const rel = 'src/app/actions/reservations.ts'
  const src = read(rel)
  if (src) {
    const externalAt = src.indexOf('isExternallyTicketed(')
    const isPaidBranchAt = src.indexOf('if (isPaid)')
    if (externalAt === -1) {
      failures.push(`${rel}: the reservation action never checks isExternallyTicketed`)
    } else if (isPaidBranchAt !== -1 && externalAt > isPaidBranchAt) {
      failures.push(
        `${rel}: the external refusal is INSIDE or after the isPaid branch. A free external event would take a reservation.`,
      )
    } else {
      passes.push('createReservation refuses external regardless of price')
    }
  }
}

/* 4. The event page folds external into saleBlocked, so no selector renders. */
{
  const rel = 'src/app/events/[slug]/page.tsx'
  const src = read(rel)
  if (src) {
    /*
     * RE-POINTED 18 August 2026, and NOT weakened.
     *
     * `saleBlocked` used to be spelled `externallyTicketed || (paid && ...)` on
     * this page, which meant the page carried its own copy of the ordering rule.
     * It now comes from the ONE shared decision, and the page hands that decision
     * the event. What must be true is unchanged: the external refusal reaches the
     * page. What is checked is the property rather than the old spelling, because
     * pinning a spelling is how a page ends up re-deriving a rule to satisfy a
     * regex.
     *
     * This is STRICTER than the line it replaces in one way that matters: the old
     * check could not tell whether the event was passed to anything, so a page
     * that computed `externallyTicketed` and then never used it still passed.
     * This one fails unless `event` actually reaches the decision.
     */
    const decisionCall = src.match(/const saleDecision = ticketsOnSaleDetailed\(\{[\s\S]*?\}\)/)?.[0] ?? ''
    if (!/const externallyTicketed = isExternallyTicketed\(event\)/.test(src)) {
      failures.push(`${rel}: the event page does not derive externallyTicketed from the event`)
    } else if (!decisionCall) {
      failures.push(
        `${rel}: saleBlocked is not derived from the shared ticketsOnSaleDetailed decision`,
      )
    } else if (!/\bevent,/.test(decisionCall) && !/event:\s*event\b/.test(decisionCall)) {
      failures.push(
        `${rel}: the event is not passed to ticketsOnSaleDetailed, so its external refusal never runs and a ticket selector could render for an external event`,
      )
    } else {
      passes.push('the event page blocks the sale surface for an external event')
    }
  }
}

console.log(`[no-external-checkout] ${passes.length} structural refusal(s) verified:`)
for (const p of passes) console.log(`    PASS  ${p}`)

if (failures.length > 0) {
  console.error(
    `\n[no-external-checkout] FAILED. ${failures.length} way(s) an externally ticketed event could reach a checkout surface.\n`,
  )
  for (const f of failures) console.error(`    ${f}`)
  console.error(
    '\n    An external event sells its tickets on somebody else\'s platform. Taking' +
      '\n    money for one means charging a buyer for a ticket we cannot deliver.' +
      '\n    Both refusals must hold, and both must sit ABOVE the checks they precede.\n',
  )
  process.exit(1)
}

console.log('[no-external-checkout] PASS - an external event cannot reach a checkout surface.')
