/**
 * A DIALOG THAT COVERS THE PAGE IS RENDERED INTO THE BODY, NEVER WHERE IT SITS.
 *
 * WHY THIS EXISTS, and it is one real defect rather than a principle somebody
 * liked the sound of. On 11 September 2026 the D2 drive walked a real person
 * through a real waiting list on a real event page. The join dialog PAINTED
 * perfectly: centred, over the page, with its own button plainly visible. And
 * `document.elementFromPoint`, at the exact centre of that button, returned the
 * HERO SECTION. Playwright's click sat on it until it timed out, twice. A person
 * with a mouse would have had the same experience: a button that is obviously
 * there and does absolutely nothing.
 *
 * THE CAUSE IS STACKING, and no z-index can fix it. The dialog was rendered from
 * inside the ticket panel, and an ancestor of that panel carries a transform (a
 * reveal animation). A transformed ancestor becomes the containing block for
 * `position: fixed` AND creates a stacking context, so `z-50` on the dialog is
 * only z-50 INSIDE that context, and the whole context paints below content that
 * comes later. The dialog already carried z-50. It made no difference.
 *
 * WHAT MAKES IT WORTH A BUILD-FAILING GATE rather than a fix and a note: NOTHING
 * ELSE CAN SEE IT. It renders. It looks right in a screenshot. Every unit test
 * of the component passes, because the component is fine. axe passes, because
 * the markup is correct. The link crawler passes, because it is not a link. Only
 * a person pressing the button, or a machine measuring what is actually at that
 * pixel, can tell. That is the definition of a defect that comes back.
 *
 * THE RULE. A component that renders an element with `role="dialog"` (or an
 * `aria-modal`) positioned `fixed inset-0` must reach `createPortal`. Where the
 * portal goes is not this guard's business; that it leaves its ancestors is.
 *
 * Run standalone:  node scripts/guards/overlays-are-portalled.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[overlays-are-portalled]'
const SRC = join(ROOT, 'src')

/**
 * REVIEWED EXCEPTIONS, each with the reason it cannot have the defect.
 *
 * An entry here is a STATEMENT that the overlay has no transformed ancestor,
 * and the only way that is knowable is that it renders at the top of its own
 * route rather than inside a page's content. The list is printed on every run so
 * it cannot rot into something nobody looks at.
 */
const REVIEWED = new Map([
  [
    'src/components/layout/site-header-client.tsx',
    'the header is the outermost chrome on every route, so it has no transformed ancestor to be trapped inside',
  ],
  [
    'src/components/layout/header-search-overlay.tsx',
    'rendered by the header, which is the outermost chrome on every route',
  ],
  [
    'src/components/admin/admin-mobile-nav.tsx',
    'rendered by the admin shell, above the page content it covers',
  ],
])

const problems = []
let filesRead = 0
let overlaysJudged = 0

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      out.push(...walk(path))
      continue
    }
    if (name.endsWith('.tsx')) out.push(path)
  }
  return out
}

for (const path of walk(SRC)) {
  const source = readFileSync(path, 'utf8')
  filesRead += 1
  const where = relative(ROOT, path).replace(/\\/g, '/')

  const isDialog = /role=(["'{])dialog|aria-modal=/.test(source)
  if (!isDialog) continue
  // It only matters when the thing covers the page. A dialog laid out in flow
  // has no stacking problem to have.
  const coversThePage = /fixed\s+inset-0/.test(source)
  if (!coversThePage) continue

  overlaysJudged += 1
  /*
   * BOTH THE IMPORT AND THE CALL, and its own drill is why. The first version
   * asked only whether the file contained `createPortal(`, and the drill that
   * removed the import and left a local `const createPortal = node => node`
   * walked straight past it: a file can call something by that name and still
   * render exactly where it sits. The portal has to come from react-dom.
   */
  const importsThePortal = /import\s*\{[^}]*\bcreatePortal\b[^}]*\}\s*from\s*['"]react-dom['"]/.test(source)
  const callsThePortal = /createPortal\s*\(/.test(source)
  if (importsThePortal && callsThePortal) continue
  if (REVIEWED.has(where)) continue

  problems.push(
    `${where} renders a full-page dialog and never reaches react-dom's createPortal ` +
      `(imports it: ${importsThePortal}, calls it: ${callsThePortal}). ` +
      `If an ancestor of wherever it is used carries a transform, the dialog is trapped in that ancestor's ` +
      `stacking context and cannot be clicked, however correct it looks. Portal it to document.body, or add it ` +
      `to REVIEWED in this guard with the reason it can never have a transformed ancestor.`,
  )
}

for (const [path, why] of REVIEWED) {
  const full = join(ROOT, path)
  try {
    statSync(full)
  } catch {
    problems.push(`the reviewed exception ${path} is not on disk any more. Delete the entry: ${why}`)
  }
}

console.log(`${TAG} ${filesRead} component(s) read, ${overlaysJudged} full-page dialog(s) judged`)
for (const [path, why] of REVIEWED) console.log(`${TAG}   reviewed  ${path}: ${why}`)

if (problems.length > 0) {
  console.error(`${TAG} FAIL - ${problems.length} dialog(s) that can paint and not be clickable.`)
  for (const problem of problems) console.error(`${TAG}   ${problem}`)
  console.error('')
  console.error('  Nothing else can see this defect: it renders, it screenshots correctly, the component')
  console.error('  tests pass and axe passes. Only a finger on the button, or a machine asking what is')
  console.error('  actually at that pixel, can tell.')
  process.exit(1)
}

declareWork('overlays-are-portalled', {
  did: { 'component read': filesRead, 'full-page dialog judged': overlaysJudged },
  found: { 'dialog that could paint and not be clickable': problems.length },
  zeroIsFine: {
    'dialog that could paint and not be clickable':
      'zero is the goal state; the guard exists because this defect passes every other check the platform has',
  },
  exitOnZero: false,
})

console.log(`${TAG} PASS - every full-page dialog leaves its ancestors' stacking contexts.`)
process.exit(0)
