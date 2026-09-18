/**
 * WHAT A SERVED DOCUMENT IS MADE OF: candidate lists, flight payload, the rest.
 *
 * ============================================================================
 * WHY THIS IS A MODULE AND NOT A BLOCK INSIDE THE REPORTER
 * ============================================================================
 *
 * Because it can be wrong in a way that LOOKS like an answer.
 *
 * On 19 September 2026 the flight-payload matcher was written with a `\b` that
 * a shell turned into a literal BACKSPACE byte before the file reached disk.
 * The regular expression was still VALID: it simply required a backspace
 * character after the word "script", so it matched no tag on earth. The
 * reporter would have printed `flight payload 0 B (0.0% of the document)` and a
 * reader would have taken that as a finding about this platform rather than
 * about the harness. `no-control-characters` caught the byte. Nothing in the
 * repository would have caught the ZERO.
 *
 * So the analysis lives here, where tests hand it documents whose answers are
 * known, and it REFUSES a shape it cannot have measured correctly rather than
 * reporting a confident nothing. That is the same rule the guards already
 * follow: a step that performed no work is not a step that passed.
 *
 * ============================================================================
 * THE THREE THINGS IT COUNTS, AND WHY THEY ARE COUNTED SEPARATELY
 * ============================================================================
 *
 *   CANDIDATE LISTS   the `srcset` of every image, and the `imagesrcset` of
 *                     every preload link. Grouped by the `sizes` that produced
 *                     them, so a cost lands on the media role that caused it
 *                     rather than on "images" in general.
 *
 *   FLIGHT PAYLOAD    the React tree serialised into `self.__next_f.push(...)`
 *                     script tags. Everything the markup says is said a SECOND
 *                     time here, in a form the browser parses as JavaScript, so
 *                     a byte removed from a card is removed twice and a reader
 *                     who does not know that under-counts every saving by half.
 *                     Measured on 19 September 2026 at 37.1% of the homepage
 *                     document and 86.9% of the login document.
 *
 *   THE DOCUMENT      raw and gzip. Both, always, on every row: these URLs
 *                     share a long prefix and compress about 56 to 1, so a raw
 *                     number quoted alone flatters and a gzip number quoted
 *                     alone hides what a throttled CPU has to parse.
 */
import { gzipSync } from 'node:zlib'

/**
 * Every srcset-bearing attribute: `srcset` on an `<img>` and `imagesrcset` on a
 * preload `<link>`. Next serves the latter lower-cased in the HTML even though
 * the React prop is `imageSrcSet`, so the match is case-insensitive rather than
 * trusting either spelling.
 */
const SRCSET = /\b(?:image)?srcset="([^"]*)"/gi
const SIZES_ATTR = /\b(?:image)?sizes="([^"]*)"/i

/** A `<script>` element and its contents, non-greedy so tags do not swallow. */
const SCRIPT = /<script\b[^>]*>([\s\S]*?)<\/script>/g

/** The marker Next's streaming runtime pushes every flight chunk through. */
const FLIGHT_MARKER = '__next_f'

export function candidateLists(html) {
  let srcsetBytes = 0
  let candidates = 0
  let firstCandidate = null
  const byRole = new Map()

  /*
   * The `sizes` that produced a given `srcset` is the one in the SAME tag, so
   * tags are walked rather than the two attribute lists being zipped together.
   * Zipping them silently mis-attributes every cost the moment one tag carries
   * a srcset and no sizes, which is exactly what a fixed-width image looks like
   * once somebody stops passing it a hint.
   */
  for (const tag of html.matchAll(/<(?:img|link)\b[^>]*>/g)) {
    const text = tag[0]
    SRCSET.lastIndex = 0
    const set = SRCSET.exec(text)
    if (!set) continue
    const value = set[1]
    const n = value.split(',').length
    if (firstCandidate === null) firstCandidate = value.split(',')[0].trim()
    const role = text.match(SIZES_ATTR)?.[1] ?? '(no sizes: fixed width, x descriptors)'
    srcsetBytes += value.length
    candidates += n
    const entry = byRole.get(role) ?? { images: 0, candidates: 0, bytes: 0 }
    entry.images += 1
    entry.candidates += n
    entry.bytes += value.length
    byRole.set(role, entry)
  }

  return { srcsetBytes, candidates, firstCandidate, byRole }
}

/**
 * ONE CANDIDATE, VERBATIM, AND ITS PARTS. A count and a total cannot say WHY a
 * candidate costs what it costs, and the two levers are different work: fewer
 * candidates is a framework question, shorter candidates is a `src` question.
 * The sample is the served bytes, never a reconstruction.
 */
export function candidateSample(firstCandidate) {
  if (!firstCandidate) return null
  const url = firstCandidate.split(' ')[0]
  const encodedSrc = /[?&]url=([^&]*)/.exec(url)?.[1] ?? ''
  return {
    candidate: firstCandidate,
    bytes: firstCandidate.length,
    encodedSrcBytes: encodedSrc.length,
    decodedSrc: decodeURIComponent(encodedSrc),
    srcSharePercent:
      firstCandidate.length === 0 ? 0 : (encodedSrc.length / firstCandidate.length) * 100,
  }
}

export function flightPayload(html) {
  let bytes = 0
  let scripts = 0
  for (const tag of html.matchAll(SCRIPT)) {
    if (!tag[1].includes(FLIGHT_MARKER)) continue
    scripts += 1
    bytes += tag[1].length
  }
  return { bytes, scripts }
}

/**
 * The whole analysis, with the refusal.
 *
 * `expectFlight` is true for anything served by this application, because every
 * App Router document carries at least one flight chunk. A zero there is the
 * harness failing, not the platform succeeding, and it is thrown rather than
 * returned so no caller can print it as a row.
 */
export function analyseDocument(html, { expectFlight = true } = {}) {
  const documentBytes = html.length
  const gzipBytes = gzipSync(Buffer.from(html)).length
  const { srcsetBytes, candidates, firstCandidate, byRole } = candidateLists(html)
  const flight = flightPayload(html)

  if (expectFlight && flight.scripts === 0) {
    throw new Error(
      'REFUSING: not one script tag in this document carries the flight marker. Every App Router ' +
        'document has at least one, so this is the matcher failing rather than a document with no ' +
        'payload, and reporting 0 B would be a finding about the harness printed as a finding ' +
        'about the platform.',
    )
  }

  return {
    documentBytes,
    gzipBytes,
    flightBytes: flight.bytes,
    flightScripts: flight.scripts,
    flightSharePercent: documentBytes === 0 ? 0 : (flight.bytes / documentBytes) * 100,
    sample: candidateSample(firstCandidate),
    srcsetBytes,
    candidates,
    sharePercent: documentBytes === 0 ? 0 : (srcsetBytes / documentBytes) * 100,
    byRole: [...byRole.entries()]
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([sizes, v]) => ({ sizes, ...v })),
  }
}
