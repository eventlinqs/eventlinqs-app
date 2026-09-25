/**
 * GUARD: THE BUYER-FACING DISCOUNT CHECK MUST BE ABLE TO SEE THE ROWS IT
 * JUDGES, MUST NOT BELIEVE THE BROWSER ABOUT WHO THE BUYER IS, AND MUST NOT
 * TURN A FAILED READ INTO A VERDICT.
 *
 * ---------------------------------------------------------------------------
 * THREE DEFECTS THIS EXISTS TO STOP, all measured on 21 September 2026, two of
 * them driven on the real checkout screen at 390, 768 and 1440.
 *
 * 1. EVERY DISCOUNT CODE ON THE PLATFORM WAS DEAD, and nothing said so.
 *
 *    `validateDiscountCode` read `discount_codes` on the SESSION client. Asked
 *    of the live database rather than read off the source:
 *
 *      select policyname, cmd from pg_policies
 *       where schemaname='public' and tablename='discount_codes'
 *         Org members can manage discount codes   ALL
 *         Service role manages discount codes     ALL
 *
 *    and `discount_code_usages` carries exactly one, `Service role manages
 *    discount usages`. Neither admits a buyer, and neither should: a code is a
 *    secret, and a SELECT policy wide enough for a buyer to check their own is
 *    wide enough for anybody to list every comp and press code on an event.
 *
 *    So the lookup matched zero rows, `.maybeSingle()` answered `{ data: null,
 *    error: null }`, and the buyer was told "Invalid discount code". Driven,
 *    signed in, at three viewports, against two codes written moments earlier:
 *    both called invalid (C:/dev/EVIDENCE/LB-CODEBLINK/rls-red-report.json).
 *    The organiser's promotion simply did not work, and the platform's own
 *    answer blamed the code.
 *
 * 2. THE PER-USER CAP BELIEVED THE BROWSER ABOUT WHO WAS ASKING.
 *
 *    `user_id` arrived as an argument to a server action called from a CLIENT
 *    component, so it was a value the browser chose. `max_uses_per_user` is
 *    held NOWHERE else: `claim_discount_use` (migration 20260829000003) takes a
 *    row lock on `max_uses`, the GLOBAL cap, and is not even passed a user. On
 *    the configuration the create form defaults to, one per person with no
 *    global cap, sending a different id is the entire cap gone.
 *
 * 3. A DROPPED SOCKET ANSWERED BOTH READS, IN OPPOSITE DIRECTIONS.
 *
 *    The cap read discarded its error, so `count` was null, `?? 0` made it
 *    zero, and zero is under every cap: the buyer was handed a discount they
 *    had already spent (`valid=true discount=1000c`, red-report.json). The
 *    lookup collapsed `error || !dc` into "Invalid discount code", so a blink
 *    made a live code look like a fake one.
 *
 * ---------------------------------------------------------------------------
 * SEVEN CLAUSES, each naming the regression it stops.
 *
 *   1. Every file named below exists. A scope that has been renamed away scans
 *      nothing and reports PASS, which is how a scanner lies.
 *   2. The reader destructures no `data` or `count` without `error`. This is
 *      the clause that would have caught defect 3.
 *   3. The reader answers a failed read with the could-not-check sentence, and
 *      never with 'Invalid discount code' and never by falling through. Both
 *      reads are checked, separately, because one of them failing open and the
 *      other failing closed is exactly what happened.
 *   4. The buyer-facing action hands the reader a SERVICE-ROLE client. A
 *      session client cannot see either table and turns every live code into a
 *      fake one.
 *   5. The buyer-facing action resolves the user from the session and does not
 *      pass its own `user_id` parameter through.
 *   6. Every file under src/ that validates a discount code reaches the ONE
 *      reader. The scope above is a list, and a second copy of these reads
 *      somewhere the list does not name is how the platform acquires a fourth
 *      one.
 *   7. The ORGANISER-facing functions in the same action file are held to the
 *      same rule. All three opened with a read whose error was discarded and
 *      whose empty answer became "Event not found" or "Discount code not
 *      found", so a dropped socket told an organiser their own event did not
 *      exist. Clause 7 also holds the delete refusal to counting HELD uses as
 *      well as confirmed ones, because a code a buyer is holding right now
 *      looked untouched to it and could be deleted out from under them.
 *
 * WHAT THIS DOES NOT JUDGE, stated rather than implied.
 *
 *   - Whether the POLICIES are still service-role only. That is a fact about a
 *     database, not about this repository, and a guard that guessed at it would
 *     be guessing. It is asked directly by
 *     `scripts/verify/a-blinked-cap-is-not-a-granted-discount-drive.mjs`, which
 *     runs against TEST and reads the answer back. What this guard holds is the
 *     consequence: whatever the policies say, the buyer-facing read goes
 *     through a client that can see the rows.
 *   - WHICH CLIENT the organiser-facing functions use. Those read on the
 *     SESSION client ON PURPOSE, so RLS decides whether an organiser may touch
 *     a code, and widening them to the admin client would be the opposite
 *     defect. Clause 4 is deliberately scoped to the one call that serves a
 *     buyer; clause 7 holds those three to the failed-read rule and to nothing
 *     else.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSource, lineAt, sourceFiles } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[a-discount-code-a-buyer-can-actually-use]'

/** The one module that decides whether a buyer may have a code. */
const READER = 'src/lib/pricing/discount-validation.ts'

/** The buyer-facing server action, and the only caller a buyer reaches. */
const ACTION = 'src/app/actions/discount-codes.ts'

/** The exported name every validating surface must reach. */
const READER_EXPORT = 'validateDiscountCodeWith'

/** The sentence a read that could not be made is allowed to produce. */
const UNCHECKABLE = 'DISCOUNT_UNCHECKABLE'

/** The sentence a read that SUCCEEDED and found nothing is allowed to produce. */
const INVALID = 'Invalid discount code'

const failures = []
const work = {
  files: 0,
  destructures: 0,
  errorBranches: 0,
  discountReaders: 0,
  organiserReads: 0,
  organiserBranches: 0,
  buyerShaped: 0,
}

// ------------------------------------------------------------------- clause 1
for (const file of [READER, ACTION]) {
  if (!existsSync(resolve(ROOT, file))) {
    failures.push(
      `the scope names ${file} and it does not exist. Either the discount path moved, in which case ` +
        'this guard now judges nothing for it and would report PASS, or it was deleted. Fix the list ' +
        'rather than the symptom.',
    )
  }
}

const readerPath = resolve(ROOT, READER)
const readerSource = existsSync(readerPath) ? readSource(readerPath).withStrings : null
if (readerSource !== null) work.files += 1

// ------------------------------------------------------------------- clause 2
/*
 * COMMENTS ARE STRIPPED FIRST, because this module QUOTES the defective lines
 * in its own header as the thing being stopped, and a scanner that read
 * comments would fail the build on the explanation of the bug rather than on
 * the bug.
 */
if (readerSource !== null) {
  for (const match of readerSource.matchAll(/const\s*(\{[^}]*\})\s*=\s*await\b/g)) {
    const names = match[1]
    const rows = /\bdata\b/.test(names)
    const counts = /\bcount\b/.test(names)
    if (!rows && !counts) continue
    work.destructures += 1
    if (/\berror\b/.test(names)) continue
    failures.push(
      `${READER}:${lineAt(readerSource, match.index)} destructures \`${rows ? 'data' : 'count'}\` and ` +
        'not `error`. supabase-js resolves a failure as `{ data: null, error, count: null }`, so a ' +
        'dropped socket becomes zero past uses, zero is under every cap an organiser can set, and the ' +
        'buyer is handed a discount they have already spent.',
    )
  }
}

// ------------------------------------------------------------------- clause 3
if (readerSource !== null) {
  /*
   * BOTH READS, SEPARATELY. The two are labelled where they are run, and the
   * labels are what this clause counts, so a read that loses its honest branch
   * is named rather than the file being failed as a whole.
   */
  const LABELS = ['discount-code-lookup', 'discount-per-user-cap']
  for (const label of LABELS) {
    if (!readerSource.includes(`'${label}'`)) {
      failures.push(
        `${READER} no longer labels a read \`${label}\`. Clause 3 finds the honest branch by that ` +
          'label, so without it this clause judges nothing and reports PASS.',
      )
      continue
    }
    work.errorBranches += 1
  }

  const errorReturns = [...readerSource.matchAll(/if\s*\(\s*(?:error|spend\.error)\s*\)\s*\{([\s\S]{0,600}?)\n  \}/g)]
  if (errorReturns.length < LABELS.length) {
    failures.push(
      `${READER} has ${errorReturns.length} branch(es) testing a read error and ${LABELS.length} ` +
        'labelled read(s). Every read whose failure is possible must have a branch that says so; a ' +
        'read whose error nobody tests is a read whose failure becomes a verdict.',
    )
  }
  for (const branch of errorReturns) {
    if (!branch[1].includes(UNCHECKABLE)) {
      failures.push(
        `${READER}:${lineAt(readerSource, branch.index)} tests a read error and does not answer with ` +
          `${UNCHECKABLE}. A read that could not be made is not evidence about the code and not ` +
          'evidence about the buyer, so it must say so rather than granting or accusing.',
      )
    }
    if (branch[1].includes(INVALID)) {
      failures.push(
        `${READER}:${lineAt(readerSource, branch.index)} answers a FAILED read with "${INVALID}". ` +
          'That sentence belongs to a read that succeeded and found nothing. Said to a buyer holding a ' +
          'code off an organiser flyer, it is a statement about the organiser rather than about the ' +
          'network.',
      )
    }
  }

  /*
   * AND THE OTHER DIRECTION, which a careless fix breaks: a code that genuinely
   * does not exist must still be called invalid, or a buyer with a typo is
   * invited to keep trying forever.
   */
  if (!/if\s*\(!dc\)[^\n]*Invalid discount code/.test(readerSource)) {
    failures.push(
      `${READER} no longer answers "${INVALID}" for a successful read that found no row. Turning every ` +
        'empty answer into the could-not-check sentence tells a buyer with a mistyped code to keep ' +
        'trying, forever.',
    )
  }
}

// --------------------------------------------------------------- clauses 4, 5
const actionPath = resolve(ROOT, ACTION)
if (existsSync(actionPath)) {
  work.files += 1
  const { withStrings: action } = readSource(actionPath)
  const call = /validateDiscountCodeWith\(([\s\S]{0,400}?)\)\s*\n\}/.exec(action)

  if (!call) {
    failures.push(
      `${ACTION} no longer calls ${READER_EXPORT}. Clauses 4 and 5 judge that call, so without it they ` +
        'judge nothing and report PASS.',
    )
  } else {
    // --------------------------------------------------------------- clause 4
    if (!/createAdminClient\(\)/.test(call[1])) {
      failures.push(
        `${ACTION}:${lineAt(action, call.index)} does not hand ${READER_EXPORT} a service-role client. ` +
          '`discount_codes` and `discount_code_usages` admit no buyer by policy, so a session client ' +
          'reads zero rows from both: every live code becomes "Invalid discount code" and the per-user ' +
          'cap counts zero for everybody. Driven at 390, 768 and 1440 on 21 September 2026.',
      )
    }

    // --------------------------------------------------------------- clause 5
    if (/user_id:\s*user_id\b/.test(call[1])) {
      failures.push(
        `${ACTION}:${lineAt(action, call.index)} passes its own \`user_id\` parameter through to the ` +
          'reader. This action is called from a client component, so that id is a value the browser ' +
          'chose, and it decides a per-user cap that `claim_discount_use` does not hold. Resolve the ' +
          'signed-in user from the session here instead.',
      )
    }
    if (!/user_id:\s*user\?\.id\s*\?\?\s*null/.test(call[1])) {
      failures.push(
        `${ACTION}:${lineAt(action, call.index)} does not pass the SESSION user to the reader. The ` +
          'per-user cap is only a cap if the identity behind it came from a session.',
      )
    }
  }

  /*
   * SCOPED TO THE BUYER-FACING FUNCTION, AND A DRILL IS WHY.
   *
   * This first asked whether the FILE contained `auth.getUser()`, and the drill
   * that deletes the session read out of `validateDiscountCode` did not fire:
   * the organiser-facing functions further down the same file each call
   * `supabase.auth.getUser()` for their own access check, so the whole-file
   * question was answered by code that has nothing to do with the cap. A check
   * satisfied by an unrelated line is not a check. Only the buyer-facing
   * function body is read now.
   */
  const body = /export async function validateDiscountCode\([\s\S]*?\r?\n\}/.exec(action)
  if (!body) {
    failures.push(
      `${ACTION} no longer exports validateDiscountCode. Clause 5 reads that function body, so ` +
        'without it this clause judges nothing and reports PASS.',
    )
  } else if (!/auth\.getUser\(\)/.test(body[0])) {
    failures.push(
      `${ACTION}:${lineAt(action, body.index)} no longer reads the signed-in user from the session ` +
        'inside validateDiscountCode, so clause 5 has nothing to prefer over the caller claim. The ' +
        'organiser functions in this same file read the session user for their own access checks, ' +
        'which is why this asks the function body rather than the file.',
    )
  }
}

// ------------------------------------------------------------------- clause 7
/*
 * THE ORGANISER SIDE OF THE SAME FILE. Clause 2 judges the reader; these three
 * functions are the other user of the same defect, and all three carried it.
 */
if (existsSync(actionPath)) {
  const { withStrings: action } = readSource(actionPath)

  for (const match of action.matchAll(/const\s*(\{[^}]*\})\s*=\s*await\b/g)) {
    const names = match[1]
    if (!/\bdata\b|\bcount\b/.test(names)) continue
    work.organiserReads += 1
    if (/\berror\b/.test(names)) continue
    failures.push(
      `${ACTION}:${lineAt(action, match.index)} destructures a read without its \`error\`, so a ` +
        'dropped socket arrives at the organiser as an absent row. On these three functions that ' +
        'becomes "Event not found" or "Discount code not found": a statement of fact about ' +
        'something the organiser was looking at a second earlier.',
    )
  }

  /*
   * THE THREE ORGANISER READS, BY THEIR LABEL, exactly as clause 3 holds the
   * reader's two. Asking whether the FILE mentions the could-not-read sentence
   * is not enough, and a drill proved it: renaming the constant left three
   * usages behind, so the file still mentioned it and the guard went quiet.
   * What must be true is that EACH labelled read is followed by a branch that
   * answers with it.
   *
   * SCOPED TO THE LABELLED READS AND NOT TO EVERY `if (error)` IN THE FILE,
   * because createDiscountCode's INSERT failure correctly answers with its own
   * logged message naming the PostgREST code. That is a write that failed, not
   * a read that could not be made, and demanding this sentence there would be
   * demanding the wrong one.
   */
  const NOT_FOUND = /Event not found|Discount code not found/
  const ORGANISER_READS = [
    'discount-create-event-lookup',
    'discount-update-code-lookup',
    'discount-delete-code-lookup',
  ]
  for (const label of ORGANISER_READS) {
    const at = action.indexOf(`'${label}'`)
    if (at === -1) {
      failures.push(
        `${ACTION} no longer labels a read \`${label}\`. Clause 7 finds the honest branch by that ` +
          'label, so without it this clause judges nothing and reports PASS.',
      )
      continue
    }
    work.organiserBranches += 1
    const after = action.slice(at, at + 600)
    if (!after.includes('COULD_NOT_READ')) {
      failures.push(
        `${ACTION}:${lineAt(action, at)} runs the \`${label}\` read and does not answer a ` +
          'failure with COULD_NOT_READ. A read that could not be made is not evidence that the thing ' +
          'is absent, and on these three functions the absent answer is a sentence of fact about an ' +
          'event or a code the organiser was looking at a second earlier.',
      )
    }
    const branch = /if\s*\(\s*\w*[Ee]rror\s*\)\s*\{([\s\S]{0,400}?)\r?\n  \}/.exec(after)
    if (branch && NOT_FOUND.test(branch[1])) {
      failures.push(
        `${ACTION}:${lineAt(action, at)} answers the \`${label}\` FAILURE with a not-found ` +
          'sentence. Those sentences belong to a read that succeeded and found nothing, which is a ' +
          'real state a second tab can create. A failure must say it could not read.',
      )
    }
  }
  /*
   * THE DELETE, AND HELD USES. reserved_uses moves the moment a buyer applies
   * the code; current_uses only when their order confirms. A refusal that reads
   * one of the two lets a code be deleted while somebody is holding it.
   */
  if (!/current_uses\s*\?\?\s*0\)\s*\+\s*\(dc\.reserved_uses/.test(action)) {
    failures.push(
      `${ACTION} no longer refuses to delete a code whose uses are merely HELD. Migration ` +
        '20260829000003 split the count in two and every other place that asks whether a code is in ' +
        'use adds them; this one did not, so a code a buyer was holding could be deleted out from ' +
        'under them.',
    )
  }
}

// ------------------------------------------------------------------- clause 6
for (const file of sourceFiles(ROOT, { subdir: 'src' })) {
  if (!/\.tsx?$/.test(file)) continue
  if (file.replace(/\\/g, '/').endsWith(READER)) continue
  const absolute = resolve(ROOT, file)
  if (!existsSync(absolute)) continue
  const { withStrings: source } = readSource(absolute)
  if (!/from\('discount_codes'\)|from\('discount_code_usages'\)/.test(source)) continue
  work.discountReaders += 1

  /*
   * ONLY THE BUYER'S TWO READS, AND THE ORGANISER'S ARE DELIBERATELY LEFT
   * ALONE. `src/lib/organisers/event-tier-config.ts` reads `discount_codes` by
   * `event_id` for the screen where an organiser manages their own, on the
   * SESSION client, so RLS decides whether they may. That is correct and
   * widening it to the admin client would be the opposite defect. What this
   * clause holds is the shape only a BUYER-facing decision has:
   *
   *   a lookup keyed by the CODE ITSELF, which is somebody testing a secret
   *   a usage count keyed by a USER, which is the per-user cap
   *
   * Both were found by matching the filter rather than the table, because the
   * table alone cannot tell an organiser's list from a buyer's question.
   */
  const buyerShaped = [
    /from\('discount_codes'\)[\s\S]{0,400}?\.eq\('code'/.test(source) && "a lookup keyed by the code itself",
    /from\('discount_code_usages'\)[\s\S]{0,400}?\.eq\('user_id'/.test(source) && "a usage count keyed by a user",
  ].filter(Boolean)
  if (buyerShaped.length === 0) continue
  work.buyerShaped += 1
  if (source.includes(READER_EXPORT)) continue
  failures.push(
    `${file} carries ${buyerShaped.join(' and ')} without reaching ${READER_EXPORT}. Every decision ` +
      'about whether a BUYER may have a code goes through the one reader, because that reader is where ' +
      'the client, the identity and the failed-read branches are all settled at once, and a second ' +
      'copy settles none of them.',
  )
}
if (work.discountReaders === 0) {
  failures.push(
    'no file under src/ reads a discount table outside the reader. Either the organiser surfaces were ' +
      'renamed, in which case clause 6 now judges nothing and reports PASS, or the discount feature is ' +
      'gone.',
  )
}

if (failures.length) {
  console.error(`${TAG} FAIL`)
  for (const f of failures) console.error(`  ${f}`)
}

declareWork('a-discount-code-a-buyer-can-actually-use', {
  did: {
    'file in the buyer-facing discount path swept': work.files,
    'destructured result checked for its error': work.destructures,
    'failure branch checked on a labelled read': work.errorBranches,
    'other file with a discount table read': work.discountReaders,
    'organiser-facing result checked for an error': work.organiserReads,
    'organiser-facing failure branch checked for a false not-found': work.organiserBranches,
    'buyer-shaped lookup found outside the reader': work.buyerShaped,
  },
  zeroIsFine: {
    /*
     * ZERO IS THE POINT RATHER THAN A GAP. The reader is the only place a
     * buyer-shaped discount read exists, so clause 6 finding none is the state
     * this guard is holding. It stays registered because the day somebody
     * writes a second one is exactly the day it is needed.
     */
    'buyer-shaped lookup found outside the reader':
      'the reader is the only buyer-facing discount read on the platform, which is what clause 6 holds',
  },
  found: { 'buyer-facing discount lookup that could lie about a code': failures.length },
})

if (failures.length) process.exit(1)
