/**
 * THE CLAIM CONTRACT: a step that claims to do work must say how much it did.
 *
 * FOUNDER RULING, 25 August 2026:
 *
 *   "The warm step was named 'Warm ISR + the next/image optimiser' and warmed no
 *   images at all, for weeks. Your own replacement then reported 40 variants on
 *   four pages, which was a silent cap. Every CI step and every script that
 *   CLAIMS to do work must PRINT HOW MUCH IT DID, and a zero must read as a
 *   failure rather than a pass."
 *
 * THE TWO INCIDENTS, because they are different failures and both are covered.
 *
 * 1. THE STEP THAT DID NOTHING AND SAID NOTHING. A CI step called "Warm ISR +
 *    the next/image optimiser" requested each page's HTML and stopped. It never
 *    touched /_next/image at all. It printed a tidy list of 200s and went green
 *    for weeks, while the optimiser cold start it existed to remove was still
 *    landing inside every Lighthouse run.
 *
 * 2. THE STEP THAT DID SOME AND REPORTED IT AS ALL. Its replacement did warm
 *    images, then reported "40 variants" across four pages. Four pages sitting
 *    on exactly 40 is not data, it is a cap: the number was the limit, printed
 *    as though it were the finding.
 *
 * So a claim carries two things or it is not a claim: WHAT WAS DONE, as a
 * number, and whether that number was TRUNCATED.
 *
 * WHY ZERO EXITS 1. A run that performed no work is indistinguishable, from the
 * outside, from a run that performed all of it perfectly. Both print a green
 * tick. The only way to tell them apart is to make the first one loud, and the
 * only place that can be decided is inside the step itself, where the count is.
 *
 * WHAT COUNTS AS WORK, versus what counts as a FINDING. They are opposites and
 * conflating them would make every clean run a failure:
 *
 *   did    work performed. Pages fetched, files read, rows compared, URLs
 *          warmed. ZERO IS A FAILURE.
 *   found  what the work turned up. Violations, drifts, dead links.
 *          ZERO IS THE PASS, and is printed rather than implied.
 */

const NEWLINE = String.fromCharCode(10)

/**
 * English enough to read at 2am in a CI log.
 *
 * A label is usually a noun phrase ending in a participle: "source file read",
 * "hot-route rule applied", "surface rendering no live map". The HEAD NOUN
 * pluralises, not the participle, so the naive version printed "3 boot specifier
 * checkeds" on its first run.
 */
const PARTICIPLES = new RegExp(
  '^(read|written|sent|seen|built|found|run|kept|held|made|drawn|taken|given|met|left|told|dealt|' +
    'swept|spent|lost|put|hit|cut|set|shown|known|driven|proven|woven|chosen|[a-z]+ed|[a-z]+ing)$',
)

/**
 * Nouns that end in "ed" or "ing" and are therefore NOT participles here.
 *
 * Without this, "ambiguous embed" pluralised as "ambiguouses embed": "embed"
 * matched [a-z]+ed, so the head noun was taken to be the word before it.
 */
const NOUNS_THAT_LOOK_LIKE_PARTICIPLES = new Set([
  'embed', 'feed', 'seed', 'need', 'speed', 'breed', 'deed', 'weed', 'creed',
  'greed', 'bed', 'red', 'shed', 'thread', 'spread', 'bread', 'head', 'reed',
  'string', 'thing', 'ring', 'king', 'wing', 'spring', 'setting', 'listing',
  'warning', 'heading', 'reading', 'rating', 'booking', 'meeting', 'building',
])

function isParticiple(word) {
  if (NOUNS_THAT_LOOK_LIKE_PARTICIPLES.has(word)) return false
  return PARTICIPLES.test(word)
}

/**
 * Where the noun phrase stops being the noun. A preposition or a relative
 * pronoun starts a clause that QUALIFIES the head noun rather than being it:
 * "warm request that did not return 200" pluralises "request", and the naive
 * version pluralised "200".
 */
const BOUNDARY =
  /^(for|to|in|on|of|by|from|with|without|against|that|which|who|whom|whose|where|when)$/

function pluraliseWord(word) {
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`
  return `${word}s`
}

function plural(label, n) {
  if (n === 1) return label
  const words = label.split(' ')
  // The head noun is the word immediately before the FIRST participle or
  // boundary word, because everything from there on qualifies the noun rather
  // than being it: "report checked for indexability" pluralises "report", not
  // "indexability". With neither present the last word is the noun.
  let head = words.length - 1
  for (let i = 1; i < words.length; i += 1) {
    if (isParticiple(words[i]) || BOUNDARY.test(words[i])) {
      head = i - 1
      break
    }
  }
  words[head] = pluraliseWord(words[head])
  return words.join(' ')
}

/**
 * Print what a step did, and refuse to call "nothing" a pass.
 *
 * @param {string} label            the step, as it appears in the CI log
 * @param {object} work
 * @param {Record<string, number>} work.did      work performed. Any zero exits 1
 * @param {Record<string, number>} [work.found]  findings. Zero is the pass
 * @param {string[]} [work.truncated]            anything capped, named, so a cap
 *                                               can never be read as a finding
 * @param {Record<string, string>} [work.zeroIsFine]  a `did` key mapped to the
 *                                               reason zero is legitimate here.
 *                                               Printed every run, so it cannot
 *                                               become a quiet opt-out
 * @param {boolean} [work.exitOnZero=true]       set false ONLY where the caller
 *                                               exits itself afterwards
 * @returns {boolean} true when every `did` count is above zero
 */
export function declareWork(label, work) {
  const did = work.did ?? {}
  const found = work.found ?? {}
  const truncated = work.truncated ?? []
  const zeroIsFine = work.zeroIsFine ?? {}
  const exitOnZero = work.exitOnZero !== false

  const didParts = Object.entries(did).map(([what, n]) => `${n} ${plural(what, n)}`)
  console.log(`[${label}] did ${didParts.length > 0 ? didParts.join(', ') : 'NOTHING'}`)

  const foundParts = Object.entries(found).map(([what, n]) => `${n} ${plural(what, n)}`)
  if (foundParts.length > 0) console.log(`[${label}] found ${foundParts.join(', ')}`)

  for (const t of truncated) console.log(`[${label}] TRUNCATED: ${t}`)

  const emptyButAllowed = []
  const empty = []
  for (const [what, n] of Object.entries(did)) {
    if (n > 0) continue
    if (zeroIsFine[what]) emptyButAllowed.push(`${what}: ${zeroIsFine[what]}`)
    else empty.push(what)
  }
  for (const e of emptyButAllowed) console.log(`[${label}] zero is expected here, ${e}`)

  if (Object.keys(did).length === 0) {
    console.error(`[${label}] DECLARED NO WORK AT ALL. A step that counts nothing cannot pass.`)
    if (exitOnZero) process.exit(1)
    return false
  }

  if (empty.length > 0) {
    console.error(`${NEWLINE}[${label}] DID NOTHING: ${empty.join(', ')} came back zero.`)
    console.error(`[${label}] A step that performed no work is not a step that passed. This is the`)
    console.error(`[${label}] shape of the warm step that warmed no images for weeks and stayed green.`)
    console.error(`[${label}] If zero is genuinely correct here, say so with zeroIsFine and a reason.`)
    if (exitOnZero) process.exit(1)
    return false
  }

  return true
}
