/**
 * NO PHOTO CREDIT LINE ON EVENT PAGES AND CARDS (law 17 (d) as narrowed by Lawal, 19 November 2026, 11:36, through the
 * PM's 11:40: "Don't make my site unprofessional ... I don't go to any of these ticketing platforms or see any photo
 * credit ... You don't put no photo credit"). Event pages and cards print no photo credit line, as Ticketmaster,
 * Eventbrite and Humanitix print none; an organiser's own photograph given with permission is shown with no credit, and
 * its permission and scope stay recorded in the register, never printed. The one credit kept is a licence's (a Creative
 * Commons venue or city photograph), drawn from its own fields (image_credit, venueThumbCredit, the banner's credit).
 *
 * Found on production by WINDOW 5C's sweep (21 November 2026, 390): the event page printed 'Photo: EventLinqs Test
 * Organiser (acceptance tests)' under the cover, and the gallery, the walk-in page and the city guide's cards printed the
 * register's credit too: the narrowing had reached the captions' rule, not the code.
 *
 * An archival photograph still says it is from a past one (the project manager's ruling of 29 October 2026), through
 * archivalNote in src/lib/media/photo-credits.ts, which prints 'From a past festival' and never the name.
 *
 * The clauses, each read from the source (comments out) of every page and component a visitor sees (src/app and
 * src/components, not the admin, and not the walk-in entry editor, where the credit is TYPED and recorded):
 *   1. No call of creditLine (the 'Photo: <name>' printer, kept for the approved social designs, law 26).
 *   2. No raw print of a recorded organiser credit: {x.thumbCredit}, {x.cover_credit}, {x.photo_credit}, the organiser
 *      page's {heroPhoto.credit}, or a card's credit handed on as credit: x.thumbCredit.
 *
 * A root may be passed as the first argument, so the drill can run it against a tree holding the old pages.
 * Exits 1 naming each clause that fails.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[no-photo-credit-on-pages]'
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
/** Not a visitor's page: the admin, and the editor where an organiser's credit is typed and recorded, never printed. */
const NOT_SEEN = [/^src\/app\/admin\//, /^src\/components\/admin\//, /^src\/components\/features\/events\/walk-in-entry-editor\.tsx$/]
const sources = [...files(join(ROOT, 'src', 'app')), ...files(join(ROOT, 'src', 'components'))]
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .filter((f) => !NOT_SEEN.some((re) => re.test(rel(f))))

const CREDIT_PRINTER = /\bcreditLine\s*\(/
const RAW_PRINT = /\{\s*[\w?.!]*?\.(?:thumbCredit|cover_credit|photo_credit)\s*\}|\{\s*heroPhoto\??\.credit\s*\}|\bcredit\s*:\s*[\w?.]+\.thumbCredit\b/

for (const file of sources) {
  const path = rel(file)
  const src = code(readFileSync(file, 'utf8'))
  const a = CREDIT_PRINTER.exec(src)
  if (a) fail('1', `${path} prints a photo credit through creditLine; event pages and cards print none (law 17 (d)), an archival photograph uses archivalNote`)
  const b = RAW_PRINT.exec(src)
  if (b) fail('2', `${path} prints a recorded organiser photo credit (${b[0].replace(/\s+/g, ' ').slice(0, 60)}); event pages and cards print none (law 17 (d))`)
}

console.log(`${TAG} did ${sources.length} page and component file(s) read`)
declareWork('no-photo-credit-on-pages', {
  did: { 'page or component file read': sources.length },
  found: { 'clause failed': FAILURES.length },
})
if (FAILURES.length) {
  console.error(`${TAG} FAILED`)
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - no event page or card prints a photo credit line; licence credits come from their own fields`)
