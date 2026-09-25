/**
 * GUARD: A REFUSAL THAT NAMES AN ACTION MUST OFFER IT, AND MUST BE ANNOUNCED.
 *
 * ============================================================================
 * THE DEFECT, WHICH HAPPENED TWICE AND WAS FIXED ONCE
 * ============================================================================
 *
 * `checkPublishGate` refuses a paid event whose organiser has no connected
 * account with a 172-character sentence, and it returns the door beside it:
 *
 *     nextAction: { label: 'Connect Stripe', href: '/dashboard/payouts' }
 *
 * `publishEvent` carries that through in its `ActionResult`. On 28 August 2026
 * the event form was found reading `result.error` and dropping
 * `result.nextAction` on the floor, so the organiser was told to connect Stripe
 * by a sentence with nothing to press; its own comment records the fix ("the
 * caller used to throw it away, so 'Connect Stripe' was advice with no door")
 * and adds `role="alert"`, because a refusal nobody hears is the same defect
 * for a screen-reader user.
 *
 * THE EVENTS LIST NEVER INHERITED EITHER HALF, and nothing could notice: it
 * compiles, `nextAction` is optional, and the refusal renders. Driven against
 * the served build on 21 September 2026 it rendered a `<span>` with no role
 * inside the ACTIONS column of a table - 69px of a 356px list at 390, 19 per
 * cent of the width and 256px tall - beside an event whose own title was at
 * x -58, off the left edge of the phone.
 *
 * ============================================================================
 * WHAT IS JUDGED, AND WHY NOTHING HERE IS TYPED
 * ============================================================================
 *
 * CLAUSE 1, THE TYPE IS FOUND, NOT NAMED. The module that declares
 * `export type ActionResult` is located by search, and the guard reads the
 * door's field name out of that declaration. If somebody renames `nextAction`,
 * this guard follows it instead of silently judging a field that no longer
 * exists.
 *
 * CLAUSE 2, THE ACTIONS THAT CAN CARRY A DOOR ARE DERIVED. Every exported async
 * function in that module returning `Promise<ActionResult>`, kept only when it
 * can actually return a door: its own body says so, or it returns the value of
 * an in-module helper whose body says so. That second half is not a nicety -
 * `publishEvent` never says `nextAction`, it returns `refusal` from
 * `refuseUnlessPublishable`, and a one-file text search would have missed the
 * exact case this guard exists for.
 *
 * CLAUSE 3, THE CALLERS ARE DERIVED. Every `.tsx` under `src/` that calls one
 * of those actions.
 *
 * CLAUSE 4, THE RULE. A caller that reads the refusal (`.error`) must also read
 * the door (the field from clause 1) and must render `role="alert"`.
 *
 * CLAUSE 5, THE ANTI-BLINDNESS. A zero anywhere in the derivation is a FAULT,
 * not a pass: no ActionResult type, no door-carrying action, or no caller each
 * mean this guard has stopped judging anything, and a guard that judges nothing
 * reports PASS in a full sentence.
 *
 * WHAT THIS GUARD CANNOT SEE, said plainly. It reads text, not a render tree.
 * A caller that mentions the door field and renders `role="alert"` somewhere
 * unrelated satisfies it. What holds the LAYOUT - that the refusal gets at
 * least 60 per cent of the list's width, that the event's title is on screen
 * with it, and that the actions survive at 44px - is driven at 390, 768 and
 * 1440 in scripts/verify/organiser-events-refusal-drive.mjs, because no static
 * check can measure a sentence.
 *
 * Exit 1 with every fault named, or exit 0 with what it judged. Drilled red and
 * green in scripts/verify/guard-failure-drills.mjs.
 *
 * Run: node scripts/guards/a-refusal-keeps-its-door.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { norm } from './lib/import-graph.mjs'
import { topLevelBody, stripComments } from '../lib/js-source.mjs'

const TAG = '[a-refusal-keeps-its-door]'

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(norm(full))
  }
  return out
}

export function judge(root = 'src') {
  const faults = []
  const files = walk(root)

  // CLAUSE 1. The type, and the name of the door on it.
  const typeFile = files.find((f) => /export type ActionResult\b/.test(readFileSync(f, 'utf8')))
  if (!typeFile) {
    return { faults: ['no module declares `export type ActionResult`, so this guard has nothing to judge'], typeFile: null, doorField: null, actions: [], callers: [] }
  }
  const typeSource = readFileSync(typeFile, 'utf8')
  const declaration = typeSource.slice(typeSource.indexOf('export type ActionResult'))
  const doorField = declaration.match(/(\w+)\?:\s*\{\s*label:/)?.[1] ?? null
  if (!doorField) {
    return { faults: [`${typeFile} declares ActionResult with no { label, href } member, so a refusal has no door to keep`], typeFile, doorField: null, actions: [], callers: [] }
  }

  // CLAUSE 2. The actions that can carry a door.
  const declared = [...typeSource.matchAll(/export async function (\w+)\s*\([^)]*\)\s*:\s*Promise<ActionResult>/g)].map((m) => m[1])
  const helpersWithDoor = [...typeSource.matchAll(/(?:async )?function (\w+)\s*\(/g)]
    .map((m) => m[1])
    .filter((name) => topLevelBody(typeSource, typeSource.indexOf(`function ${name}(`)).includes(doorField))
  const actions = declared.filter((name) => {
    const body = topLevelBody(typeSource, typeSource.indexOf(`export async function ${name}(`))
    if (body.includes(doorField)) return true
    // `publishEvent` never says the field: it returns a helper's refusal.
    return helpersWithDoor.some((helper) => helper !== name && body.includes(`${helper}(`))
  })

  // CLAUSE 3. The callers.
  /*
   * THE CALLERS ARE READ WITH THEIR COMMENTS STRIPPED, and that is not tidiness.
   * Every one of these files now explains the defect in prose, and the word
   * `nextAction` appears three times in this file's own header alone. A guard
   * that searches the raw source reads its own documentation and passes, which
   * is exactly how `hero-text-over-a-photograph` was found passing on a tree
   * with the violation in it (close-out, 20 September 2026, clause 9c). It
   * reads code.
   */
  const callers = files
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ file: f, source: stripComments(readFileSync(f, 'utf8')) }))
    .filter(({ source }) => actions.some((a) => source.includes(`${a}(`)))

  // CLAUSE 5, first half. A zero in the derivation is a fault.
  if (actions.length === 0) faults.push(`${typeFile} declares ${declared.length} ActionResult action(s) and none of them can carry a ${doorField}; the derivation has gone blind`)
  if (actions.length > 0 && callers.length === 0) faults.push(`no .tsx under ${root} calls any of ${actions.join(', ')}; the derivation has gone blind`)

  // CLAUSE 4. The rule.
  for (const { file, source } of callers) {
    const which = actions.filter((a) => source.includes(`${a}(`))
    if (!/\.error\b/.test(source)) continue
    if (!source.includes(doorField)) {
      faults.push(
        `${file} calls ${which.join(', ')} and reads the refusal but never reads \`${doorField}\`. The gate already ` +
          `worked out where to send them; dropping it turns "Connect Stripe" into advice with no door. ` +
          `src/components/features/events/event-form.tsx is the shape to inherit.`,
      )
    }
    if (!source.includes('role="alert"')) {
      faults.push(
        `${file} calls ${which.join(', ')} and renders a refusal without role="alert", so the refusal is rendered ` +
          `and never announced. A person using a screen reader gets no signal that the press was refused.`,
      )
    }
  }

  return { faults, typeFile, doorField, actions, callers: callers.map((c) => c.file) }
}

const invokedDirectly =
  Boolean(process.argv[1]) && /a-refusal-keeps-its-door\.mjs$/.test(process.argv[1].split(sep).join('/'))

if (invokedDirectly) {
  const { faults, typeFile, doorField, actions, callers } = judge()
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.log(`${TAG} the contract: ${typeFile ?? 'NOT FOUND'}, the door is \`${doorField ?? 'NOT FOUND'}\``)
  console.log(`${TAG} actions that can carry a door: ${actions.join(', ') || 'none'}`)
  console.log(`${TAG} callers judged: ${callers.join(', ') || 'none'}`)
  declareWork('a-refusal-keeps-its-door', {
    did: { 'action that can refuse with a door derived': actions.length, 'caller of one judged': callers.length },
    found: { 'refusal that loses its door or its announcement': faults.length },
  })
  if (faults.length > 0) {
    console.error(`${TAG} FAIL - ${faults.length} refusal(s) reach a person with less than the platform worked out.`)
    process.exit(1)
  }
  console.log(`${TAG} PASS - every caller of a refusing action keeps the door and announces the refusal.`)
}
