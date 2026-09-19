/**
 * CLAUSE F OF `sitemap-resolves`: THE ARTIST BLOCK IS STILL GATED ON ITS FLAG.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE. `scripts/guards/sitemap-resolves.mjs` is
 * a top-level script: importing it RUNS it, and it can call `process.exit(1)`.
 * A test cannot import a decision out of a file like that, so the decision lives
 * here, where it is pure over a string and testable with no filesystem.
 *
 * ============================================================================
 * THE HOLE THIS FILLS, STATED PLAINLY BECAUSE IT IS EASY TO MISS
 * ============================================================================
 *
 * `/artists/[slug]` begins with
 * `if (!(await isFeatureEnabled('broadcast_artists'))) notFound()`. The flag is
 * TRUE on TEST and FALSE on production, so with it off EVERY artist URL is a
 * 404, and `src/app/sitemap.ts` therefore asks the same question before it
 * publishes any of them.
 *
 * `scripts/guards/lib/sitemap-catalogue-probe.mjs` has to ask that question too,
 * or it would report every artist as MISSING on production while the sitemap was
 * behaving perfectly. But the probe cannot EXECUTE `sitemap.ts` - that file
 * reaches `next/cache` and dies outside Next - so it MODELS the gate instead.
 *
 * A model and the thing modelled can drift, and this one drifts SILENTLY and in
 * the worst direction: delete the `if` from `sitemap.ts` and the probe goes on
 * applying the flag, both of its sides stay empty on production, the comparison
 * passes, and the deployed sitemap hands Googlebot a 404 for every artist row on
 * the platform. Nothing else in the tree would notice, because the shape is
 * exactly the one this repository has already shipped twice: a sitemap block
 * whose predicate was wrong and whose failure was silent.
 *
 * So the gate is held on the FILE, statically, by this function. The probe's
 * header points here and this header points back.
 *
 * ============================================================================
 * WHAT IT REQUIRES, AND WHAT IT DELIBERATELY DOES NOT
 * ============================================================================
 *
 * REQUIRED: every call to `readArtistCatalogue(` in `src/app/sitemap.ts` sits
 * inside a block opened by a POSITIVE `isFeatureEnabled('broadcast_artists')`
 * test. That is the shape the file uses and the only shape that is safe by
 * construction.
 *
 * NOT REQUIRED, and named so the silence is not mistaken for coverage: the
 * inverted early-return shape (`if (!(await isFeatureEnabled(...))) return`)
 * would be equally correct and this function would refuse it. That is a
 * deliberate narrowing rather than an oversight - one accepted shape is one
 * shape to read - and the refusal message says so, so whoever writes the
 * inverted form is told what to do rather than left guessing.
 *
 * NOT CHECKED HERE: whether the flag NAME is the one the route uses. That is a
 * different question and it is answered by the route and the sitemap naming the
 * same string constant, which `FLAG` below pins for both.
 */

/** The flag that gates every artist surface. */
export const ARTIST_FLAG = 'broadcast_artists'

/** The call this clause is protecting. */
export const ARTIST_READER = 'readArtistCatalogue('

/**
 * The range of the block opened by the first `{` at or after `from`.
 *
 * BRACE COUNTING IS SOUND ENOUGH HERE AND THE REASON IS WORTH ONE LINE. The
 * caller passes source with comments already stripped, and the only other place
 * braces hide is a template literal, where `${...}` is balanced by construction.
 * An unbalanced brace inside a string literal would fool this; there is none in
 * the file it reads, and a wrong answer here fails the build rather than passing
 * it, which is the safe direction to be wrong in.
 *
 * @param {string} src
 * @param {number} from
 * @returns {{ open: number, close: number } | null}
 */
export function blockRangeAfter(src, from) {
  const open = src.indexOf('{', from)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return { open, close: i }
    }
  }
  return null
}

/**
 * Every offset at which this source tests the artist flag positively.
 *
 * @param {string} src
 * @returns {number[]}
 */
export function flagTestOffsets(src) {
  const needle = "isFeatureEnabled('" + ARTIST_FLAG + "')"
  const out = []
  let at = src.indexOf(needle)
  while (at !== -1) {
    out.push(at)
    at = src.indexOf(needle, at + 1)
  }
  return out
}

/**
 * Is every artist read in this source gated on the flag?
 *
 * @param {string} src `src/app/sitemap.ts` with comments stripped.
 * @returns {{ gated: boolean, reason: string }}
 */
export function artistBlockIsFlagGated(src) {
  const readers = []
  let at = src.indexOf(ARTIST_READER)
  while (at !== -1) {
    readers.push(at)
    at = src.indexOf(ARTIST_READER, at + 1)
  }

  if (readers.length === 0) {
    return {
      gated: false,
      reason:
        'src/app/sitemap.ts no longer calls ' +
        ARTIST_READER +
        '). Every sitemap defect on record is a family that stopped publishing in silence, so a ' +
        'family disappearing is a failure rather than a smaller catalogue. If the artist family was ' +
        'deliberately withdrawn, delete this clause in the same commit and say why.',
    }
  }

  const gates = flagTestOffsets(src)
    .map(offset => blockRangeAfter(src, offset))
    .filter(range => range !== null)

  const ungated = readers.filter(r => !gates.some(g => r > g.open && r < g.close))
  if (ungated.length > 0) {
    return {
      gated: false,
      reason:
        'src/app/sitemap.ts calls ' +
        ARTIST_READER +
        ') outside any `if (await isFeatureEnabled(' +
        "'" +
        ARTIST_FLAG +
        "'" +
        '))` block. ' +
        'The route 404s whenever that flag is off and it is OFF ON PRODUCTION, so an ungated call ' +
        'publishes a 404 to Googlebot for every artist row on the platform. ' +
        'scripts/guards/lib/sitemap-catalogue-probe.mjs MODELS this gate and cannot see it disappear, ' +
        'which is why the file is read here. Put the call back inside the positive test; the inverted ' +
        'early-return shape is correct code but this clause does not accept it.',
    }
  }

  return {
    gated: true,
    reason:
      readers.length +
      ' artist read(s) in src/app/sitemap.ts, every one inside an isFeatureEnabled(' +
      "'" +
      ARTIST_FLAG +
      "'" +
      ') block',
  }
}
