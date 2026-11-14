/**
 * GUARD: NO ORGANISER-FACING TEXT PROMISES FREE MONTHS (Lawal, 15 November 2026, 00:37: "A GUARD that fails the build
 * on any organiser-facing text promising free months, fee-free months, referral months or 'Founding Organiser' as a
 * perk (a word list in one file, with its drill), so the old offer can never come back by accident").
 *
 * LAW 24 was retired at 00:19 the same day: every organiser pays the platform fee from day one. The words are in
 * scripts/guards/lib/retired-offer-words.mjs, one file; a new way of saying the old offer is added there.
 *
 * WHAT IT READS. Every .ts and .tsx file under src (each page, its metadata and social cards, emails, SMS, the FAQ and
 * help, legal pages, admin and dashboard), comments stripped first because a comment recording what the offer used to
 * say is history and nobody is shown it; and every text file under public (static pages, manifests, feeds).
 *
 * WHAT FAILS.
 *   1. Any line holding one of the retired words, outside the record of the closed offer (OFFER_RECORD, each file with
 *      its reason).
 *   2. Any file outside that record that renders the offer module's own words (FOUNDING_TERMS and its month words),
 *      which is how the old offer reached a page without one typed month.
 *   3. The switch: FOUNDING_OFFER_OPEN must read false in src/lib/payments/founding-waiver.ts.
 * Each record file must still hold at least one line it is excused for, or the record has outlived what it excuses.
 *
 * Run: node scripts/guards/no-free-months-promise.mjs [root]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { stripJsComments } from './lib/strip-js-comments.mjs'
import { OFFER_RECORD, RETIRED_OFFER_NAMES, RETIRED_OFFER_WORDS } from './lib/retired-offer-words.mjs'

const TAG = '[no-free-months-promise]'
const ROOT = process.argv[2] ?? process.cwd()
const MODULE = 'src/lib/payments/founding-waiver.ts'
const PUBLIC_TEXT = /\.(html?|json|txt|xml|webmanifest|md|csv)$/i

function files(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...files(full))
    else out.push(full)
  }
  return out
}

const rel = (f) => relative(ROOT, f).split(sep).join('/')
const RECORD = new Map(OFFER_RECORD.map((r) => [r.file, r.reason]))

/** Every finding in one file: [line number, the word list entry it matched, the line]. */
export function findingsIn(text) {
  const found = []
  text.split(/\r?\n/).forEach((line, i) => {
    for (const word of RETIRED_OFFER_WORDS) {
      if (word.pattern.test(line)) found.push({ line: i + 1, word: word.name, text: line.trim().slice(0, 160) })
    }
  })
  return found
}

const failures = []
const excused = new Map()

const sources = files(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f))
for (const file of sources) {
  const path = rel(file)
  const code = stripJsComments(readFileSync(file, 'utf8'))
  const found = findingsIn(code)
  const names = RETIRED_OFFER_NAMES.test(code)
  if (RECORD.has(path)) {
    excused.set(path, found.length + (names ? 1 : 0))
    continue
  }
  for (const f of found) failures.push(`${path}:${f.line} says "${f.word}": ${f.text}`)
  if (names) failures.push(`${path} renders the closed offer's words (FOUNDING_TERMS or its month words)`)
}

for (const file of files(join(ROOT, 'public')).filter((f) => PUBLIC_TEXT.test(f))) {
  const path = rel(file)
  for (const f of findingsIn(readFileSync(file, 'utf8'))) failures.push(`${path}:${f.line} says "${f.word}": ${f.text}`)
}

const moduleFile = join(ROOT, MODULE)
if (!existsSync(moduleFile)) {
  failures.push(`${MODULE} is missing, so the switch cannot be read`)
} else if (!/export const FOUNDING_OFFER_OPEN\s*=\s*false\b/.test(readFileSync(moduleFile, 'utf8'))) {
  failures.push(`${MODULE}: FOUNDING_OFFER_OPEN must read false (LAW 24 retired, 15 November 2026)`)
}

for (const { file } of OFFER_RECORD) {
  if (!existsSync(join(ROOT, file))) failures.push(`the record names ${file}, which is gone: take it off the record`)
  else if ((excused.get(file) ?? 0) === 0) failures.push(`the record excuses ${file}, which no longer says the old offer: take it off the record`)
}

console.log(`${TAG} read ${sources.length} source files and the public folder; ${RETIRED_OFFER_WORDS.length} retired phrases; ${OFFER_RECORD.length} files on the record`)
if (failures.length > 0) {
  console.error(`${TAG} FAIL: ${failures.length} finding(s). LAW 24 is retired (Lawal, 15 November 2026): every organiser pays the fee from day one.`)
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS: no organiser-facing text promises free months, referral months or the badge as a perk.`)
