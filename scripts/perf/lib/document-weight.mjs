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
 *
 *   A CATALOGUE       rows of a reference list serialised into the flight
 *                     payload as the props of a client component. Counted
 *                     separately from the payload that holds them because they
 *                     are the one part of it that is not the page: a city list
 *                     is the same on every route, so a copy of it in every
 *                     document is a cost with no reader. Added 19 September
 *                     2026 (close-out C8B.3) after the origin cost table found
 *                     the picker's 20-city catalogue serialised twice into a
 *                     login page.
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
 * A REFERENCE CATALOGUE SERIALISED INTO THE DOCUMENT, AND HOW MANY TIMES.
 *
 * ============================================================================
 * WHAT IT MATCHES, AND WHY IT IS ANCHORED ON A FIELD NAME
 * ============================================================================
 *
 * Inside the flight payload a client component's props are JSON inside a
 * JavaScript string literal, so every quote arrives escaped:
 *
 *     ...,{\"city\":\"Geelong\",\"slug\":\"geelong\",...,\"isLaunchCity\":true},...
 *
 * `marker` is a field name that only that catalogue's rows carry, and the row
 * is taken as the flat object around it: back to the nearest `{`, forward to
 * the first `}`. Anchoring on a FIELD rather than on the field ORDER is
 * deliberate. Serialisation order follows the object literal that produced it,
 * so a matcher written against the order goes quietly blind the day somebody
 * reorders two lines in a mapper, and a quiet zero from a reporter is the
 * failure this module exists to refuse.
 *
 * `arrayKeys` picks up the flat `["melbourne","sydney",...]` forms of the same
 * catalogue, which carry no per-row marker at all.
 *
 * ============================================================================
 * THE REFUSAL, AND THE ONE ZERO THAT IS NOT A FAILURE
 * ============================================================================
 *
 * Unlike the flight payload, ZERO IS THE GOAL STATE here: a document with no
 * catalogue in it is the thing the work is for, so this cannot refuse on zero.
 * What it does refuse is INCOHERENCE: rows matched whose slug cannot be read.
 * That means the marker is matching something which is not a row of this
 * catalogue, and a byte count attributed to the wrong thing is worse than no
 * byte count at all.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE
 * ============================================================================
 *
 * A row whose string value contains a `}`. No city on earth has one, and the
 * alternative is a JSON parser pointed at a partially escaped fragment, which
 * would be a larger thing to get wrong. Stated rather than left to be found.
 */
/**
 * @param {string} html the served or built document
 * @param {{ marker?: string, arrayKeys?: string[] }} [options]
 */
export function catalogueWeight(html, { marker, arrayKeys = [] } = {}) {
  if (typeof marker !== 'string' || marker === '') {
    throw new Error('REFUSING: catalogueWeight needs a marker field name to anchor a row on.')
  }
  const markerAt = new RegExp(`\\\\?"${marker}\\\\?":`, 'g')
  const slugOf = /\\?"slug\\?":\\?"([^"\\]+)/

  let rowBytes = 0
  let rows = 0
  const bySlug = new Map()
  for (const hit of html.matchAll(markerAt)) {
    // The row is the flat object AROUND the marker: back to the nearest `{`,
    // forward to the first `}`. Never "the marker and everything up to the next
    // brace", which would only work while the marker happened to be the last
    // field and would go silently blind the day two lines in a mapper swap.
    const open = html.lastIndexOf('{', hit.index)
    const close = html.indexOf('}', hit.index)
    if (open === -1 || close === -1) continue
    const text = html.slice(open, close + 1)
    // A second `{` inside means the scan ran past the row's own opening brace,
    // so this is not one flat row and counting it would inflate the answer.
    if (text.indexOf('{', 1) !== -1) continue
    rowBytes += text.length
    rows += 1
    const slug = slugOf.exec(text)?.[1]
    if (slug) bySlug.set(slug, (bySlug.get(slug) ?? 0) + 1)
  }

  if (rows > 0 && bySlug.size === 0) {
    throw new Error(
      `REFUSING: ${rows} object(s) carry the field "${marker}" and not one of them has a readable ` +
        'slug, so the marker is matching something that is not a row of this catalogue. A byte ' +
        'count attributed to the wrong thing reads as a finding and is not one.',
    )
  }

  let arrayBytes = 0
  let arrays = 0
  for (const key of arrayKeys) {
    const pattern = new RegExp(`\\\\?"${key}\\\\?":\\[[^\\]]*\\]`, 'g')
    for (const hit of html.matchAll(pattern)) {
      arrayBytes += hit[0].length
      arrays += 1
    }
  }

  const bytes = rowBytes + arrayBytes
  const distinct = bySlug.size
  return {
    bytes,
    rowBytes,
    arrayBytes,
    rows,
    arrays,
    distinct,
    /** How many whole copies of the catalogue the document carries. */
    copies: distinct === 0 ? 0 : Math.max(...bySlug.values()),
    sharePercent: html.length === 0 ? 0 : (bytes / html.length) * 100,
    bySlug: [...bySlug.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  }
}

/**
 * The whole analysis, with the refusal.
 *
 * `expectFlight` is true for anything served by this application, because every
 * App Router document carries at least one flight chunk. A zero there is the
 * harness failing, not the platform succeeding, and it is thrown rather than
 * returned so no caller can print it as a row.
 */
/**
 * WHAT THE `class` ATTRIBUTE COSTS, and how much of it is one value said again.
 *
 * Added 19 September 2026 (close-out C8B.3) after the origin cost table was
 * read a second time. The srcset rows explained 29% of the homepage document
 * and the flight row explained 36.6%, and NOTHING explained the rest. It was
 * class attributes: 195,365 B in the markup and 156,478 B more inside the
 * flight payload, 34.9% of the document between them, across 131 distinct
 * values of which 98 repeated.
 *
 * BOTH FORMS ARE COUNTED, and counting only one would halve every number. A
 * class list appears as `class="..."` in the markup and AGAIN as
 * `\"className\":\"...\"` inside the RSC payload, because React serialises the
 * tree a second time for hydration. That is why collapsing a card's class list
 * into a composite utility saves twice what a reader expects.
 *
 * `repeatBytes` IS THE ACTIONABLE NUMBER, not `bytes`. A document has to say
 * each distinct class list at least once; what is removable is every copy after
 * the first, which is what a composite utility collapses.
 */
export function classListWeight(html) {
  const counts = new Map()
  for (const re of [CLASS_ATTR_RE, CLASS_FLIGHT_RE]) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(html)) !== null) {
      const value = match[1]
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  let bytes = 0
  let repeatBytes = 0
  let occurrences = 0
  const byValue = []
  for (const [value, count] of counts) {
    bytes += value.length * count
    occurrences += count
    if (count > 1) repeatBytes += value.length * (count - 1)
    byValue.push({ value, count, bytes: value.length * count, repeatBytes: value.length * (count - 1) })
  }
  byValue.sort((a, b) => b.repeatBytes - a.repeatBytes)
  return {
    bytes,
    repeatBytes,
    occurrences,
    distinct: counts.size,
    sharePercent: html.length === 0 ? 0 : (bytes / html.length) * 100,
    byValue,
  }
}

/** `class="..."` in the markup. */
const CLASS_ATTR_RE = /class="([^"]+)"/g
/**
 * `\"className\":\"...\"` inside a flight chunk. The framework escapes each
 * quote with ONE backslash because the payload is a JavaScript string literal.
 * Built from a character code rather than written out, because the escaping
 * survives neither a shell heredoc nor a careless edit, and a matcher that
 * quietly matches nothing is the failure this module exists to refuse.
 */
const BACKSLASH = String.fromCharCode(92)
const CLASS_FLIGHT_RE = new RegExp(
  `className${BACKSLASH}${BACKSLASH}":${BACKSLASH}${BACKSLASH}"([^${BACKSLASH}${BACKSLASH}]+)${BACKSLASH}${BACKSLASH}"`,
  'g',
)

/**
 * WHAT THE `style` ATTRIBUTE COSTS, which is the half the class-list row
 * cannot see.
 *
 * Added 19 September 2026 (close-out C8B.3, the browse card collapse). The
 * class-list row found that /events was 26.6% class attributes and led
 * straight to a collapse; while doing it, six of `EventCard`'s elements turned
 * out to set `style={{ ... }}` with design tokens - the body's padding, the
 * meta row's gap, the footer's gap and padding, the price's size and weight,
 * the title's transition - and NOTHING in this reporter could see them. They
 * were 16,203 B of one /events document, 12,121 B of it a value said again.
 *
 * AN INLINE STYLE IS PAID THE SAME WAY A CLASS LIST IS, twice: once in the
 * markup as `style="..."` and again in the RSC payload as a serialised object,
 * `\"style\":{\"paddingTop\":\"...\"}`. The object form is LONGER than the
 * markup form, so a reader who counts only the markup under-reports it.
 *
 * IT IS NOT ALL REMOVABLE, and saying so is the point of reporting
 * `repeatBytes` separately. Next's own `fill` images set six positioning
 * declarations inline on every image and that is the framework's, not ours.
 * What is actionable is a value a COMPONENT writes per instance, which is
 * exactly what `repeatBytes` ranks.
 */
export function styleAttributeWeight(html) {
  const counts = new Map()
  for (const re of [STYLE_ATTR_RE, STYLE_FLIGHT_RE]) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(html)) !== null) {
      const value = match[1]
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  let bytes = 0
  let repeatBytes = 0
  let occurrences = 0
  const byValue = []
  for (const [value, count] of counts) {
    bytes += value.length * count
    occurrences += count
    if (count > 1) repeatBytes += value.length * (count - 1)
    byValue.push({ value, count, bytes: value.length * count, repeatBytes: value.length * (count - 1) })
  }
  byValue.sort((a, b) => b.repeatBytes - a.repeatBytes)
  return {
    bytes,
    repeatBytes,
    occurrences,
    distinct: counts.size,
    sharePercent: html.length === 0 ? 0 : (bytes / html.length) * 100,
    byValue,
  }
}

/** `style="..."` in the markup. */
const STYLE_ATTR_RE = /style="([^"]+)"/g
/**
 * `\"style\":{...}` inside a flight chunk. The object is matched to its
 * closing brace WITHOUT nesting, which is right for a style object (its values
 * are strings and numbers, never objects) and would be wrong for anything
 * else. Written from a character code for the same reason the className
 * matcher is: the escaping does not survive a shell heredoc, and a matcher
 * that quietly matches nothing is the failure this module refuses.
 */
const STYLE_FLIGHT_RE = new RegExp(
  `style${BACKSLASH}${BACKSLASH}":(\\{[^{}]+\\})`,
  'g',
)

/**
 * EVERY BYTE OF THE DOCUMENT, ACCOUNTED FOR OR NAMED AS UNEXPLAINED.
 *
 * ============================================================================
 * WHY A REPORTER NEEDS THIS AND NOT JUST MORE ROWS
 * ============================================================================
 *
 * This module grew a row at a time - candidate lists, then the flight payload,
 * then class attributes, then inline styles - and each row was added because
 * somebody noticed a number that did not add up. The class-attribute row
 * exists ONLY because a reader looked at a 1,007,295-byte homepage, saw srcset
 * explain 29% and the flight explain 36.6%, and asked what the other third
 * was. That question found 34.9% of the document in one attribute.
 *
 * Nothing in the reporter asked it. A reader did, once, and the next third
 * would have waited for another reader to be curious on a different day.
 *
 * So the composition is computed instead: the document is PARTITIONED into the
 * flight payload and everything else, each named category is measured within
 * its part, and whatever is left over is reported as UNEXPLAINED with its
 * share. A category that stops matching shows up as the unexplained share
 * growing, which is the same signal, reported rather than noticed.
 *
 * ============================================================================
 * THE PARTITION IS EXACT AND THE CATEGORIES ARE NOT
 * ============================================================================
 *
 * markup + flight = the document, exactly, because the split is made by
 * removing the contents of the flight script tags and keeping the rest. The
 * CATEGORIES inside each part are subsets that may not be disjoint from each
 * other in principle, so `unexplained` is computed as a remainder and is
 * allowed to be large - on a document that is mostly prose it will be. It is
 * never allowed to be NEGATIVE: that would mean a category counted bytes the
 * part does not contain, and the analysis refuses rather than printing it.
 */
export function composition(html) {
  /* The flight half: the contents of every script tag carrying the marker. */
  const flight = flightPayload(html)

  /* The markup half: the same document with those contents removed, which is
   * what makes the two sum to the whole rather than to an estimate. */
  let markupOnly = html
  for (const tag of html.matchAll(new RegExp(SCRIPT.source, 'g'))) {
    if (!tag[1].includes(FLIGHT_MARKER)) continue
    markupOnly = markupOnly.replace(tag[1], '')
  }

  const inMarkup = (re) => {
    let n = 0
    for (const m of markupOnly.matchAll(re)) n += m[1].length
    return n
  }
  const srcsetMarkup = inMarkup(new RegExp(SRCSET.source, 'gi'))
  const classMarkup = inMarkup(new RegExp(CLASS_ATTR_RE.source, 'g'))
  const styleMarkup = inMarkup(new RegExp(STYLE_ATTR_RE.source, 'g'))

  const markupBytes = markupOnly.length
  const named = srcsetMarkup + classMarkup + styleMarkup
  const unexplainedMarkup = markupBytes - named

  return {
    documentBytes: html.length,
    markupBytes,
    flightBytes: flight.bytes,
    /* The two halves must reconstruct the document. If they ever do not, the
     * split is wrong and every share below it is wrong with it. */
    partitionExact: markupBytes + flight.bytes === html.length,
    srcsetMarkup,
    classMarkup,
    styleMarkup,
    unexplainedMarkup,
    unexplainedSharePercent: markupBytes === 0 ? 0 : (unexplainedMarkup / markupBytes) * 100,
    flightSharePercent: html.length === 0 ? 0 : (flight.bytes / html.length) * 100,
  }
}

export function analyseDocument(html, { expectFlight = true } = {}) {
  const documentBytes = html.length
  const gzipBytes = gzipSync(Buffer.from(html)).length
  const { srcsetBytes, candidates, firstCandidate, byRole } = candidateLists(html)
  const flight = flightPayload(html)

  const comp = composition(html)
  if (comp.unexplainedMarkup < 0) {
    throw new Error(
      `REFUSING: the named categories account for ${comp.srcsetMarkup + comp.classMarkup + comp.styleMarkup} B ` +
        `of a ${comp.markupBytes} B markup half, which is more than it contains. A matcher is counting bytes ` +
        'that are not there - most likely inside the flight payload it was supposed to have been excluded ' +
        'from - and every share this would print is wrong.',
    )
  }

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
    classLists: classListWeight(html),
    styleAttributes: styleAttributeWeight(html),
    composition: comp,
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
