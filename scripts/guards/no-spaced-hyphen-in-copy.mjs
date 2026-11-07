/**
 * GUARD: NO SPACED HYPHEN IN WHAT A VISITOR READS (law 6 in C:\dev\CLAUDE.md, Lawal, 31 October 2026: "no em dash, no
 * en dash, no spaced hyphen"; the dash half is compound-modifiers-hyphenated.mjs).
 *
 * Found 8 November 2026 on the admin's first sign in: the enrol button read "I have saved them - continue". A spaced
 * hyphen standing in for a dash is the dash rule broken by a different key, and a text grep cannot find it among the
 * subtractions of real code. So this reads every .tsx under src/ as TypeScript and judges only what renders as words:
 * JSX text, and string values of the attributes a person reads or hears (title, alt, placeholder, aria-label,
 * aria-description, label, subtitle, eyebrow, title props and the like, any attribute whose value is a sentence).
 * A range written with numbers on both sides (7 - 9pm) is still a spaced hyphen and still fails: write "7 to 9pm".
 *
 *   node scripts/guards/no-spaced-hyphen-in-copy.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const TAG = '[no-spaced-hyphen-in-copy]'
const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const SPACED = /\S[ \t]+-[ \t]+\S/
// Reviewed exceptions, printed on every run. Legal wording changes only by a new dated version (the founder's operating
// rule 6 of 25 September 2026, CLAUDE.md), so its one spaced hyphen waits for that version rather than a quiet edit.
const REVIEWED = new Map([
  ['src/app/legal/cookies/page.tsx', 'legal wording: fixed in its next dated version, raised to the PM on 8 November 2026'],
])
// Attributes whose string is code, never words a person reads.
const CODE_ATTRS = new Set(['className', 'class', 'href', 'src', 'id', 'name', 'type', 'key', 'style', 'd', 'viewBox', 'pattern', 'autoComplete', 'inputMode', 'rel', 'target', 'method', 'action', 'role', 'htmlFor', 'sizes', 'srcSet', 'media', 'as', 'variant', 'size', 'data-testid'])

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) yield* walk(full)
    else if (e.name.endsWith('.tsx')) yield full
  }
}

/** Every spaced hyphen a visitor would read in one .tsx source. Exported for the guard's own test. */
export function spacedHyphensIn(fileName, text) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found = []
  const add = (node, words) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    found.push({ line, words: words.replace(/\s+/g, ' ').trim().slice(0, 120) })
  }
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (SPACED.test(node.text.replace(/\s+/g, ' '))) add(node, node.text)
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf)
      if (!CODE_ATTRS.has(name) && !name.startsWith('data-')) {
        const init = node.initializer
        const lit = ts.isStringLiteral(init) ? init : ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression)) ? init.expression : null
        if (lit && SPACED.test(lit.text)) add(lit, lit.text)
      }
    } else if (ts.isJsxExpression(node) && node.expression && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression)) && !ts.isJsxAttribute(node.parent)) {
      if (SPACED.test(node.expression.text)) add(node.expression, node.expression.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const faults = []
  let files = 0
  for (const file of walk(SRC)) {
    files += 1
    const rel = relative(ROOT, file).split(sep).join('/')
    const hits = spacedHyphensIn(file, readFileSync(file, 'utf8'))
    if (REVIEWED.has(rel)) {
      if (hits.length === 0) faults.push(`${rel}: on the reviewed list but holds no spaced hyphen now; take it off the list`)
      continue
    }
    for (const f of hits) faults.push(`${rel}:${f.line}  "${f.words}"`)
  }
  if (faults.length) {
    console.error(`${TAG} FAIL: ${faults.length} spaced hyphen(s) in copy a visitor reads, across ${files} .tsx files. Write a colon, a comma, "to", or reword:`)
    for (const f of faults) console.error(`  ${f}`)
    process.exit(1)
  }
  for (const [file, why] of REVIEWED) console.log(`${TAG} reviewed: ${file} (${why})`)
  console.log(`${TAG} PASS: no spaced hyphen in the JSX text or read attributes of ${files} .tsx files`)
}
