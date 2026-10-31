/**
 * GUARD: THE PLATFORM's OWN COPY KEEPS LAWAL's DASH RULE (law 6 in C:\dev\CLAUDE.md, 31 October 2026; the CONTROLLER's
 * 12:33; window 2).
 *
 * A compound modifier before a noun always takes the plain hyphen (the day-by-day program, a family-friendly event),
 * a compound word always does (sister-in-law), and no em dash or en dash stands in any copy. The communication gateway
 * enforces this on every message; this guard enforces it on the platform's own words: pages, cards, emails, templates
 * and social pieces, everything under src/.
 *
 * THE LIST is the gateway's own (C:\dev\comms-gateway\compounds.json), copied into src/lib/copy/compounds.generated.json
 * by scripts/ops/compounds-generate.mjs, because a build reads nothing outside src/. 'The weekend, day by day' as a
 * heading stays unhyphenated (an adverb phrase); only the phrase directly before one of the listed nouns is judged.
 *
 * THE DASH CHECK has one reviewed exception list, printed on every run: code that REMOVES dashes from text has to name
 * the characters it removes. Anything else carrying an em or en dash fails.
 *
 *   node scripts/guards/compound-modifiers-hyphenated.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const TAG = '[compound-modifiers-hyphenated]'
const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const LIST = 'src/lib/copy/compounds.generated.json'
const TEXT = /\.(ts|tsx|js|jsx|mjs|md|mdx|html|json|css)$/
const SKIP = new Set([LIST, 'src/lib/outreach/voice-policy.generated.json'])
// Code that strips dashes out of text must name them. Reviewed 31 October 2026.
const DASH_REMOVERS = new Map([
  ['src/lib/ai/sanitise.ts', 'enforceCopyLaws turns every dash in model output into a hyphen or a comma'],
  ['src/lib/stripe/business-profile.ts', 'the statement descriptor normaliser maps dashes to a plain hyphen'],
])

let list
try {
  list = JSON.parse(readFileSync(join(ROOT, LIST), 'utf8'))
} catch (e) {
  console.error(`${TAG} FAIL: ${LIST} cannot be read (${e instanceof Error ? e.message : e}); generate it with scripts/ops/compounds-generate.mjs`)
  process.exit(1)
}
if (!Array.isArray(list.mustHyphenateBeforeNoun) || list.mustHyphenateBeforeNoun.length === 0 || typeof list.nounsAfter !== 'string' || !Array.isArray(list.compoundWords)) {
  console.error(`${TAG} FAIL: ${LIST} is incomplete; generate it again`)
  process.exit(1)
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const spaced = (phrase) => phrase.split(' ').map(escape).join('\\s+')
const modifiers = list.mustHyphenateBeforeNoun.map((p) => ({ p, rx: new RegExp(`\\b${spaced(p)}\\s+(${list.nounsAfter})\\b`, 'i') }))
const words = list.compoundWords.map((p) => ({ p, rx: new RegExp(`\\b${spaced(p)}\\b`, 'i') }))
const DASH = /[\u2013\u2014]/

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) yield* walk(full)
    else if (TEXT.test(e.name)) yield full
  }
}

const faults = []
let files = 0
for (const full of walk(SRC)) {
  const rel = relative(ROOT, full).split(sep).join('/')
  if (SKIP.has(rel)) continue
  files++
  const lines = readFileSync(full, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const { p, rx } of modifiers) {
      const m = line.match(rx)
      if (m) faults.push(`${rel}:${i + 1}: "${m[0]}" needs its hyphen: "${p.replace(/ /g, '-')} ${m[1]}"`)
    }
    for (const { p, rx } of words) {
      if (rx.test(line)) faults.push(`${rel}:${i + 1}: "${p}" is one word with hyphens: "${p.replace(/ /g, '-')}"`)
    }
    if (DASH.test(line) && !DASH_REMOVERS.has(rel)) faults.push(`${rel}:${i + 1}: an em or en dash; use a comma, a colon or a plain hyphen`)
  })
}

console.log(`${TAG} read ${files} files under src/ against ${modifiers.length} compound modifiers and ${words.length} compound words; dash removers allowed: ${[...DASH_REMOVERS].map(([f, why]) => `${f} (${why})`).join('; ')}`)
if (faults.length > 0) {
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} ${faults.length} fault(s). Law 6: a compound modifier before a noun takes the plain hyphen; no em or en dash in any copy.`)
  process.exit(1)
}
console.log(`${TAG} PASS: every listed compound before its noun carries its hyphen, and no copy carries an em or en dash.`)
