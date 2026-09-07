/**
 * THE HOMEPAGE HERO NEVER RENDERS WITHOUT IMAGERY (close-out C17.2, 7 September 2026).
 *
 * On 6 September 2026 the owner opened the live homepage and saw a flat dark
 * rectangle: every event production held had ended, and the hero's empty
 * branch was a navy banner by design. The hero is the first thing an organiser,
 * a venue or an attendee sees, and a hero with no photograph reads as
 * unfinished. The rule is now: a featured event brings its own imagery; with
 * none, the hero wears one of the curated, licensed homepage rasters; and if
 * that raster fails to load the media component paints a designed treatment.
 *
 * WHAT THIS GUARD CHECKS, from the files rather than from memory:
 *   1. src/components/features/home/FeaturedHero.tsx has an empty branch
 *      (`featured.length === 0`) and that branch renders <HeroMedia> from
 *      pickCuratedHomepageHero(). A branch that renders a panel without a
 *      photograph is the defect this guard exists to stop.
 *   2. src/lib/images/homepage-hero-curated.ts reads its set from the
 *      attribution file beside the assets, so the images and their licence
 *      record are one source.
 *   3. public/images/hero/homepage-hero-attribution.json lists at least one
 *      hero, its note names who holds the licence (C17.3: the licence is
 *      recorded next to the asset), and every listed slug has BOTH a .jpg and
 *      an .avif under public/images/hero. A slug with no raster would make the
 *      curated hero a broken image on the day the picker landed on it.
 *   4. src/components/media/HeroMedia.tsx renders the raster through
 *      HeroRaster, the client component that owns the failure path.
 *
 * Drilled both ways in scripts/verify/guard-failure-drills.mjs: the empty branch
 * without HeroMedia, and an attribution entry whose raster does not exist.
 *
 * Run: node scripts/guards/homepage-hero-never-empty.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const HERO_TSX = 'src/components/features/home/FeaturedHero.tsx'
const CURATED_TS = 'src/lib/images/homepage-hero-curated.ts'
const HERO_MEDIA_TSX = 'src/components/media/HeroMedia.tsx'
const ATTRIBUTION = 'public/images/hero/homepage-hero-attribution.json'
const RASTER_DIR = 'public/images/hero'

const faults = []
const say = (m) => console.log(`[homepage-hero-never-empty] ${m}`)
const fail = (m) => {
  faults.push(m)
  console.error(`[homepage-hero-never-empty] FAIL: ${m}`)
}
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
let filesRead = 0

// 1. The empty branch renders the curated HeroMedia.
const hero = read(HERO_TSX)
filesRead += 1
const branchStart = hero.indexOf('if (featured.length === 0) {')
const branchEnd = hero.indexOf('const slides = await Promise.all', branchStart)
if (branchStart === -1 || branchEnd === -1) {
  fail(`${HERO_TSX}: the empty branch (featured.length === 0) or the slides line was not found; the guard cannot enumerate its input, so it refuses`)
} else {
  const branch = hero.slice(branchStart, branchEnd)
  if (!branch.includes('<HeroMedia')) {
    fail(`${HERO_TSX}: the empty branch renders no HeroMedia; a homepage with no featured event would paint a panel without a photograph`)
  }
  if (!branch.includes('pickCuratedHomepageHero(')) {
    fail(`${HERO_TSX}: the empty branch does not pick from the curated set (pickCuratedHomepageHero); a hardcoded image is not the fallback the close-out asked for`)
  }
  if (!/HERO_SCRIM_GRADIENT/.test(branch)) {
    fail(`${HERO_TSX}: the empty branch does not paint the shared hero scrim (HERO_SCRIM_GRADIENT); text would sit on an unprotected image`)
  }
}

// 2. One source: the curated module reads the attribution file.
const curated = read(CURATED_TS)
filesRead += 1
if (!curated.includes('homepage-hero-attribution.json')) {
  fail(`${CURATED_TS}: the curated set is not read from ${ATTRIBUTION}; the images and their licence record must be one source`)
}

// 3. The attribution file: a licence holder named, every slug backed by both rasters.
let attribution
try {
  attribution = JSON.parse(read(ATTRIBUTION))
  filesRead += 1
} catch (error) {
  fail(`${ATTRIBUTION}: cannot be read or parsed: ${error instanceof Error ? error.message : String(error)}`)
}
if (attribution) {
  const heroes = Array.isArray(attribution.heroes) ? attribution.heroes : []
  if (heroes.length === 0) fail(`${ATTRIBUTION}: lists no heroes; the curated set is empty`)
  if (!/licen[cs]e held by/i.test(String(attribution.note ?? ''))) {
    fail(`${ATTRIBUTION}: the note does not name who holds the licence ("Licence held by ..."); C17.3 records the licence beside the asset`)
  }
  for (const h of heroes) {
    const slug = String(h?.slug ?? '')
    if (!slug) {
      fail(`${ATTRIBUTION}: a hero entry has no slug`)
      continue
    }
    if (!String(h?.alt ?? '').trim()) fail(`${ATTRIBUTION}: ${slug} has no alt text`)
    for (const ext of ['jpg', 'avif']) {
      const file = `${RASTER_DIR}/${slug}.${ext}`
      if (!existsSync(join(ROOT, file))) fail(`${ATTRIBUTION}: ${slug} has no raster at ${file}; the curated hero would be a broken image on the day the picker lands on it`)
    }
  }
  say(`${heroes.length} curated hero(es) listed in ${ATTRIBUTION}`)
}

// 4. HeroMedia owns the failure path through HeroRaster.
const heroMedia = read(HERO_MEDIA_TSX)
filesRead += 1
if (!heroMedia.includes('<HeroRaster')) {
  fail(`${HERO_MEDIA_TSX}: the raster is not rendered through HeroRaster, so an image that fails to load would leave the browser's broken glyph in the hero`)
}

declareWork('homepage-hero-never-empty', {
  did: { 'file read': filesRead },
  found: { 'hero imagery fault': faults.length },
  zeroIsFine: true,
})

if (faults.length > 0) {
  console.error(`[homepage-hero-never-empty] ${faults.length} fault(s). The homepage hero must never render without imagery.`)
  process.exit(1)
}
say('PASS - the empty branch wears a curated, licensed raster; every curated slug has both rasters; the media component owns the failure path.')
