/**
 * A PHOTOGRAPH'S CREDIT IS PRINTED ONCE, THROUGH ONE FUNCTION (the PM's 09:19 of 12 November 2026, item 4: "Fix it
 * everywhere a credit is printed, with a test, and a guard that fails a doubled prefix").
 *
 * The fault: AMCF's register holds 'Photo: AMCF, past festival (2024)', and the city guide, the event page and the
 * gallery printed 'Photo: Photo: AMCF, past festival (2024)' on www.eventlinqs.com.au; six more places (the walk in
 * page, the daily poster, the social cards, the treatment layout, two campaign texts) built their own 'Photo: <credit>'
 * the same way. src/lib/media/photo-credits.ts creditLine now strips a recorded prefix and prints one; every place goes
 * through it.
 *
 * This fails the build when any file under src builds 'Photo: ' or 'Photos: ' in front of an interpolated value (a
 * template literal 'Photo: ${...}', or JSX text 'Photo: {...}') anywhere but creditLine's own file. A reviewed entry
 * says why it is not a credit, and an entry that no longer matches is reported, so the list cannot rot.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const TAG = '[credit-printed-once]'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const HOME = 'src/lib/media/photo-credits.ts'
/** Reviewed: a 'Photo:' that is a label in a message, not a photograph's credit. */
const REVIEWED = [
  { file: 'src/lib/listings/self-listing-run.ts', match: 'Photo: ${photo.words}', why: "the organiser's notice lists 'Photo: yes ...' as a fact line, not a credit" },
]
// No word boundary: a credit built after a newline escape ('\nPhoto: ${...}') is caught as well; JSX text is caught after
// a tag or at the start of its own line (the walk in page's 'Photos: {guide.photo_credit}' sat on a line of its own).
const PREFIXED = /Photos?: \$\{|>\s*Photos?: \{|^\s*Photos?: \{/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) out.push(p)
  }
  return out
}

const faults = []
const seen = new Set()
let read = 0
for (const file of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file).split(sep).join('/')
  if (rel === HOME) continue
  read += 1
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (!PREFIXED.test(line)) return
    const reviewed = REVIEWED.find((r) => r.file === rel && line.includes(r.match))
    if (reviewed) { seen.add(reviewed); return }
    faults.push(`${rel}:${i + 1}: builds its own credit prefix: ${line.trim().slice(0, 120)}`)
  })
}
for (const r of REVIEWED) if (!seen.has(r)) faults.push(`reviewed entry no longer matches anything, remove it: ${r.file} '${r.match}'`)

if (faults.length) {
  console.error(`${TAG} FAIL: ${faults.length} place(s) print a photograph credit without creditLine (${HOME}), so a recorded 'Photo:' would print twice:`)
  for (const f of faults) console.error(`${TAG}   ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS: ${read} source files read; every credit goes through creditLine; ${REVIEWED.length} reviewed label(s), each still present.`)
