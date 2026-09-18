/**
 * GUARD: chrome that only a visitor's own action can reveal stays out of the
 * platform-wide client shell.
 *
 * ============================================================================
 * WHY THIS EXISTS, with the measurement that produced it
 * ============================================================================
 *
 * The site header is imported by 22 route files directly, and the rest of the
 * platform reaches it through the page templates, so its client chunk is shared
 * across effectively every route. Anything the header imports statically is
 * therefore first-load JavaScript on /offline, on /careers, on
 * /unsubscribe/[token] and on every other page where nobody will ever press it.
 *
 * (An earlier version of this comment said the header was in the ROOT LAYOUT.
 * It is not, and the error was not free: it is exactly why
 * no-loadable-in-the-root-shell reported PASS on both owners below while each
 * was paying for the next/dynamic loadable runtime anyway. The gap is covered
 * by no-loadable-in-platform-chrome.mjs, which is rooted at the header and the
 * footer rather than at src/app/layout.)
 *
 * Three surfaces were in that position and every one of them is reachable only
 * after an action: the global search overlay, and the city dialog behind the
 * location picker. Measured with `node scripts/perf/first-load-budget.mjs`
 * against builds made under the pre-push gate's own environment, before and
 * after moving them behind `next/dynamic`:
 *
 *   /_not-found            160,751 -> 157,534 bytes gzip   -3,217
 *   /                      177,373 -> 172,567              -4,806
 *   /events/[slug]         205,185 -> 199,450              -5,735
 *   /events/browse/[city]  187,247 -> 181,319              -5,928
 *
 *   133 routes measured, 133 better, 0 worse, 509,320 bytes off the platform.
 *
 * That took /e/[code], /events/[slug] and /events/[slug]/holder back under the
 * Scope v5 10.3 budget of 200 KB, which they had been over since 15 September.
 *
 * ============================================================================
 * WHAT IT IS ACTUALLY DEFENDING, which is not the bytes
 * ============================================================================
 *
 * `scripts/guards/initial-bundle-budget.mjs` already refuses a route that grows
 * past its mark, so a straight reintroduction would be caught there. This guard
 * exists because of the shape that ISN'T caught: the marks are rewritten by a
 * human command whenever a growth is justified, and after any such rewrite a
 * static import that crept back in is simply the new normal. A one-line change
 * from
 *
 *     const Panel = useDeferredComponent(armed, () => import('./location-picker-panel'))
 * to
 *     import { LocationPickerPanel } from './location-picker-panel'
 *
 * looks like a tidy-up in review, reads as more direct, and silently puts every
 * byte back on every route. This guard names that edit and refuses it.
 *
 * ============================================================================
 * THE RULE
 * ============================================================================
 *
 *   1. Every registered deferred module EXISTS. A rename that is not carried
 *      into this registry would otherwise disarm the guard without a sound.
 *   2. Its OWNER reaches it through a deferred `import('<specifier>')`, in any
 *      wrapper or none: the bundler splits on the call form, not the wrapper.
 *   3. NOTHING under src/ imports it statically. Not the owner, not anywhere
 *      else: the one legitimate consumer is a dynamic import, so a static one
 *      anywhere is the defect, wherever it is written.
 *   4. The owner still exists and still names it, so a registry entry cannot
 *      outlive the split it describes.
 *
 * ============================================================================
 * WHAT THIS GUARD CANNOT SEE, stated rather than implied
 * ============================================================================
 *
 * It reads source text. It can prove that no static import reaches these
 * modules; it cannot prove the bundler put them in a chunk of their own, and it
 * cannot prove a visitor never pays for them. The measurement is
 * `node scripts/perf/first-load-budget.mjs` against a real build, and the
 * enforcement of the resulting numbers is initial-bundle-budget.mjs. This guard
 * holds the source shape those two depend on.
 *
 * It also says nothing about WHEN the chunk is fetched. Both owners arm on
 * pointer, touch or focus rather than on mount, which is what makes this a
 * reduction rather than a resequencing (close-out C8B.4), and that choice is
 * defended by the unit tests, which can run the component, rather than by a
 * regular expression here.
 *
 * Run standalone:  node scripts/guards/interaction-only-chrome-is-split.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[interaction-only-chrome-is-split]'
const SRC = join(ROOT, 'src')

/**
 * THE REGISTRY. One entry per surface that is in the platform-wide shell's reach
 * and must not be in its bundle.
 *
 * `module` is the file that must stay out. `specifier` is how the owner names it
 * (the import path as written, which is what a static import would repeat).
 * `owner` is the component that arms it. `why` is printed on every run, because
 * a registry nobody reads becomes a list nobody questions.
 */
const DEFERRED = [
  {
    module: 'src/components/layout/header-search-overlay.tsx',
    specifier: './header-search-overlay',
    owner: 'src/components/layout/header-search-trigger.tsx',
    why: 'the global search overlay renders nothing until the trigger, the "/" key or a focus lands on it',
  },
  {
    module: 'src/components/ui/location-picker-panel.tsx',
    specifier: './location-picker-panel',
    owner: 'src/components/ui/location-picker.tsx',
    why: 'the city dialog, its search matcher, its full city list and its geolocation are reachable only after "Change location"',
  },
]

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      out.push(...walk(path))
      continue
    }
    if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(path)
  }
  return out
}

/**
 * A static import of this specifier, in any of the forms TypeScript accepts.
 *
 * `import type { X } from '...'` is NOT a static import for this purpose: types
 * are erased and carry no bytes. The negative lookahead for `type` is therefore
 * deliberate rather than an oversight, and a `import { type X }` inline form is
 * left to the compiler, which also erases it.
 */
function staticImportPattern(specifier) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`import\\s+(?!type\\b)[^;]*?from\\s*['"]${escaped}(\\.tsx?)?['"]`)
}

/**
 * A DEFERRED import of this specifier: a CALL-form `import('...')`, wrapped in
 * anything or wrapped in nothing.
 *
 * THIS USED TO REQUIRE THE `dynamic(` WRAPPER, and that was wrong twice over.
 * It was wrong in principle, because the split is done by the bundler when it
 * sees a call-form `import()`; `next/dynamic` is one way to hold the result,
 * not the thing that causes the split. And it was wrong in fact: on
 * 19 September 2026 both owners moved off `next/dynamic` onto the shared
 * `useDeferredComponent` hook, because the loadable runtime costs 1306 bytes
 * gzip and one whole extra chunk in the header's shared chunk, and this guard
 * failed both of them for a change that made the thing it protects strictly
 * better. A gate that refuses an improvement is a gate somebody switches off.
 *
 * A static `import X from '...'` cannot match this: it has no parenthesis after
 * the keyword. Clause 3 is what refuses the static form, and it is unchanged.
 */
function deferredImportPattern(specifier) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`import\\s*\\(\\s*['"]${escaped}['"]`)
}

const problems = []
let filesScanned = 0
let entriesJudged = 0
let staticImportsChecked = 0

const files = walk(SRC).map(p => ({ path: p, where: relative(ROOT, p).replace(/\\/g, '/') }))
const sources = new Map()
for (const f of files) {
  sources.set(f.where, readFileSync(f.path, 'utf8'))
  filesScanned += 1
}

console.log(`${TAG} the registry, printed every run so it cannot rot into a list nobody questions:`)
for (const entry of DEFERRED) {
  console.log(`${TAG}   ${entry.module}`)
  console.log(`${TAG}     armed by ${entry.owner}`)
  console.log(`${TAG}     ${entry.why}`)
}

for (const entry of DEFERRED) {
  entriesJudged += 1

  // CLAUSE 1: the deferred module exists.
  if (!existsSync(join(ROOT, entry.module))) {
    problems.push(
      `${entry.module} is registered as deferred chrome and is not in the tree. ` +
        `A rename that is not carried into this registry disarms the guard silently: ` +
        `update the entry, or remove it if the surface is gone.`,
    )
    continue
  }

  // CLAUSE 4: the owner exists.
  const ownerSource = sources.get(entry.owner)
  if (ownerSource === undefined) {
    problems.push(
      `${entry.owner} is registered as the owner that arms ${entry.module} and is not in the tree. ` +
        `A registry entry cannot outlive the split it describes.`,
    )
    continue
  }

  // CLAUSE 2: the owner reaches it dynamically.
  if (!deferredImportPattern(entry.specifier).test(ownerSource)) {
    problems.push(
      `${entry.owner} no longer reaches ${entry.specifier} through a deferred ` +
        `import('${entry.specifier}'). Without that call the module is first-load ` +
        `JavaScript on every route that renders the site header, which is effectively all ` +
        `of them: 22 route files import SiteHeader directly and the rest reach it through ` +
        `the page templates.`,
    )
  }

  // CLAUSE 3: nothing under src/ imports it statically.
  const pattern = staticImportPattern(entry.specifier)
  const bare = entry.specifier.replace(/^\.\//, '')
  const aliasPattern = staticImportPattern(`@/${entry.module.replace(/^src\//, '').replace(/\.tsx?$/, '')}`)
  for (const [where, source] of sources) {
    staticImportsChecked += 1
    const relativeHit = pattern.test(source) && where.startsWith(dirname(entry.owner).replace(/\\/g, '/'))
    const aliasHit = aliasPattern.test(source)
    // A relative specifier only means this module when the importing file sits
    // in the same directory, so the directory test above is part of the match
    // rather than a filter applied after it.
    if (!relativeHit && !aliasHit) continue
    problems.push(
      `${where} imports ${bare} statically. ${entry.module} is registered as ` +
        `interaction-only chrome: it is reachable from the site header, so a static ` +
        `import puts every one of its bytes into first-load JavaScript on all 133 routes. ` +
        `Reach it with useDeferredComponent(armed, () => import('${entry.specifier}')) instead.`,
    )
  }
}

if (problems.length > 0) {
  console.error('')
  for (const p of problems) console.error(`${TAG} FAIL: ${p}`)
  console.error('')
  console.error(`${TAG} Measured when this split was made: 133 routes, 133 better, 0 worse,`)
  console.error(`${TAG} 509,320 bytes off the platform, and three public routes back under`)
  console.error(`${TAG} the Scope v5 10.3 budget. Putting a static import back gives that away.`)
}

declareWork(TAG.slice(1, -1), {
  did: {
    'source file scanned': filesScanned,
    'registered surface judged': entriesJudged,
    'file checked for a static import': staticImportsChecked,
  },
  found: { 'fault': problems.length },
  zeroIsFine: { fault: 'no static import reaches a deferred surface' },
})

if (problems.length > 0) process.exit(1)
console.log(`${TAG} PASS - ${entriesJudged} interaction-only surface(s) reached only by a dynamic import, across ${filesScanned} source files.`)
