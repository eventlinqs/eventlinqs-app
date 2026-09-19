/**
 * A HERO IS A PHOTOGRAPH OR IT IS NOTHING. NEVER A PLACEHOLDER. A build-failing
 * guard.
 *
 * ===========================================================================
 * THE DEFECT, FOUND BY THE LINK CRAWLER ON 19 September 2026
 * ===========================================================================
 *
 *     ❌ 1 DEAD LINK(S) on http://localhost:3200:
 *        500  /categories/technology  (linked from: /categories/music)
 *
 * and in the server log:
 *
 *     [HeroMedia] image must be a raster URL (got SVG):
 *     /images/event-fallback-hero.svg
 *
 * `getCategoryPhoto` answers "I have no photograph" by returning the branded
 * fallback OBJECT, whose `src` is an SVG. `/categories/[slug]/page.tsx` passed
 * that `src` straight into the hero, and the hero's chain is
 *
 *     spine ?? bundled ?? fallbackImage ?? HERO_RASTER_DEFAULT
 *
 * A non-empty string wins `??`, so the hero's own last resort never ran and
 * `HeroMedia` was handed an SVG. `??` cannot tell a photograph from a
 * placeholder; only a named test can.
 *
 * TWO CONSEQUENCES, AND THE QUIETER ONE IS THE EXPENSIVE ONE. In development
 * `HeroMedia` throws, so the route answers 500 and a public category tile is a
 * dead link (Law 5). In PRODUCTION the assertion is compiled out
 * (`process.env.NODE_ENV !== 'production'`), so the page renders with an SVG as
 * its hero: no 500, no error, and an LCP element that cannot be the LCP
 * (docs/MEDIA-ARCHITECTURE.md 5.1) on a page whose whole purpose is to be found
 * in Google.
 *
 * IT WAS NOT ONE PAGE'S BAD LUCK. The resolver returns the placeholder whenever
 * Pexels answers nothing, which includes a missing or invalid PEXELS_API_KEY -
 * and src/lib/env/manifest.mjs marks that key OPTIONAL on production. With no
 * key every category landing takes this path.
 *
 * ===========================================================================
 * THE FOUR CLAUSES
 * ===========================================================================
 *
 *   1  THE PREMISE. HeroMedia still refuses an SVG. This guard exists because
 *      that refusal is real and dev-only; if the refusal goes, the rules below
 *      are about a rule that no longer exists and must be re-read, not trusted.
 *   2  ONE DOOR. The placeholder path literal is declared in exactly one module
 *      and every other file tests for it through the exported helper.
 *      src/lib/images/event-media.ts held a private copy of the literal and was
 *      CORRECT; the next caller, one file away, was not.
 *   3  THE CHAIN ENDS ON A RASTER. Every Photographic*Hero template either
 *      renders HeroMedia conditionally (the city and community shape: no image,
 *      no HeroMedia) or ends its `??` chain on a bundled raster literal. A chain
 *      that ends on a caller-supplied value has no last resort at all.
 *   4  A HERO CALLER TESTS THE SENTINEL. In a file that imports
 *      `getCategoryPhoto`, a `heroImage=` or `fallbackImage=` prop whose
 *      expression reads `.src` must name `isBrandedFallbackPhoto` in the same
 *      expression. That is the defect itself, written as a rule.
 *
 * WHAT IT CANNOT SEE, said plainly: a placeholder that reaches a hero through a
 * module this guard does not know about. The runtime instrument for that is
 * scripts/link-integrity-crawl.mjs, which is what found this one.
 *
 * NO SHEBANG (a leading #! breaks Vite when a test imports this module) and no
 * git call (the build host has no git).
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[hero-never-placeholder]'
const ROOT = process.cwd()

const DOOR = 'src/lib/images/category-photo.ts'
const HERO_MEDIA = 'src/components/media/HeroMedia.tsx'
const PLACEHOLDER = 'event-fallback-hero.svg'

/** Regex LITERALS. A pattern built in a template literal is how a guard here shipped blind. */
const HERO_PROP = /\b(heroImage|fallbackImage)=\{([^}]*)\}/g
const RASTER_LAST_RESORT = /\?\?\s*'\/images\/[^']+\.(jpg|jpeg|png|avif|webp)'/
const CONDITIONAL_HERO = /\?\s*\(\s*<HeroMedia|&&\s*\(?\s*<HeroMedia|\{\s*\w+\s*\?\s*<HeroMedia/
const SENTINEL = /isBrandedFallbackPhoto/
const IMPORTS_RESOLVER = /getCategoryPhoto/

/**
 * The last operand of the chain that feeds HeroMedia, when it is a named
 * constant rather than an inline literal: the constant must be declared in the
 * same file as a bundled raster path.
 */
const CHAIN_TAIL = /const\s+\w+\s*=.*\?\?\s*([A-Z_][A-Z0-9_]*)\s*$/m
const RASTER_DECLARATION = /=\s*'\/images\/[^']+\.(jpg|jpeg|png|avif|webp)'/
function LAST_RESORT_IS_A_RASTER_CONSTANT(text) {
  const tail = CHAIN_TAIL.exec(text)
  if (!tail) return false
  for (const line of text.split(String.fromCharCode(10))) {
    if (!line.includes(`const ${tail[1]} `) && !line.includes(`const ${tail[1]}=`)) continue
    if (RASTER_DECLARATION.test(line)) return true
  }
  return false
}

const failures = []
const notes = []
let filesSwept = 0
let heroPropsJudged = 0
let heroTemplatesJudged = 0

function walk(dir, out) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const SCAN_ROOT = process.env.HERO_PLACEHOLDER_SCAN_ROOT ?? join(ROOT, 'src')
const scanBase = isAbsolute(SCAN_ROOT) ? SCAN_ROOT : join(ROOT, SCAN_ROOT)

/* ------------------------------------------------- clause 1: the premise */
const heroMediaPath = join(ROOT, HERO_MEDIA)
if (!existsSync(heroMediaPath)) {
  failures.push(`${HERO_MEDIA} is missing, so the premise behind these rules cannot be checked.`)
} else {
  const src = readFileSync(heroMediaPath, 'utf8')
  // Matched on the refusal's own sentence rather than on its regex, because the
  // regex is written with escapes a guard reading source-as-text reads oddly.
  if (!src.includes('assertRaster') || !src.includes('must be a raster URL')) {
    failures.push(
      `${HERO_MEDIA} no longer refuses an SVG. These rules exist because it does. ` +
        `Re-read them against whatever replaced it rather than leaving them judging a premise that moved.`,
    )
  } else {
    notes.push('HeroMedia still refuses an SVG (assertRaster), which is what these rules protect')
  }
}

/* ------------------------------------------ clauses 2 and 4: the sweep */
for (const abs of walk(scanBase, [])) {
  const rel = relative(ROOT, abs).split('\\').join('/')
  filesSwept += 1
  const text = readFileSync(abs, 'utf8')

  // Clause 2. The door declares the placeholder; nobody else names it.
  if (text.includes(PLACEHOLDER) && !rel.endsWith('category-photo.ts')) {
    failures.push(
      `${rel} names the placeholder path "${PLACEHOLDER}" itself. It is declared in ${DOOR} ` +
        `and tested with the exported isBrandedFallbackPhoto. A second copy of the literal is how ` +
        `the third caller gets it wrong.`,
    )
  }

  // Clause 4. A hero prop fed from the photo resolver tests the sentinel.
  if (IMPORTS_RESOLVER.test(text)) {
    const scan = new RegExp(HERO_PROP.source, 'g')
    let m
    while ((m = scan.exec(text)) !== null) {
      heroPropsJudged += 1
      const expression = m[2]
      if (!expression.includes('.src')) continue
      if (SENTINEL.test(expression)) continue
      failures.push(
        `${rel}:${text.slice(0, m.index).split(String.fromCharCode(10)).length} passes ` +
          `${m[1]}={${expression.trim()}} in a file that resolves a category photo, without asking ` +
          `isBrandedFallbackPhoto. When the resolver has no photograph that .src is the branded SVG, ` +
          `HeroMedia refuses it, and the route answers 500 in development and serves a hero that ` +
          `cannot be the LCP in production.`,
      )
    }
  }
}

/* --------------------------------- clause 3: the chain ends on a raster */
const templates = join(scanBase, 'components/templates')
if (existsSync(templates)) {
  for (const entry of readdirSync(templates)) {
    if (!/^Photographic.*Hero\.tsx$/.test(entry)) continue
    heroTemplatesJudged += 1
    const rel = `src/components/templates/${entry}`
    const text = readFileSync(join(templates, entry), 'utf8')
    if (!text.includes('<HeroMedia')) continue
    if (CONDITIONAL_HERO.test(text)) continue
    if (RASTER_LAST_RESORT.test(text)) continue
    /*
     * A NAMED CONSTANT IS A BETTER SPELLING OF THE SAME THING, and the first
     * version of this clause failed the one template that had been fixed
     * correctly: its chain ends `?? HERO_RASTER_DEFAULT`, which the file
     * declares as a bundled raster three lines above. A guard that refuses the
     * better spelling teaches people to write the worse one.
     */
    if (LAST_RESORT_IS_A_RASTER_CONSTANT(text)) continue
    failures.push(
      `${rel} renders HeroMedia unconditionally and its image chain does not end on a bundled ` +
        `raster literal. Either render HeroMedia only when there is an image (the city and ` +
        `community shape) or end the chain with \`?? '/images/....jpg'\`, so a caller-supplied ` +
        `value can never be the last resort.`,
    )
  }
}

if (filesSwept === 0) {
  failures.push('the sweep matched no files at all, which is a broken sweep rather than a clean tree.')
}

/*
 * THE MATCHERS PROVE THEMSELVES, on every run, for the reason recorded in
 * scripts/guards/consent-dates-are-zoned.mjs: a guard in this tree shipped with
 * a pattern that compiled to nonsense and reported PASS over the thing it
 * banned, and only the red half of a drill found it.
 */
const PROBES = [
  { pattern: /\b(heroImage|fallbackImage)=\{([^}]*)\}/, sample: 'heroImage={photo.src}', shouldMatch: true },
  { pattern: /\b(heroImage|fallbackImage)=\{([^}]*)\}/, sample: 'thumbImage={photo.src}', shouldMatch: false },
  { pattern: RASTER_LAST_RESORT, sample: "const s = a ?? '/images/hero/x.jpg'", shouldMatch: true },
  { pattern: RASTER_LAST_RESORT, sample: 'const s = a ?? fallbackImage', shouldMatch: false },
  { pattern: CONDITIONAL_HERO, sample: '{imageSrc ? <HeroMedia image={imageSrc} /> : null}', shouldMatch: true },
  { pattern: CONDITIONAL_HERO, sample: '<HeroMedia image={src} />', shouldMatch: false },
  { pattern: SENTINEL, sample: 'isBrandedFallbackPhoto(photo) ? null : photo.src', shouldMatch: true },
  { pattern: SENTINEL, sample: 'photo.src', shouldMatch: false },
]
for (const probe of PROBES) {
  if (probe.pattern.test(probe.sample) !== probe.shouldMatch) {
    failures.push(
      `REFUSING: the matcher ${probe.pattern} no longer ${probe.shouldMatch ? 'matches' : 'refuses'} ` +
        `${JSON.stringify(probe.sample)}. This guard cannot be trusted until that is true again.`,
    )
  }
}

for (const n of notes) console.log(`${TAG} ${n}`)
console.log(
  `${TAG} ${filesSwept} file(s) swept, ${heroPropsJudged} hero image prop(s) judged in files that ` +
    `resolve a category photo, ${heroTemplatesJudged} Photographic*Hero template(s) judged`,
)

declareWork('a-hero-is-never-a-placeholder', {
  did: {
    'source file swept': filesSwept,
    'hero image prop judged': heroPropsJudged,
    'photographic hero template judged': heroTemplatesJudged,
    'matcher self-probe run': PROBES.length,
  },
  found: { 'placeholder reaching a hero': failures.length },
  zeroIsFine: {
    'placeholder reaching a hero':
      'one was fixed on 19 September 2026 (/categories/technology answered 500) and the goal state is none',
  },
  exitOnZero: false,
})

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} ${failures.length} problem(s).`)
  process.exit(1)
}

console.log(`${TAG} OK`)
