/**
 * A PUNCTUATION MARK MAY NOT STAND IN FOR A VALUE A PERSON IS READING.
 *
 * ============================================================================
 * THE INCIDENT, WITH THE COMMIT THAT CAUSED IT
 * ============================================================================
 *
 * The copy law bans em dashes and en dashes, and on the day it was enforced a
 * site-wide sweep (commit 2b59d58c, "chore(copy): scrub em-dashes and
 * en-dashes site-wide") replaced every one of them with a colon. That is the
 * right answer in a SENTENCE, where a colon is what a dash was doing. It is
 * the wrong answer in a VALUE SLOT, where the dash was a placeholder meaning
 * "there is nothing here", and a colon means nothing at all.
 *
 * Nine user-visible slots were left holding a bare colon, and they sat there
 * until 21 September 2026 when one was seen in a driven screenshot:
 *
 *   Name: :                     the buyer on a guest order, on the order
 *                               detail page and again in the orders list
 *   0/:                         a ticket tier with no capacity set, on the
 *                               event overview and on the dashboard panel
 *   :                           the Sold column of the events list when an
 *                               event has no capacity at all
 *   : -> :                      the date range in the event form's preview
 *   :                           the queue position, at text-7xl, and in the
 *                               aria-label a screen reader reads
 *
 * Every one of them is a placeholder on a shipped surface, which the
 * Definition of Done calls a defect by definition rather than a stub to fix
 * later.
 *
 * ============================================================================
 * WHY A GUARD RATHER THAN NINE FIXES
 * ============================================================================
 *
 * Because the cause was a mechanical sweep, and mechanical sweeps happen
 * again. The next one that rewrites a character class across 1,100 files has
 * no way of knowing which strings were prose and which were standing in for a
 * number. This is the check that tells it.
 *
 * ============================================================================
 * WHAT IT JUDGES, AND WHAT IT DELIBERATELY DOES NOT
 * ============================================================================
 *
 * A string literal that is a lone SEPARATOR mark and reaches a reader from a
 * fallback position: the right-hand side of `||` or `??`, or a branch of a
 * ternary. Those are where a placeholder lives.
 *
 * `'-'` PASSES, and that is the point rather than an oversight. A single
 * hyphen is this platform's existing mark for an absent number: the GST report
 * writes `p.refundsCents > 0 ? ... : '-'` and has since it was built.
 *
 * A separator doing its actual job is not judged, because it is never alone in
 * a fallback: `{' | '}` between two values carries its spaces, `join(', ')` is
 * an argument, and a label reads `'Name:'` with the word attached.
 *
 * Comments are stripped first, so this file's own examples above cannot
 * satisfy or trip it.
 *
 * Run standalone:  node scripts/guards/no-punctuation-standing-in-for-a-value.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import { stripComments, lineAt } from '../lib/js-source.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')
const SEP = String.fromCharCode(92)

/*
 * THE MARKS THAT CAN ONLY EVER BE SEPARATORS, AND THEREFORE CAN NEVER BE A
 * VALUE. This set is SMALL on purpose and the reason is measured rather than
 * asserted.
 *
 * The first version judged EVERY punctuation-only literal in a fallback
 * position. On a clean tree it reported 21 findings and all 21 were correct
 * code doing string composition in a .tsx file:
 *
 *   value > 0 ? '+' : ''        a sign prefix on a KPI delta
 *   href || '/'                 the home route, which is a real destination
 *   url.includes('?') ? '&' : '?'   building a query string
 *   currency === 'AUD' ? '$' : ''   a symbol in front of an amount
 *
 * None of those is a placeholder, and a guard that fails a build over them is
 * one somebody switches off, which this constitution says in as many words. So
 * the rule narrowed to the marks whose whole job is to SEPARATE two things:
 * alone in a value slot they separate nothing and mean nothing. A colon is the
 * one the dash scrub produced; the other three are its near neighbours and
 * would read identically wrong.
 *
 * WHAT THAT COSTS, STATED. A future sweep that replaces a dash with `*` or `~`
 * walks past this guard. The answer to that is the same as for every guard
 * here: it holds the shape that actually happened, and it is widened by
 * someone who finds a second one, with their evidence beside it.
 */
const BANNED_MARKS = new Set([':', ';', ',', '|'])

/**
 * THE SHAPES, AND THE ONE THAT WAS TRIED AND WITHDRAWN.
 *
 * A fourth shape matched a bare JSX child, `{':'}`. It was withdrawn because
 * on a clean tree it matched the JSX significant-space idiom `{' '}` on two
 * hundred lines, and a bare punctuation child is usually a separator doing
 * exactly the job punctuation exists for. The incident never took that form.
 *
 * And `.ts` files are not scanned at all: `cond ? '/' : ''` inside a path
 * builder is string arithmetic, not something a person reads. The defect is a
 * RENDERED value, so the subject is `.tsx`.
 *
 * What is left is the shape the incident really took, in the file kind where a
 * string becomes text on a screen.
 */
const FALLBACK_SHAPES = [
  { name: 'after || or ??', re: /(?:\|\||\?\?)\s*(['"])([^'"]*)\1/g },
  { name: 'a ternary branch', re: /\?\s*(['"])([^'"]*)\1\s*:/g },
  { name: 'a ternary branch', re: /:\s*(['"])([^'"]*)\1\s*(?:\}|\)|,|$)/gm },
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

/** Pure: source in, findings out. Exported so the shapes can be unit-tested. */
export function judgeSource(raw) {
  const src = stripComments(raw)
  const findings = []
  for (const shape of FALLBACK_SHAPES) {
    const re = new RegExp(shape.re.source, shape.re.flags)
    let m
    while ((m = re.exec(src)) !== null) {
      const body = m[2]
      if (!BANNED_MARKS.has(body.trim())) continue
      findings.push({ line: lineAt(src, m.index), shape: shape.name, literal: body })
    }
  }
  return findings
}

/*
 * THE SCAN RUNS ONLY WHEN THIS FILE IS THE ONE INVOKED.
 *
 * Without this, importing the judgement for a unit test runs the whole
 * sweep as a side effect, and on a violating tree the import calls
 * process.exit(1) and takes the test worker with it: a guard that kills
 * the suite that is checking it. The idiom is the one
 * scripts/guards/no-hardcoded-spacing.mjs already uses.
 */
const invokedDirectly =
  Boolean(process.argv[1]) && /no-punctuation-standing-in-for-a-value\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))

if (invokedDirectly) {
  const failures = []
  let scanned = 0
  for (const file of walk(SRC)) {
    scanned += 1
    const rel = relative(ROOT, file).split(SEP).join('/')
    for (const finding of judgeSource(readFileSync(file, 'utf8'))) {
      failures.push(
        `${rel}:${finding.line}  "${finding.literal}" is standing in for a value as ${finding.shape}. ` +
          `A reader sees the mark and not the number. Use '-' if the value is simply absent, or words if it was never collected.`,
      )
    }
  }

  console.log(`[no-punctuation-standing-in-for-a-value] ${scanned} file(s) scanned.`)

  if (failures.length > 0) {
    console.error(`[no-punctuation-standing-in-for-a-value] FAIL - ${failures.length} placeholder(s):`)
    for (const failure of failures) console.error(`  ${failure}`)
    console.error('')
    console.error('  This is what a mechanical character sweep does to a fallback. The dash scrub')
    console.error('  of commit 2b59d58c turned nine of them into a colon, and "Name: :" was on a')
    console.error("  real organiser's screen for weeks.")
    process.exit(1)
  }

  console.log('[no-punctuation-standing-in-for-a-value] PASS - no punctuation mark is standing in for a value.')
}
