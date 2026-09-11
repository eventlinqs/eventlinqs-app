// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
/**
 * A LABEL MUST NAME THE CONTROL IT DESCRIBES.
 *
 * The sibling guard, labelled-form-controls.mjs, proves every raw control HAS a
 * name. It cannot prove the name is TRUE, and the founder was right that it
 * never could: it asks "is this control named", not "is this the control the
 * name belongs to".
 *
 * THE DEFECT THAT CAUSED THIS, 28 August 2026. The ticket tier editor rendered:
 *
 *     <label htmlFor="tier-price-0">Price</label>
 *     <select id="tier-price-0"> AUD USD GBP ... </select>
 *     <input aria-label="Ticket price for tier 1" />
 *
 * The visible word "Price" named the CURRENCY dropdown. Pressing the label
 * focused the currency. A journey that filled "the field the label names"
 * produced a $0 ticket on a paid event, and the platform then behaved perfectly
 * correctly for a free event, which is why it read as a product defect for an
 * hour before the label was found.
 *
 * WHY THIS IS STATIC AND ITS SIBLING SWEEP IS NOT ENOUGH. A DOM sweep of 72
 * routes reached 40 labels: the pairings that matter sit behind wizard steps,
 * modals and tabs that a route-level crawl never opens. The one that broke was
 * on step 5 of 7. So this reads the JSX, and the DOM sweep
 * (tmp-label-truth-sweep.mjs) is the cross-check where a surface is reachable.
 *
 * FOUR RULES, in descending order of certainty:
 *
 *   BROKEN         htmlFor names an id that no element in the file carries.
 *                  The label is decorative and nothing knows it.
 *   NOT-A-CONTROL  htmlFor names an element that cannot be labelled.
 *   REPEATED-ID    a control rendered unconditionally once per list item carries
 *                  a LITERAL id, so every item in the list has the same one and
 *                  every label after the first points at the first item's field.
 *                  Added 10 September 2026; see insideAListRender below for the
 *                  six that were live in the ticket tier editor.
 *   WRONG-CONTROL  the label's HEAD NOUN appears in a sibling control's
 *                  aria-label, while the label points at a different control.
 *
 * THE HEAD NOUN IS THE WHOLE TRICK. Matching on any shared word reported "Event
 * Title" against a sibling textarea aria-labelled "Describe your event", because
 * both contain "event". The last significant word is what a label is ABOUT:
 * "Price" -> price, "Event Title" -> title. "Price" appears in "Ticket price for
 * tier 1" and fires; "title" does not appear in "describe your event" and stays
 * quiet. That single change took the false-positive count from one to zero on
 * the whole tree.
 *
 * Usage: node scripts/guards/labels-name-the-right-control.mjs [--verbose]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const VERBOSE = process.argv.includes('--verbose')

const CONTROL_TAGS = new Set(['input', 'select', 'textarea'])
const LABELABLE = new Set(['input', 'select', 'textarea', 'button', 'meter', 'output', 'progress'])

/**
 * Words that are never the subject of a label on this platform, so they must not
 * be treated as a head noun. Kept deliberately short: every entry weakens the
 * guard, so each one is here because it appeared as a real head noun on a real
 * label and carried no meaning about WHICH control was meant.
 */
const NOT_HEAD_NOUNS = new Set(['optional', 'required'])

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (e.endsWith('.tsx')) out.push(full)
  }
  return out
}

const tagOf = n => {
  const t = ts.isJsxElement(n) ? n.openingElement.tagName : ts.isJsxSelfClosingElement(n) ? n.tagName : null
  return t ? t.getText() : null
}
const openingOf = n => (ts.isJsxElement(n) ? n.openingElement : n)
const attrsOf = n => openingOf(n).attributes.properties

function attr(node, name) {
  for (const p of attrsOf(node)) {
    if (ts.isJsxAttribute(p) && p.name.getText() === name) {
      if (!p.initializer) return { literal: true, value: 'true', raw: 'true' }
      if (ts.isStringLiteral(p.initializer)) return { literal: true, value: p.initializer.text, raw: p.initializer.text }
      // A dynamic id such as {`tier-price-${idx}`} is still comparable to a
      // dynamic htmlFor written the same way. Keep the source so the two can be
      // matched textually; without this every templated pairing looked unmatched
      // and the guard accused a label that pointed exactly where it should.
      return { literal: false, value: null, raw: p.initializer.getText() }
    }
  }
  return null
}

/** The visible words of a JSX element, ignoring nested markup. */
function textOf(node) {
  let out = ''
  const visit = n => {
    if (ts.isJsxText(n)) out += ' ' + n.text
    ts.forEachChild(n, visit)
  }
  ts.forEachChild(node, visit)
  return out.replace(/\s+/g, ' ').trim()
}

/** What the label is ABOUT: its last significant word. */
function headNoun(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !NOT_HEAD_NOUNS.has(w))
  return words.length ? words[words.length - 1] : null
}

/**
 * True when this element is rendered once per item of a list.
 *
 * WHY IT MATTERS, found on 10 September 2026. The ticket tier editor renders
 * `formData.ticket_tiers.map((tier, idx) => ...)`, and SIX of the controls
 * inside that map carried a HARDCODED id: `type-21`, `sale-starts-24`,
 * `sale-ends-25`, `min-per-order-26`, `max-per-order-27`,
 * `description-optional-28`. With one ticket type the form was correct. Add a
 * second and the document carried two elements with each of those ids, so five
 * labels pointed at the FIRST tier's control whichever tier they sat beside:
 * pressing "Sale Ends" on tier two focused tier one, and a screen reader
 * announced two different fields by the same name.
 *
 * The sibling rules here could not see it. BROKEN needs an id nothing carries,
 * and every one of these ids WAS carried. The defect is not that the target is
 * missing, it is that there are two of it, and that is only visible from the
 * fact that the markup repeats.
 */
function insideAListRender(node) {
  for (let n = node.parent; n; n = n.parent) {
    /*
     * A CONDITION BETWEEN THE CONTROL AND THE map() MEANS IT IS NOT REPEATED,
     * and this clause is here because the first run of this rule accused three
     * pairs in the seat manager that are perfectly correct. That file renders
     * `{movingId === seat.id && (...)}` and `{isHolding && (...)}` inside its
     * map, and both are pinned to ONE row of state, so exactly one instance of
     * each control is ever in the document.
     *
     * Deciding WHICH conditions pin a single item would mean reading the
     * developer's intent, so this does not try: any condition at all between the
     * control and the map buys the benefit of the doubt. That makes the rule
     * conservative, which is the right direction for a guard that blocks a
     * build. What remains is still exactly the defect it was written for: a
     * control rendered UNCONDITIONALLY once per item, carrying one fixed id.
     */
    if (ts.isConditionalExpression(n)) return false
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return false
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.getText() === 'map'
    ) {
      return true
    }
  }
  return false
}

/** Every labelable descendant of a node, with its own aria-label if it has one. */
function controlsUnder(node) {
  const found = []
  const visit = n => {
    if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n))) {
      const tag = tagOf(n)
      if (tag && CONTROL_TAGS.has(tag)) {
        found.push({ node: n, tag, id: attr(n, 'id'), aria: attr(n, 'aria-label') })
      }
    }
    ts.forEachChild(n, visit)
  }
  ts.forEachChild(node, visit)
  return found
}

const files = walk(SRC)
let labelsSeen = 0
let dynamicSkipped = 0
let groupsChecked = 0
let repeatedIds = 0
const failures = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  if (!src.includes('htmlFor')) continue
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const rel = relative(ROOT, file).replace(/\\/g, '/')

  // Every literal id declared anywhere in this file, and what tag carries it.
  const idsInFile = new Map()
  const collect = n => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const id = attr(n, 'id')
      if (id?.literal) idsInFile.set(id.value, tagOf(n))
    }
    ts.forEachChild(n, collect)
  }
  ts.forEachChild(sf, collect)

  const visit = (node, ancestors) => {
    /*
     * REPEATED-ID, checked on every element rather than only on labels, because
     * the control carrying the duplicated id is as much the defect as the label
     * pointing at it.
     */
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagOf(node)
      if (tag && (CONTROL_TAGS.has(tag) || tag === 'label') && insideAListRender(node)) {
        const repeated = tag === 'label' ? attr(node, 'htmlFor') : attr(node, 'id')
        if (repeated?.literal) {
          repeatedIds += 1
          failures.push({
            rel,
            line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            kind: 'REPEATED-ID',
            text: tag === 'label' ? textOf(node) : `<${tag}>`,
            detail:
              `${tag === 'label' ? 'htmlFor' : 'id'}="${repeated.value}" is a literal inside a list render, ` +
              'so every item in the list carries the same one. Index it, for example ' +
              '{`' + repeated.value.replace(/-\d+$/, '') + '-${idx}`}.',
          })
        }
      }
    }
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && tagOf(node) === 'label') {
      const forAttr = attr(node, 'htmlFor')
      if (forAttr) {
        labelsSeen++
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1
        const text = textOf(node)
        if (!forAttr.literal) {
          dynamicSkipped++
        } else {
          const targetTag = idsInFile.get(forAttr.value)
          if (!targetTag) {
            failures.push({ rel, line, kind: 'BROKEN', text, detail: `no element in this file carries id="${forAttr.value}"` })
          } else if (!LABELABLE.has(targetTag)) {
            failures.push({ rel, line, kind: 'NOT-A-CONTROL', text, detail: `points at <${targetTag}>, which cannot be labelled` })
          }
        }

        // WRONG-CONTROL: look at the field group this label sits in.
        const group = ancestors.find(a => controlsUnder(a).length > 1)
        if (group) {
          groupsChecked++
          const controls = controlsUnder(group)
          const noun = headNoun(text)
          if (noun) {
            for (const c of controls) {
              const isTarget = Boolean(
                c.id &&
                  ((forAttr.literal && c.id.literal && c.id.value === forAttr.value) ||
                    (!forAttr.literal && !c.id.literal && c.id.raw === forAttr.raw)),
              )
              if (isTarget) continue
              const aria = c.aria?.literal ? c.aria.value : null
              // A dynamic aria-label still carries its literal words in the
              // template, so read the raw text rather than skipping it.
              const ariaText = aria ?? (c.aria ? c.node.getText().match(/aria-label=\{`([^`]*)`\}/)?.[1] ?? '' : '')
              if (!ariaText) continue
              if (ariaText.toLowerCase().includes(noun)) {
                failures.push({
                  rel,
                  line,
                  kind: 'WRONG-CONTROL',
                  text,
                  detail:
                    `its head noun "${noun}" appears in a sibling <${c.tag}> aria-labelled ` +
                    `"${ariaText.slice(0, 46)}", but the label points elsewhere`,
                })
                break
              }
            }
          }
        }
      }
    }
    const next = ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) ? [node, ...ancestors] : ancestors
    ts.forEachChild(node, c => visit(c, next))
  }
  ts.forEachChild(sf, c => visit(c, []))
}

console.log('[labels-name-the-right-control] WHAT WAS SCANNED')
console.log(`  .tsx files under src/          : ${files.length}`)
console.log(`  labels with htmlFor            : ${labelsSeen}`)
console.log(`  of those, a dynamic id         : ${dynamicSkipped}  (target not resolvable statically)`)
console.log(`  multi-control field groups     : ${groupsChecked}`)
console.log(`  literal ids inside a list render: ${repeatedIds}`)
console.log(`  FAILURES                       : ${failures.length}`)

if (labelsSeen === 0) {
  console.log('')
  console.log('[labels-name-the-right-control] FAILED: it found NO labels at all.')
  console.log('  A scanner that reads nothing reports no problems. Zero is a failure, never a pass.')
  process.exit(1)
}

if (VERBOSE) {
  console.log(`  (head nouns are the last word over three letters, minus ${[...NOT_HEAD_NOUNS].join(', ')})`)
}

if (failures.length) {
  console.log('')
  console.log('[labels-name-the-right-control] FAILED. These labels do not name what they describe:')
  for (const f of failures) {
    console.log(`  ${f.rel}:${f.line}  ${f.kind}  "${f.text.slice(0, 46)}"`)
    console.log(`      ${f.detail}`)
  }
  console.log('')
  console.log('  Point htmlFor at the control the words describe, and give the other')
  console.log('  control in the group its own aria-label.')
  process.exit(1)
}

console.log('')
console.log('[labels-name-the-right-control] PASS. Every label names the control it describes.')
