/**
 * THE ONE THING ABOUT THE SEARCH CONSOLE TAG THAT COULD ACTUALLY PAINT, AND
 * CAN ACTUALLY FAIL.
 *
 * WHAT WAS TRIED FIRST AND THROWN AWAY, written down because the discarded
 * versions are the instructive part.
 *
 * ATTEMPT ONE, a cross-run photograph. `scripts/verify/seo2-drive.mjs` captured
 * every surface on the server WITHOUT the verification token, captured them
 * again on the server WITH it, and required the bytes to match. That comparison
 * cannot separate the thing it is asking about from the conditions it asks
 * under: the two captures are different page loads minutes apart, so a raster
 * that decoded a frame later is indistinguishable from the tag having changed
 * the page. Measured on 14 September 2026 across four runs of UNCHANGED code:
 * three reported 15 of 15 identical, one reported 14, failing on the homepage at
 * 1440 while the settled documents in that same run were identical. A verdict
 * that is wrong one run in four is a verdict somebody switches off.
 *
 * ATTEMPT TWO WAS WORSE, AND ONLY A DRILL FOUND OUT. It photographed ONE load,
 * inserted the meta element into the head, photographed again, and required a
 * match, which removed the timing exposure. It passed everywhere. Then it was
 * drilled by inserting a VISIBLE DIV instead of the meta element, expecting red,
 * and it passed that too: the browser's own stylesheet hides every child of
 * `<head>`, so nothing appended there can paint and the check could not fail
 * under ANY input. A check that cannot go red is worse than no check, because it
 * reports confidence it never earned. It was deleted rather than kept green.
 *
 * SO THE HONEST STATEMENT IS THIS. A `<meta>` element inside `<head>` cannot
 * paint, as a fact about HTML rather than a fact about this platform, and no
 * photograph can add anything to that. What is NOT automatic, and is therefore
 * worth a verdict, is the PRECONDITION: that what the platform emits really is
 * a single meta element, really is inside `<head>`, and appears nowhere after
 * `</head>`, where its content could be rendered to a reader as text. That is
 * falsifiable, it is deterministic, and it is the only part of "nothing a
 * visitor sees changes" that this platform is capable of getting wrong.
 *
 * IT RETURNS A RULING RATHER THAN REPORTING ONE, so the drive owns how a fault
 * is announced and this file can be tested without starting a server.
 */

/** The element, wherever it sits. Shared so the drive and this cannot diverge. */
export const VERIFICATION_TAG = /<meta[^>]+name=["']google-site-verification["'][^>]*>/i

/**
 * @param {string} html a whole response body
 * @returns {{ ok: boolean, reason: string | null }}
 */
export function judgeVerificationTagPlacement(html) {
  const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(String(html ?? ''))
  if (!headMatch) {
    return {
      ok: false,
      reason: 'the response has no <head> at all, so the tag cannot be placed correctly inside one',
    }
  }
  const head = headMatch[1]
  const afterHead = String(html).slice(headMatch.index + headMatch[0].length)

  const inHead = head.match(new RegExp(VERIFICATION_TAG.source, 'gi')) ?? []
  if (inHead.length !== 1) {
    return {
      ok: false,
      reason: `the verification tag appears ${inHead.length} time(s) in <head>, and exactly one is correct`,
    }
  }
  if (VERIFICATION_TAG.test(afterHead)) {
    return {
      ok: false,
      reason:
        'a verification tag appears AFTER </head>. In the body its content can be rendered to a reader as ' +
        'text, which is the one way this tag could change what a visitor sees.',
    }
  }
  if (!/^\s*<meta\b/i.test(inHead[0])) {
    return {
      ok: false,
      reason: `the verification tag is not a <meta> element (${inHead[0].slice(0, 60)})`,
    }
  }
  return { ok: true, reason: null }
}
