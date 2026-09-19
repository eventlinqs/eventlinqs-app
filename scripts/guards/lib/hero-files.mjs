/**
 * WHICH FILES ARE HEROES THAT PAINT TEXT ON A PHOTOGRAPH. Derived from the
 * source tree on every run, never listed.
 *
 * THE INCIDENT, 20 September 2026. `hero-text-over-a-photograph.mjs` opened
 * with the sentence "derived from the one thing they all must do rather than
 * listed, so a new one cannot be added without this guard noticing it", and
 * then listed five files by hand. Thirteen files on the platform carry a hero
 * that paints text on a photograph. Eight of them were not in the list, every
 * one of those eight carried its OWN hand-written navy gradient, and driving
 * them found 34 runs below their WCAG 2.2 SC 1.4.3 floor, including a gold
 * eyebrow at 1.01:1 with 100 per cent of its pixels failing. The guard had been
 * green the whole time and was right about everything it could see.
 *
 * A comment that claims a derivation does not perform one. This file performs
 * it.
 *
 * THE DERIVATION, and why these two marks and not a list of names.
 *
 *   1. The file carries the LOCKED HERO SCALE, `.hero-marketing` or
 *      `.hero-marketing-grow`. CLAUDE.md fixes one hero scale for the whole
 *      platform and `hero-scale-one-source.mjs` already refuses a hero that
 *      sizes itself any other way, so a hero cannot avoid this mark without
 *      failing a different registered guard first.
 *
 *   2. The file renders `<HeroMedia`, which is the only component permitted to
 *      paint a content photograph (media architecture law: no raw `<img>`, no
 *      `background-image` for content, no `next/image` in feature code), and
 *      `no-raw-img.mjs` and the media guards already hold that.
 *
 * So the derivation rests on two laws that are separately enforced rather than
 * on anybody remembering to append a path. A new hero has to carry both marks
 * to be a hero at all, and the moment it does, this function returns it and the
 * guard judges it.
 *
 * WHAT IT DELIBERATELY DOES NOT MATCH. `src/app/events/[slug]/loading.tsx`
 * carries the scale and no `HeroMedia`: it is the skeleton, it paints no
 * photograph and there is nothing for a wash to protect. It is excluded by the
 * second mark rather than by name.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** The locked hero scale token. One scale for the whole platform (CLAUDE.md). */
const HERO_SCALE = /\bhero-marketing(-grow)?\b/
/** The only component allowed to paint a content photograph. */
const HERO_PHOTOGRAPH = /<HeroMedia[\s/>]/

/**
 * Below this many derived heroes, something has been renamed and the guard
 * would be silently judging almost nothing. Loud failure beats quiet coverage:
 * the count on 20 September 2026 was 13.
 */
const IMPLAUSIBLY_FEW = 8

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (entry.endsWith('.tsx')) out.push(path.replace(/\\/g, '/'))
  }
  return out
}

/** Every `.tsx` under the tree, as repo-relative POSIX paths, sorted. */
export function allSourceFiles(root = 'src') {
  return walk(root).sort()
}

/**
 * ── THE RATCHET. Heroes NOT YET on the shared wash, each with the reason. ──
 *
 * It lives here rather than in the guard because the guard, the drive and the
 * suite all have to agree about it, and three copies of one list is the exact
 * mistake this file exists to end.
 *
 * This is not an exemption list and it cannot behave like one. It only ever
 * shrinks, and `hero-text-over-a-photograph.mjs` enforces all three rules:
 *
 *   - a hero off the shared wash that is NOT in here fails the build, so the
 *     debt can never grow;
 *   - an entry whose reason has STOPPED BEING TRUE fails the build, so the
 *     debt cannot rot into a list nobody rereads;
 *   - every entry is printed on every run, with its measurement, so it is read
 *     rather than trusted.
 *
 * `stillTrue` is what makes the second rule enforceable: an entry states the
 * condition that justifies it as code, and the guard re-evaluates it.
 */
export const NOT_YET_ON_THE_SHARED_WASH = [
  {
    file: 'src/components/templates/OrganisersLandingPage.tsx',
    lane: 'B (the organiser marketing surfaces)',
    measured: '13 runs below floor at 390/768/1440 on 20 September 2026: eyebrow 1.04:1, headline 1.49:1',
    record: 'REVIEW-QUEUE-C.md, BORDER line of 20 September 2026',
  },
  {
    file: 'src/app/launch/page.tsx',
    lane: 'B (the organiser marketing surfaces)',
    measured: '5 runs below floor on 20 September 2026: eyebrow 1.50:1 at 390, 100% of its pixels',
    record: 'REVIEW-QUEUE-C.md, BORDER line of 20 September 2026',
  },
  {
    file: 'src/app/forecast/page.tsx',
    lane: 'B (pricing configuration: the organiser payout forecast)',
    measured: 'PASSES at 390, 768 and 1440 on 20 September 2026. Consistency, not a live failure',
    record: 'REVIEW-QUEUE-C.md, BORDER line of 20 September 2026',
  },
  {
    /*
     * The shared empty state is the one entry here that is not a border. Its
     * photographic branch is UNREACHABLE: `onPhoto` is `!!coverImage` and not
     * one of its eleven call sites passes `coverImage`, so nothing on the
     * platform can render its text over a picture. Converting a branch no
     * caller can reach would be speculative work on dead code; leaving it
     * unguarded would mean that the day somebody passes a cover, a 0.42 navy
     * wash ships under a headline. So the condition IS the entry.
     */
    file: 'src/components/ui/CategoryHeroEmpty.tsx',
    lane: 'C (this lane)',
    measured: 'not measurable: the photographic branch has no caller',
    record: 'BUILD-LOG-C.md, 20 September 2026',
    stillTrue: () => {
      const withCover = []
      for (const f of allSourceFiles()) {
        if (f.endsWith('src/components/ui/CategoryHeroEmpty.tsx')) continue
        const src = readFileSync(f, 'utf8')
        for (const call of src.matchAll(/<CategoryHeroEmpty\b[^>]*>/g)) {
          if (/\bcoverImage\s*=/.test(call[0])) withCover.push(f)
        }
      }
      return withCover.length === 0
        ? { ok: true }
        : {
            ok: false,
            why: `${withCover.length} call site(s) now pass coverImage (${withCover.join(', ')}), so the photographic branch IS reachable and must move onto <HeroCaption>`,
          }
    },
  },
]

/**
 * Every hero on the platform that paints text on a photograph, as repo-relative
 * POSIX paths, sorted. Throws rather than returns a short list, because a
 * derivation that quietly finds three files is worse than no derivation.
 */
export function deriveHeroFiles(root = 'src') {
  const heroes = walk(root)
    .filter(f => {
      const src = readFileSync(f, 'utf8')
      return HERO_SCALE.test(src) && HERO_PHOTOGRAPH.test(src)
    })
    .sort()
  if (heroes.length < IMPLAUSIBLY_FEW) {
    throw new Error(
      `hero derivation found only ${heroes.length} hero file(s) under ${root} (expected at least ${IMPLAUSIBLY_FEW}). ` +
        'Either the locked hero scale token or <HeroMedia> has been renamed. Fix the derivation in ' +
        'scripts/guards/lib/hero-files.mjs rather than lowering this floor: a guard that judges three ' +
        'files while thirteen exist is how eight heroes shipped a 1.01:1 eyebrow.',
    )
  }
  return heroes
}
