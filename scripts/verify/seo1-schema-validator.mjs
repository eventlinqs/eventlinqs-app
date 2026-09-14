/**
 * SEO1 ACCEPTANCE 5, THE SCHEMA.ORG HALF.
 *
 *   "The rendered markup for one real published event is validated against
 *    Google's own Rich Results Test and the Schema.org validator by hand ...
 *    If either reports an error or a warning, it is fixed before the item
 *    closes."
 *
 * validator.schema.org accepts a POST and needs no account, so this half runs
 * unattended and can be repeated on demand. The Google half needs a sign-in and
 * lives in scripts/verify/seo1-rich-results-test.mjs, which says so in its own
 * header.
 *
 * WHAT IS SENT. The WHOLE rendered response of a real published event page on
 * lane C's own port, not a hand-built snippet, so the validator sees exactly
 * what a crawler would: every block, in the order the server emitted them,
 * inside the real document.
 *
 * Run: node scripts/verify/seo1-schema-validator.mjs [url]
 *      node scripts/verify/seo1-schema-validator.mjs https://www.eventlinqs.com.au/events/some-slug
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.SEO1_OUT ?? 'C:/dev/EVIDENCE/SEO1'
mkdirSync(OUT, { recursive: true })
const ENDPOINT = 'https://validator.schema.org/validate'
const TAG = '[schema-validator]'

/** The page under test: a URL argument, else the response already on disk. */
async function html() {
  const url = process.argv[2]
  if (url) {
    const res = await fetch(url, { cache: 'no-store' })
    if (res.status !== 200) throw new Error(`${url} answered ${res.status}`)
    const body = await res.text()
    writeFileSync(join(OUT, 'rendered-event-page.html'), body)
    console.log(`${TAG} fetched ${url}, ${body.length} bytes`)
    return body
  }
  const saved = join(OUT, 'rendered-event-page.html')
  if (!existsSync(saved)) throw new Error(`no url given and ${saved} does not exist`)
  console.log(`${TAG} using the saved response at ${saved}`)
  return readFileSync(saved, 'utf8')
}

const body = await html()
const blocks = (body.match(/type="application\/ld\+json"/g) ?? []).length
console.log(`${TAG} the page carries ${blocks} JSON-LD block(s)`)
if (blocks === 0) {
  console.error(`${TAG} FAIL: nothing to validate.`)
  process.exit(1)
}

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ html: body }).toString(),
})
if (res.status !== 200) {
  console.error(`${TAG} FAIL: the validator answered ${res.status}`)
  process.exit(1)
}

// The response is prefixed with an anti-JSON-hijacking guard, )]}' on its own.
const raw = (await res.text()).replace(/^\)\]\}'\s*/, '')
const report = JSON.parse(raw)
writeFileSync(join(OUT, 'schemaorg-validate.json'), JSON.stringify(report, null, 2))

let errors = 0
let warnings = 0
const types = new Set()
const walk = node => {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach(walk)
    return
  }
  if (Array.isArray(node.errors)) errors += node.errors.length
  if (Array.isArray(node.warnings)) warnings += node.warnings.length
  if (node.typeGroup) types.add(node.typeGroup)
  for (const key of Object.keys(node)) walk(node[key])
}
walk(report)

console.log(`${TAG} types recognised: ${[...types].join(', ')}`)
console.log(`${TAG} errors: ${errors}`)
console.log(`${TAG} warnings: ${warnings}`)

if (types.size === 0) {
  console.error(`${TAG} FAIL: the validator recognised no type at all, so it judged nothing.`)
  process.exit(1)
}
if (errors > 0 || warnings > 0) {
  console.error(`${TAG} FAIL: ${errors} error(s) and ${warnings} warning(s). SEO1 acceptance 5 requires neither.`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${types.size} type(s) recognised, zero errors, zero warnings.`)
