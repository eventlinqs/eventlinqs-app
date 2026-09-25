/**
 * THE WEEKLY INDEXING CHECK, THE PURE HALF (close-out SEO2 step 3).
 *
 * "A weekly indexing check that the platform runs itself: pages submitted, pages
 * indexed, and any page in the sitemap that Search Console reports as excluded,
 * with the reason. It appears in the owner digest as one line."
 *
 * WHY IT HAD TO EXIST. C19 was fought entirely from five exclusion reasons the
 * owner read off a screen. The build could not ask, so every question about
 * whether Google could see this platform was answered by a person looking, and
 * the item that fixed it closed without anybody being able to check it again.
 * A check nobody can run is a check that runs once.
 *
 * ============================================================================
 * THE TWO HALVES OF "INDEXED", AND WHY THEY ARE NOT THE SAME QUESTION
 * ============================================================================
 *
 * WHAT WE PUBLISHED AND WHAT WE SERVE is ours, and needs no permission: the
 * sitemap is fetched, every URL in it is requested, and each answer is read. It
 * catches the defect class this repository keeps producing, which is a sitemap
 * advertising URLs the platform does not serve: 48 hard 404s on 25 August 2026,
 * eight 'pending' organisers before that.
 *
 * WHAT GOOGLE DID WITH IT is Google's, and needs a credential. It is worth being
 * exact about which API answers it, because the obvious one does not:
 *
 *   `sitemaps.get` returns `contents[].submitted` and `contents[].indexed`, and
 *   the Sitemaps resource documentation marks `indexed` "Deprecated; do not
 *   use."  https://developers.google.com/webmaster-tools/v1/sitemaps
 *   (fetched 2026-09-14)
 *
 * So the indexed count cannot be read off the sitemap resource at all. It comes
 * from the URL Inspection API, one call per URL, which returns
 * `indexStatusResult.verdict` (PASS, PARTIAL, FAIL, NEUTRAL) and a human
 * `coverageState` string, which is the very thing this item asks for: the
 * reason.
 *   https://developers.google.com/webmaster-tools/v1/urlInspection.index/UrlInspectionResult
 *   (fetched 2026-09-14)
 *
 * That API is quota-bounded at "2000 QPD" and "600 QPM" per site
 *   https://developers.google.com/webmaster-tools/limits (fetched 2026-09-14)
 * so a weekly sweep of a catalogue in the hundreds fits with room to spare, and
 * the impure half paces itself against those numbers rather than hoping.
 *
 * AN ABSENT CREDENTIAL IS SAID, NEVER ROUNDED TO GOOD NEWS. Until the property
 * is verified there is no indexed count, and the line the owner reads says so
 * and names the one command that changes it. Reporting "0 excluded" for a
 * property Google has never been asked about would be the check lying in the
 * exact register it was built to stop.
 */

/** Said once, so the digest and the workflow cannot describe it differently. */
export const INDEXING_CADENCE = 'The indexing check runs weekly, on a Monday'

/**
 * Past this, a result is OVERDUE rather than merely old. Eight days: the weekly
 * cadence plus a day, so one late run is not an alarm and a stopped job is.
 */
export const INDEXING_STALE_AFTER_HOURS = 8 * 24

/** The one command that turns the Search Console half on. */
export const VERIFY_COMMAND = 'npm run seo2:verify-property'

/** Google's own verdict values, so a typo here cannot silently mean "not indexed". */
export const VERDICTS = ['VERDICT_UNSPECIFIED', 'PASS', 'PARTIAL', 'FAIL', 'NEUTRAL']

/**
 * Every `<loc>` in a sitemap, in document order, deduplicated.
 *
 * Deliberately a regular expression rather than an XML parser: the input is one
 * element type from a document this repository generates, the failure mode of a
 * parser here is a dependency, and a sitemap that is malformed enough to defeat
 * this is a sitemap the count will report as suspiciously small.
 */
export function parseSitemapLocs(xml) {
  const seen = new Set()
  for (const match of String(xml ?? '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    seen.add(match[1].trim())
  }
  return [...seen]
}

/**
 * The robots directive a page declares, lower-cased, or null when it declares
 * none. Reads the `robots` meta only: `googlebot` is a narrowing of it and a
 * page that carried one without the other would be a different defect.
 */
export function robotsFromHtml(html) {
  const text = String(html ?? '')
  const match = /<meta[^>]+name=["']robots["'][^>]*>/i.exec(text)
  if (!match) return null
  const content = /content=["']([^"']*)["']/i.exec(match[0])?.[1]
  return typeof content === 'string' ? content.trim().toLowerCase() : null
}

/**
 * One fetched sitemap URL, judged.
 *
 * @param {{ url: string, status: number, robots?: string | null, error?: string | null }} record
 * @returns {{ ok: boolean, fault: string | null }}
 *
 * Two faults, and they are different failures with different readers:
 *
 *   NOT 200   Googlebot is being sent to a page that is not there. This is the
 *             one that produced "not found 404" in Search Console.
 *   NOINDEX   the sitemap says index this and the page says do not. Search
 *             Console reports that back as "excluded by noindex", and it is the
 *             contradiction the threshold policy exists to prevent.
 */
export function judgeFetched(record) {
  if (record.error) {
    return { ok: false, fault: `could not be fetched: ${record.error}` }
  }
  if (record.status !== 200) {
    return { ok: false, fault: `answered HTTP ${record.status}, and the sitemap advertises it to Googlebot` }
  }
  if (record.robots && /\bnoindex\b/.test(record.robots)) {
    return { ok: false, fault: `is in the sitemap and declares robots "${record.robots}"` }
  }
  return { ok: true, fault: null }
}

/**
 * Whether the Search Console half can run at all, as a pure function of the
 * environment, so the sentence the owner reads is testable.
 */
export function credentialState(env = {}) {
  const raw = (env.GOOGLE_SEARCH_CONSOLE_KEY ?? '').trim()
  if (!raw) {
    return {
      connected: false,
      reason:
        'no GOOGLE_SEARCH_CONSOLE_KEY on this machine, so Google has never been asked what it did with these ' +
        `URLs. ${VERIFY_COMMAND} verifies the property and stores the credential`,
    }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { connected: false, reason: 'GOOGLE_SEARCH_CONSOLE_KEY is set and is not JSON, so no service account could be built from it' }
  }
  if (!parsed?.client_email || !parsed?.private_key) {
    return { connected: false, reason: 'GOOGLE_SEARCH_CONSOLE_KEY is JSON but carries no client_email and private_key pair' }
  }
  return { connected: true, reason: null, clientEmail: String(parsed.client_email) }
}

/**
 * The indexed count and the exclusion reasons, from URL Inspection results.
 *
 * `verdict === 'PASS'` is Google saying the URL is in the index. Everything else
 * is an exclusion, and `coverageState` is Google's own sentence for why, which
 * is repeated verbatim rather than re-worded: a reason a reader can paste back
 * into Search Console is worth more than a tidier one that matches nothing.
 */
/** @param {any[]} inspections */
export function coverageFromInspections(inspections = []) {
  let indexed = 0
  const excluded = []
  for (const item of inspections) {
    const status = item?.result?.inspectionResult?.indexStatusResult ?? item?.indexStatusResult ?? null
    if (!status) {
      excluded.push({ url: item?.url ?? 'an unnamed URL', reason: item?.error ?? 'Search Console returned no index status' })
      continue
    }
    if (status.verdict === 'PASS') {
      indexed += 1
      continue
    }
    excluded.push({
      url: item?.url ?? 'an unnamed URL',
      reason: status.coverageState || `verdict ${status.verdict ?? 'unknown'}`,
    })
  }
  return { indexed, excluded }
}

/**
 * One URL as it was actually requested.
 * @typedef {{ url: string, status: number, robots?: string | null, error?: string | null }} FetchedUrl
 *
 * What Google said, or why it was not asked. `indexed` and `excluded` are null
 * and empty exactly while `connected` is false, and the digest prints `reason`.
 * @typedef {{ connected: boolean, reason?: string | null, indexed?: number | null,
 *   excluded?: { url: string, reason: string }[] }} SearchConsoleHalf
 */

/**
 * The whole result, from the two halves. Pure, so every sentence below is
 * testable with no network and no clock.
 *
 * @param {{ site: string, at: string, submitted: number, fetched?: FetchedUrl[],
 *   searchConsole?: SearchConsoleHalf | null }} input
 */
export function summarise({ site, at, submitted, fetched = [], searchConsole = null }) {
  const faults = []
  for (const record of fetched) {
    const { ok, fault } = judgeFetched(record)
    if (!ok) faults.push({ url: record.url, fault })
  }
  const served = fetched.length - faults.length
  return {
    at,
    site,
    submitted,
    served,
    checked: fetched.length,
    faults,
    searchConsole: searchConsole ?? { connected: false, reason: credentialState({}).reason, indexed: null, excluded: [] },
    headline: composeHeadline({ submitted, served, checked: fetched.length, faults, searchConsole }),
  }
}

/**
 * The one line, which is the whole point of the item.
 *
 * It leads with what is WRONG when anything is, because a reader scanning a
 * digest reads the first clause and the rest only if it alarms them.
 *
 * @param {{ submitted: number, served: number, checked: number,
 *   faults?: { url: string, fault: string }[], searchConsole?: SearchConsoleHalf | null }} input
 */
export function composeHeadline({ submitted, served, checked, faults = [], searchConsole = null }) {
  const parts = []
  parts.push(`${submitted} URL${submitted === 1 ? '' : 's'} submitted`)
  if (checked > 0) parts.push(`${served} of ${checked} served cleanly`)
  if (faults.length > 0) {
    parts.push(`${faults.length} advertised to Googlebot that ${faults.length === 1 ? 'does' : 'do'} not answer 200 or say noindex`)
  }
  if (searchConsole?.connected) {
    parts.push(`${searchConsole.indexed} indexed by Google`)
    const n = searchConsole.excluded?.length ?? 0
    parts.push(n === 0 ? 'none excluded' : `${n} excluded`)
  } else {
    parts.push('Search Console not connected')
  }
  return `${parts.join(', ')}.`
}

/** How many faults are named before the list is summarised. A digest is read, not scrolled. */
export const NAMED_FAULTS = 8

/**
 * The digest section's lines, from a state object, or the honest absence.
 *
 * @param {{ headline: string, site?: string | null, ageHours: number, stale: boolean,
 *   error?: string, faults?: { url: string, fault: string }[],
 *   searchConsole?: SearchConsoleHalf | null } | null} indexing
 * @param {(hours: number) => string} humanAge
 */
export function digestLines(indexing, humanAge) {
  if (!indexing) return [`${INDEXING_CADENCE}. No result is on the machine that composed this report.`]
  if (indexing.error) return [`Not known: ${indexing.error}.`]
  const lines = [indexing.headline, `Last run ${humanAge(indexing.ageHours)} ago, against ${indexing.site ?? 'production'}.`]
  if (indexing.stale) {
    lines.push(`THIS IS OVERDUE. ${INDEXING_CADENCE}, and this result is ${humanAge(indexing.ageHours)} old.`)
  }
  if (!indexing.searchConsole?.connected && indexing.searchConsole?.reason) {
    lines.push(indexing.searchConsole.reason)
  }
  for (const fault of (indexing.faults ?? []).slice(0, NAMED_FAULTS)) {
    lines.push(`IN THE SITEMAP AND BROKEN: ${fault.url} ${fault.fault}`)
  }
  if ((indexing.faults ?? []).length > NAMED_FAULTS) {
    lines.push(`and ${indexing.faults.length - NAMED_FAULTS} more like it.`)
  }
  for (const excluded of (indexing.searchConsole?.excluded ?? []).slice(0, NAMED_FAULTS)) {
    lines.push(`GOOGLE EXCLUDED: ${excluded.url} - ${excluded.reason}`)
  }
  if ((indexing.searchConsole?.excluded ?? []).length > NAMED_FAULTS) {
    lines.push(`and ${indexing.searchConsole.excluded.length - NAMED_FAULTS} more Google excluded.`)
  }
  return lines
}
