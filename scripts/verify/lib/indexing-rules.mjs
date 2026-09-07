/**
 * THE FIVE INDEXING RULES, AS PURE FUNCTIONS (close-out C19.6).
 *
 * Split out of scripts/verify/indexing-drive.mjs on 8 September 2026 for one
 * reason: the standing law is that every guard is proven to FAIL as well as to
 * pass, and two of these five rules could not be. RULE 2 (the sitemap contains a
 * noindex URL) and RULE 5 (the page and the sitemap disagree) only fire against
 * a host in a broken state, and the broken state is one nobody had produced, so
 * both were passing and neither had ever been seen failing.
 *
 * A rule that has never fired is a rule nobody has checked. As pure functions
 * over a fetched result they are driven in both directions by
 * tests/unit/seo/indexing-rules.test.ts in milliseconds, and the drive script
 * calls exactly the same code against the real host.
 *
 * Every message names the rule number, so a failure on a live run and a failure
 * in a test read identically.
 */

/** A page is asking not to be indexed. */
export const isNoindex = (robots) => /noindex/i.test(robots ?? '')

/**
 * Judge one driven page against the class its route carries.
 *
 * @param {object} r  the driven result: { path, route, klass, status, redirect,
 *                    robots, canonical, canonicalRaw, inSitemap }
 * @returns {string[]} zero or more faults, each naming its rule
 */
export function judgePage(r) {
  const faults = []
  const where = `${r.path} (${r.route}, ${r.klass})`

  if (r.error) return [`${where} could not be fetched: ${r.error}`]

  if (r.redirect) {
    // A redirect has no document. The only thing to assert is that it is not
    // advertised in the sitemap, which would publish a redirect to Google
    // against its own guidance for sitemaps.
    if (r.inSitemap) faults.push(`${where} redirects to ${r.redirect} and is published in the sitemap`)
    return faults
  }

  if (r.status >= 500) return [`${where} answered ${r.status}`]
  // A 404 carries the not-found document, whose metadata is deliberately its own.
  if (r.status === 404) return faults

  if (r.klass === 'never') {
    if (!isNoindex(r.robots)) faults.push(`RULE 1: ${where} is INDEXABLE. robots=${r.robots ?? 'none'}. A never route must be noindex.`)
    if (r.inSitemap) faults.push(`RULE 1: ${where} is published in the sitemap. A never route must never be in it.`)
    if (r.canonical) faults.push(`RULE 1: ${where} emits a canonical (${r.canonical}). A noindex page should not also name one.`)
    return faults
  }

  if (r.klass === 'alias') {
    if (!isNoindex(r.robots)) faults.push(`RULE 4: ${where} is an alias and is INDEXABLE. robots=${r.robots ?? 'none'}`)
    if (r.canonical && r.canonical === r.path) faults.push(`RULE 4: ${where} is an alias whose canonical points at itself; it must point at the page it aliases`)
    if (r.inSitemap) faults.push(`RULE 4: ${where} is an alias published in the sitemap`)
    return faults
  }

  // always and conditional
  if (!r.canonical) {
    faults.push(`RULE 3: ${where} emits NO canonical. Every indexable page must name itself.`)
  } else if (r.canonical !== r.path) {
    faults.push(
      [
        `RULE 4: ${where} emits a canonical pointing somewhere else: ${r.canonicalRaw ?? r.canonical}.`,
        '        This is the defect Search Console reports as "duplicate, Google chose different',
        '        canonical than user". Only an alias may point elsewhere.',
      ].join('\n'),
    )
  }

  if (r.klass === 'always' && isNoindex(r.robots)) {
    faults.push(`${where} is classified always and is NOINDEX. robots=${r.robots}. A public page carrying noindex by accident is a defect too.`)
  }

  if (r.klass === 'conditional') {
    const indexable = !isNoindex(r.robots)
    if (indexable !== r.inSitemap) {
      faults.push(
        [
          `RULE 5: ${where} says ${indexable ? 'INDEXABLE' : 'noindex'} and the sitemap says ${r.inSitemap ? 'PUBLISHED' : 'absent'}.`,
          '        The page and the sitemap read the same counts through',
          '        src/lib/seo/discovery-counts.ts, so a disagreement means one of them stopped.',
        ].join('\n'),
      )
    }
  }

  return faults
}

/**
 * Judge one URL the sitemap publishes. RULE 2 and the sitemap half of RULE 3.
 *
 * @param {object} e { path, status, location, robots, canonical }
 */
export function judgeSitemapEntry(e) {
  const faults = []
  if (e.status !== 200) {
    faults.push(`RULE 2: ${e.path} is in the sitemap and answered ${e.status}${e.location ? ` -> ${e.location}` : ''}`)
    return faults
  }
  if (isNoindex(e.robots)) {
    faults.push(
      `RULE 2: ${e.path} is in the sitemap and is NOINDEX (robots=${e.robots}). ` +
        'A sitemap of pages we ask not to be indexed is the contradiction Search Console reports.',
    )
  }
  if (!e.canonical) faults.push(`RULE 3: ${e.path} is in the sitemap and emits no canonical`)
  return faults
}
