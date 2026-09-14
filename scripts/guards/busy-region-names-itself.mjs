/**
 * BUSY REGION NAMES ITSELF: a loading skeleton that carries an accessible name
 * must carry a role that is allowed to have one.
 *
 * ---------------------------------------------------------------------------
 * WHY. This defect has now been fixed four times in this tree and written down
 * once, and the writing down did not stop it happening three more times,
 * because a comment in one file cannot see the next file.
 *
 *   1. THE SEATING PLAN SKELETON. `src/components/checkout/seat-selector-lazy.tsx`
 *      shipped `<div aria-busy aria-label="...">` and cost the Lighthouse
 *      accessibility floor on the very run that proved the performance fix:
 *      0.97 against a floor of 1.00, identical on all three runs. It was fixed
 *      to role="status" and a twelve-line comment was left explaining why. That
 *      comment is still there and is still correct. It stopped nothing.
 *
 *   2. THE CHECKOUT SKELETON, found 13 September 2026 by the UX6 driven proof,
 *      which BLOCKED THE PUSH GATE at the checkout-viewport step. Identical
 *      shape, in `src/app/checkout/[reservation_id]/loading.tsx`. axe serious
 *      `aria-prohibited-attr`, on the buyer's payment surface, at 390, 768 and
 *      1440. It only surfaces while the route segment is still loading, which
 *      is why months of audits on settled pages never saw it.
 *
 *   3. THE EVENT PAGE SKELETON, `src/app/events/[slug]/loading.tsx`, and
 *   4. `src/components/ui/LoadingState.tsx`, both found in the same sweep,
 *      both the same shape. The event one sits on the most-visited public
 *      surface the platform has.
 *
 * The mechanism, stated once so it is not re-derived: a plain <div> maps to
 * role=generic, and a generic role is PROHIBITED from carrying an accessible
 * name. So the label is invalid ARIA *and* is never announced. The author gets
 * neither the accessibility they wrote the attribute for nor a warning that
 * they did not get it. `status` is a live region that permits a name and
 * announces politely once, which is exactly the semantic of a skeleton.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CAN AND CANNOT JUDGE, stated so the scope is not mistaken for
 * completeness.
 *
 * It CANNOT judge the general prohibited-name case, and deliberately does not
 * try. axe only raises a VIOLATION when the named element also has no text
 * anywhere in its subtree; where there is text it returns `incomplete`, which
 * is a review note rather than a failure. Whether a subtree renders text is a
 * runtime question a source scanner cannot answer, so a guard that flagged
 * every `<div aria-label>` would fire on about fifteen sites in this tree that
 * are NOT violations, and would be switched off inside a week.
 *
 * That claim is measured, not assumed. Six shapes were run through the
 * installed axe-core in a real browser on 13 September 2026:
 *
 *   div aria-busy + aria-label, no role, no subtree text  -> VIOLATION serious
 *   div aria-busy + aria-label, empty bars, no role       -> VIOLATION serious
 *   div role=status + aria-busy + sr-only text            -> clean
 *   div aria-label WITH subtree text                      -> incomplete only
 *   section aria-label (role=region)                      -> clean
 *   span aria-label with text inside                      -> incomplete only
 *
 * So what it CAN judge, with no false positives, is the shape every one of the
 * four incidents took and the shape a skeleton takes by construction: an
 * element that declares itself BUSY. `aria-busy` is the author saying "this is
 * a loading region", and a loading region's subtree is placeholders, so it has
 * no text by design. If such an element also carries a name, that name is
 * prohibited unless the element carries a role that permits one.
 *
 * Narrow and certain beats broad and muted.
 *
 * ---------------------------------------------------------------------------
 * THE ROLE TABLE IS A CLAIM, AND IT IS PINNED RATHER THAN READ.
 *
 * The roles below come from the installed axe-core's own `prohibitedAttrs`
 * table, not from memory. They are COPIED here rather than read from
 * node_modules at build time on purpose: axe-core is a transitive DEV
 * dependency (via @axe-core/playwright), and a build-time guard that reads a
 * dev dependency is the same bet that has cost this project four deployments.
 * A guard must run on a tree that has been stripped for upload.
 *
 * So the constant is pinned, and the drift is caught where dev dependencies do
 * exist: `tests/unit/a11y/busy-region-names-itself.test.ts` re-derives this
 * exact list from the installed axe-core and fails if it has moved.
 */
import { sourceFiles, readSource, lineAt } from './lib/source.mjs'

const NAME = '[busy-region-names-itself]'

/**
 * Roles whose spec PROHIBITS an accessible name.
 *
 * Source: node_modules/axe-core/axe.js, every `prohibitedAttrs:
 * ['aria-label','aria-labelledby']` entry in the ariaRoles standard.
 * Derived 2026-09-13 against axe-core as installed. Re-derived by the unit
 * test named above on every run of the suite.
 */
export const ROLES_THAT_PROHIBIT_A_NAME = [
  'caption', 'code', 'deletion', 'emphasis', 'insertion', 'mark', 'none',
  'paragraph', 'presentation', 'strong', 'subscript', 'superscript', 'suggestion',
]

const NAMING_ATTRS = ['aria-label', 'aria-labelledby']
const BACKSLASH = String.fromCharCode(92)

/**
 * Read one JSX opening tag's attribute text, starting just after the tag name.
 * Brace- and quote-aware, because `className={cx('a', b > c ? 'd' : 'e')}`
 * contains a `>` that does not end the tag. Returns null if the tag never
 * closes, which a source scanner should decline to judge rather than guess at.
 */
function attributesOf(src, from) {
  let depth = 0
  let quote = null
  for (let i = from; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === quote && src[i - 1] !== BACKSLASH) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '{') { depth++; continue }
    if (c === '}') { depth--; continue }
    if (c === '>' && depth === 0) return src.slice(from, i)
  }
  return null
}

/** The judgement, exported so the drill test can exercise it without a build. */
export function judgeSource(src, file) {
  const found = []
  let elements = 0
  let busy = 0
  const tag = /<([a-zA-Z][a-zA-Z0-9.]*)(?=[\s/>])/g
  let m
  while ((m = tag.exec(src))) {
    const attrs = attributesOf(src, tag.lastIndex)
    if (attrs === null) continue
    elements++
    if (!/\baria-busy\b/.test(attrs)) continue
    busy++
    const named = NAMING_ATTRS.filter((a) => new RegExp(`\\b${a}\\s*=`).test(attrs))
    if (named.length === 0) continue

    const roleMatch = /\brole\s*=\s*(?:"([^"]*)"|'([^']*)'|\{)/.exec(attrs)
    if (!roleMatch) {
      found.push({
        file, line: lineAt(src, m.index), tag: m[1],
        detail:
          `<${m[1]}> declares itself aria-busy and carries ${named.join(' and ')}, but has no role. ` +
          `A plain element maps to role=generic, which is prohibited from carrying an accessible name, ` +
          `so this name is invalid ARIA and is never announced.`,
      })
      continue
    }
    const role = roleMatch[1] ?? roleMatch[2] ?? null
    // role={expr} is not statically knowable; do not guess at it either way.
    if (role === null) continue
    if (ROLES_THAT_PROHIBIT_A_NAME.includes(role)) {
      found.push({
        file, line: lineAt(src, m.index), tag: m[1],
        detail:
          `<${m[1]}> declares itself aria-busy and carries ${named.join(' and ')} with role="${role}", ` +
          `and that role is prohibited from carrying an accessible name.`,
      })
    }
  }
  return { found, elements, busy }
}

// Run as a guard only when invoked directly, so the test can import the judge.
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('busy-region-names-itself.mjs')

if (invokedDirectly) {
  const findings = []
  let elementsScanned = 0
  let busyScanned = 0
  const files = sourceFiles(process.cwd(), { extensions: ['.tsx'], subdir: 'src' })

  for (const file of files) {
    // `withStrings` is comments stripped, string contents KEPT: the attribute
    // values matter, and this file's own prose describing the banned shape
    // must not trip it.
    const src = readSource(file).withStrings
    const r = judgeSource(src, file)
    findings.push(...r.found)
    elementsScanned += r.elements
    busyScanned += r.busy
  }

  console.log(
    `${NAME} scanned ${files.length} .tsx file(s), ${elementsScanned} element(s), ${busyScanned} of them aria-busy.`,
  )

  if (files.length === 0 || elementsScanned === 0) {
    console.error(
      `${NAME} FAIL - this guard scanned nothing, so it proved nothing. ` +
        `Either the file layout moved or the tag matcher is broken. ` +
        `A guard that finds zero units is a broken guard, not a pass.`,
    )
    process.exit(1)
  }

  if (findings.length) {
    console.error(`\n${NAME} FAIL - ${findings.length} busy region(s) carry a name that is never announced:\n`)
    for (const f of findings) console.error(`  ${f.file}:${f.line}\n      ${f.detail}\n`)
    console.error(
      'Give it role="status" and put the words in a <span className="sr-only"> inside it, ' +
        'so the name is permitted AND the announcement does not depend on the attribute alone. ' +
        'src/components/checkout/seat-selector-lazy.tsx is the reference shape.',
    )
    process.exit(1)
  }

  console.log(`${NAME} PASS - every busy region that names itself carries a role allowed to have a name.`)
}
