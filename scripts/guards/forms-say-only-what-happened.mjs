/**
 * A FORM SAYS ONLY WHAT HAPPENED (WINDOW 5C, 21 November 2026; Lawal, 09:02: "People have written to us that they are
 * unable to carry out functions on the website ... Every function works to completion"). The /contact page's "Send us a
 * message" set window.location.href to a mailto: link and, half a second later, showed "Message received. Thanks."
 * whatever happened; with no mail app set up nothing opened, and the visitor was told their message had arrived. Found
 * on production by tests/e2e/production-journeys/d3-forms.journey.ts.
 *
 * The clauses, each read from the source (comments out):
 *   1. No file under src sends a visitor to a mail app as a form's submit: no location.href = / location.assign( of a
 *      mailto: address (a plain <a href="mailto:..."> link is a link the visitor chose, and is allowed).
 *   2. No file under src shows a success state from a timer: setSubmitted / setSent / setSuccess / setDone (true) inside
 *      a setTimeout callback, which is a thanks that waits for nothing.
 *
 * A root may be passed as the first argument, so the drill can run it against a tree holding the old form.
 * Exits 1 naming each clause that fails.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[forms-say-only-what-happened]'
const ROOT = process.argv[2] ?? process.cwd()
const FAILURES = []
const fail = (clause, message) => FAILURES.push(`${clause}: ${message}`)
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

function files(path) {
  if (!existsSync(path)) return []
  if (statSync(path).isFile()) return [path]
  return readdirSync(path).flatMap((e) => files(join(path, e)))
}

const rel = (f) => relative(ROOT, f).split(sep).join('/')
const sources = files(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f))
// location.href = `mailto:...`, location.href = mailto (a variable holding one), location.assign('mailto:...')
const MAILTO_SUBMIT = /location\.(?:href\s*=|assign\s*\()\s*(?:[`'"]mailto:|mailto\b)/
const TIMER_THANKS = /setTimeout\(\s*\(\)\s*=>\s*\{[^}]*\bset(?:Submitted|Sent|Success|Done)\(\s*true\s*\)/

let forms = 0
for (const file of sources) {
  const path = rel(file)
  const src = code(readFileSync(file, 'utf8'))
  if (/<form\b|onSubmit=/.test(src)) forms += 1
  const m = MAILTO_SUBMIT.exec(src)
  if (m) fail('1', `${path} hands the visitor to a mail app (${m[0]}) instead of sending to EventLinqs`)
  const t = TIMER_THANKS.exec(src)
  if (t) fail('2', `${path} shows a success state from a timer, not from an answer (${t[0].replace(/\s+/g, ' ').slice(0, 80)})`)
}

console.log(`${TAG} did ${sources.length} source file(s) read, ${forms} with a form judged`)
declareWork('forms-say-only-what-happened', {
  did: { 'source file read': sources.length, 'form file judged': forms },
  found: { 'clause failed': FAILURES.length },
})
if (FAILURES.length) {
  console.error(`${TAG} FAILED`)
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - no form sends a visitor to a mail app or thanks them from a timer`)
