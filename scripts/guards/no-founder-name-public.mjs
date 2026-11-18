/**
 * GUARD: NO FOUNDER'S NAME IN WHAT A CUSTOMER, AN ORGANISER OR THE PUBLIC READS (Lawal, 18 November 2026, 13:46: "I
 * don't put my name out there ... When I go to Ticketmaster, I don't see anybody's founder's name ... The last thing you
 * can ever say is EventLinqs team"; the PM's 13:50 item 2, law 4: one defect is a class).
 *
 * Found that day on the organiser's photo page ("Nothing is used until Lawal has looked at it", "Lawal looks at each one
 * before it is used") and on /organisers ("Set up my event with Lawal", "Lawal Adams, founder"). So this reads, as
 * TypeScript, every page and component a visitor or an organiser can reach (src/app outside admin and api routes, and
 * src/components) and the public copy modules named below, and judges only words that render: JSX text, string values
 * of the attributes a person reads, and string literals. Code comments are never read. It speaks as EventLinqs or the
 * EventLinqs team.
 *
 * Reviewed, printed on every run:
 *   - the legal pages, which must name the trader (the operator's legal name, as the law requires);
 *   - /about and /press, which name the founder in his own story; they wait for Lawal's word and are not changed unasked.
 * Letters Lawal signs himself (organiser emails under the communication law) are not pages and are not read here.
 *
 *   node scripts/guards/no-founder-name-public.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const TAG = '[no-founder-name-public]'
const ROOT = process.cwd()
const NAME = /\bLawal\b/
// Attributes whose string is code, never words a person reads.
const CODE_ATTRS = new Set(['className', 'class', 'href', 'src', 'id', 'name', 'type', 'key', 'style', 'd', 'viewBox', 'pattern', 'autoComplete', 'inputMode', 'rel', 'target', 'method', 'action', 'role', 'htmlFor'])
// Public copy kept outside the page tree: each module's string literals are words a visitor or an organiser reads.
const COPY_MODULES = ['src/lib/organisers/founding-offer.ts', 'src/lib/listings/photo-permission.ts']
const REVIEWED = new Map([
  ['src/app/legal/', 'the legal pages name the trader, as the law requires'],
  ['src/app/about/page.tsx', "the founder's own story; waits for Lawal's word (the PM's 13:50 item 2), not changed unasked"],
  ['src/app/press/page.tsx', "the press facts name the founder; waits for Lawal's word (the PM's 13:50 item 2), not changed unasked"],
])

function* walk(dir) {
  if (!existsSync(dir)) return
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) yield* walk(full)
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) yield full
  }
}

/** Every rendered word naming the founder in one source. Exported for the guard's own test. */
export function founderNamesIn(fileName, text, everyString = false) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found = []
  const add = (node, words) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    found.push({ line, words: words.replace(/\s+/g, ' ').trim().slice(0, 120) })
  }
  const isLit = (n) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (NAME.test(node.text)) add(node, node.text)
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf)
      if (!CODE_ATTRS.has(name) && !name.startsWith('data-')) {
        const init = node.initializer
        const lit = isLit(init) ? init : ts.isJsxExpression(init) && isLit(init.expression) ? init.expression : null
        if (lit && NAME.test(lit.text)) add(lit, lit.text)
      }
    } else if (isLit(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      // A string or template part in a page, component or copy module renders or is said, unless it is a code attribute
      // (judged above) or an import path.
      const parent = node.parent
      const inImport = parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent))
      const inCodeAttr = parent && ts.isJsxAttribute(parent)
      if ((everyString || !inImport) && !inCodeAttr && NAME.test(node.text)) add(node, node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

const reviewedFor = (rel) => [...REVIEWED.keys()].find((k) => (k.endsWith('/') ? rel.startsWith(k) : rel === k)) ?? null

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const files = [
    ...[...walk(join(ROOT, 'src', 'app'))].filter((f) => !/[\\/]src[\\/]app[\\/](admin|api)[\\/]/.test(f)),
    ...[...walk(join(ROOT, 'src', 'components'))].filter((f) => !/[\\/]src[\\/]components[\\/]admin[\\/]/.test(f)),
    ...COPY_MODULES.map((m) => join(ROOT, m)).filter(existsSync),
  ]
  const faults = []
  const reviewedHits = new Map()
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/')
    const hits = founderNamesIn(file, readFileSync(file, 'utf8'))
    const reviewed = reviewedFor(rel)
    if (reviewed) {
      if (hits.length) reviewedHits.set(reviewed, (reviewedHits.get(reviewed) ?? 0) + hits.length)
      continue
    }
    for (const h of hits) faults.push(`${rel}:${h.line}  "${h.words}"`)
  }
  if (faults.length) {
    console.error(`${TAG} FAIL: ${faults.length} founder's name(s) in words a customer, an organiser or the public reads, across ${files.length} files. Say EventLinqs or the EventLinqs team:`)
    for (const f of faults) console.error(`  ${f}`)
    process.exit(1)
  }
  for (const [k, why] of REVIEWED) console.log(`${TAG} reviewed: ${k} (${why}; ${reviewedHits.get(k) ?? 0} mention(s))`)
  console.log(`${TAG} PASS: no founder's name in the rendered words of ${files.length} public pages, components and copy modules`)
}
