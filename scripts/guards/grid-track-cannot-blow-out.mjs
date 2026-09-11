/**
 * A GRID TRACK MAY NEVER BE WIDENED BY ITS OWN CHILD (close-out UX6.1 to UX6.3).
 *
 * ------------------------------------------------------------------------
 * THE DEFECT, MEASURED RATHER THAN REASONED ABOUT. 10 September 2026, on the
 * real checkout page in a real browser at 390:
 *
 *     className="grid gap-6 lg:grid-cols-[1fr_360px]"
 *
 *     before   grid-template-columns: 358px    order summary right edge  374
 *     after    grid-template-columns: 520px    order summary right edge  536
 *
 * "after" is the same page with one 520px-wide child inserted into that grid,
 * which is what the Stripe payment iframe is on the payment step. Two separate
 * CSS defaults conspire:
 *
 *   1. With no BASE column template, the mobile case falls to the implicit
 *      `grid-auto-columns: auto`, and an `auto` track sizes to its content. One
 *      wide child therefore widens the track, and every OTHER item in that grid
 *      is stretched to the new width with it. That is why the order summary,
 *      which is perfectly narrow, was dragged 146px off the right of the screen.
 *   2. A bare `1fr` track is `minmax(auto, 1fr)`, whose MINIMUM is min-content.
 *      It has the same failure for the same reason at the breakpoint that uses it.
 *
 * And `html, body { overflow-x: clip }` in globals.css means the result is not a
 * horizontal scrollbar the buyer could use. It is content cut off and gone,
 * which is UX6.3 exactly, with `document.documentElement.scrollWidth` still
 * reporting a tidy 390.
 *
 * THE RULE. Every grid declares a column template that cannot be widened by its
 * content:
 *
 *   A. A container with a breakpoint-prefixed `grid-cols-*` must also carry a
 *      base `grid-cols-*`, so the mobile case is explicit. Tailwind's
 *      `grid-cols-1` is `repeat(1, minmax(0, 1fr))`, which is the floor wanted.
 *   B. An arbitrary template `grid-cols-[...]` may not contain a bare `fr`
 *      track. Write `minmax(0,1fr)`.
 *
 * WHY IT IS PLATFORM-WIDE RATHER THAN SCOPED TO CHECKOUT. UX6 asks that "this
 * class cannot return". The class is a CSS default, not a checkout bug; it was
 * latent on 45 grids across marketing, dashboard and admin surfaces on the day
 * it was found on checkout. Scoping the guard to the one screen that has already
 * failed is how the same defect arrives on the next screen.
 *
 * Registered in scripts/guards/run-guards.mjs, so it blocks on prebuild.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const TAG = '[grid-track-cannot-blow-out]'
const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

const BREAKPOINTS = ['sm', 'md', 'lg', 'xl', '2xl']
const CLASS_ATTR = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/gs
const ARBITRARY = /(?:(?:sm|md|lg|xl|2xl):)?grid-cols-\[([^\]]*)\]/g
const BARE_FR = /^\d*\.?\d+fr$/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

const files = walk(SRC)
const faults = []
let containers = 0
let templates = 0

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file).split(sep).join('/')

  for (const match of source.matchAll(CLASS_ATTR)) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''
    const tokens = value.split(/\s+/).filter(Boolean)
    if (!tokens.includes('grid')) continue
    containers += 1
    const line = source.slice(0, match.index).split('\n').length
    const hasBreakpointCols = tokens.some((t) =>
      BREAKPOINTS.some((b) => t.startsWith(`${b}:grid-cols-`)),
    )
    const hasBaseCols = tokens.some((t) => t.startsWith('grid-cols-'))
    if (hasBreakpointCols && !hasBaseCols) {
      faults.push(
        `${rel}:${line}: a grid with only a breakpoint column template, so the mobile case is an implicit ` +
          `auto track a wide child can widen. Add a base grid-cols-1.\n      ${value.trim().slice(0, 140)}`,
      )
    }
  }

  // B. Every arbitrary template, wherever it is written.
  for (const match of source.matchAll(ARBITRARY)) {
    templates += 1
    const line = source.slice(0, match.index).split('\n').length
    const bare = match[1].split('_').filter((tok) => BARE_FR.test(tok))
    if (bare.length > 0) {
      faults.push(
        `${rel}:${line}: grid-cols-[${match[1]}] has ${bare.length} bare fr track (${bare.join(', ')}), ` +
          `whose minimum is min-content. Write minmax(0,${bare[0]}).`,
      )
    }
  }
}

console.log(`${TAG} did ${files.length} file(s) read, ${containers} grid container(s), ${templates} arbitrary template(s)`)
console.log(`${TAG} found ${faults.length} track(s) a child could widen`)
for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
if (faults.length > 0) {
  console.error(
    `${TAG} FAIL - a grid track that can be widened by its own content. On a 390 viewport that pushes every ` +
      `sibling off the right edge, and overflow-x: clip means the buyer cannot scroll to what is lost.`,
  )
  process.exit(1)
}
console.log(`${TAG} PASS - every grid declares a column template its content cannot widen.`)
