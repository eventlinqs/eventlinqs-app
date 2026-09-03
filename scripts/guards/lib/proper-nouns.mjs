/**
 * THE PROPER NOUN REGISTRY.
 *
 * FOUNDER RULING, 3 September 2026:
 *
 *   "Proper nouns are exempt from the word ban. The ban stops EventLinqs
 *    describing itself as culture-first; it was never meant to rename other
 *    people's organisations."
 *
 * WHY THIS FILE EXISTS. A find-and-replace of the banned word across the tree
 * did not stop at EventLinqs' own voice. It walked into the NAMES of real
 * Australian organisations, festivals and public bodies and rewrote them, so
 * the Multicultural Council of the Northern Territory became the
 * "Multicommunity Council of the Northern Territory" on a live page, and 42
 * more like it. Those names sit on the /community pages, which are 441 of the
 * 552 URLs in the production sitemap.
 *
 * Renaming a real body is not a copy defect. It is publishing something untrue
 * about somebody else, on a surface being shown to organisers.
 *
 * TWO GUARDS READ THIS ONE FILE, and that is deliberate:
 *
 *   no-banned-word-anywhere.mjs  permits the banned letters ONLY when they sit
 *                                inside one of the exact strings below. It
 *                                excuses a STRING, not a file and not even a
 *                                count, so any other use of the word on the same
 *                                line still fails.
 *
 *   proper-nouns-intact.mjs      fails the build if any name below is corrupted
 *                                again, and fails if a name goes stale.
 *
 * EVERY NAME BELOW WAS CONFIRMED AGAINST THE ORGANISATION'S OWN PUBLISHED PAGE
 * on 3 September 2026, per Law 7. The source is recorded beside each one. A name
 * with no source does not belong in this list.
 */

/**
 * Verified, current, real. Restored into the tree and held here.
 * @type {Array<{name: string, what: string, source: string}>}
 */
export const PROPER_NOUNS = [
  {
    name: 'Multicultural Council of the Northern Territory',
    what: 'NT peak body for culturally and linguistically diverse communities, based in Malak, Darwin',
    source: 'https://www.mcnt.org.au/',
  },
  {
    name: 'Multicultural Council of Tasmania',
    what: 'Tasmanian state-wide peak body, MCOT',
    source: 'https://mcot.org.au/',
  },
  {
    name: 'National Multicultural Festival',
    what: 'ACT Government festival in Canberra each February. The 28th ran 6 to 8 February 2026',
    source: 'https://www.cmtedd.act.gov.au/open_government/inform/act_government_media_releases/michael-pettersson-mla-media-releases/2026/get-ready-for-the-28th-national-multicultural-festival!-just-one-more-week-until-the-festivities-begin',
  },
  {
    name: 'Multicultural Neighbourhood Centre',
    what: 'not-for-profit neighbourhood centre in Lambton serving Newcastle and Lake Macquarie',
    source: 'https://www.mycommunitydirectory.com.au/New_South_Wales/Newcastle/Cultural_and_Migrant_Services/Migrant_Services/105886/217731/Multicultural_Neighbourhood_Centre',
  },
  {
    name: 'Illawarra Multicultural Services',
    what: 'Wollongong settlement service operating since 1980, IMS',
    source: 'https://ims.org.au/',
  },
  {
    name: 'Multicultural Services Centre',
    what: 'Multicultural Services Centre of WA, MSCWA, five centres including Mirrabooka at 14 Brewer Place',
    source: 'https://mscwa.com.au/',
  },
  {
    name: 'Australian GLBTIQ Multicultural Council',
    what: 'national peak body for multicultural and multifaith LGBTIQ communities, AGMC, tenant of the Victorian Pride Centre in St Kilda',
    source: 'https://pridecentre.org.au/tenants/australian-glbtiq-multicultural-council/',
  },
]

/**
 * NOT RESTORED, AND DELIBERATELY SO.
 *
 * For each of these the mechanical reverse produces a body that could NOT be
 * confirmed to exist under that name, or one that no longer exists. Writing the
 * reverse would name a real place wrongly for a second time, which the brief
 * that commissioned this work called out as worse than leaving it wrong once.
 *
 * They are enumerated here rather than left loose so that this guard still fails
 * on any NEW corruption while these five await a founder ruling on the copy. The
 * count is exact: if one is fixed, its entry must be deleted, and the staleness
 * check below fails until it is.
 *
 * @type {Array<{text: string, file: string, line: number, found: string}>}
 */
export const UNRESOLVED = [
  {
    text: 'Queensland Multicommunity Festival',
    file: 'src/lib/communities/intersection-editorial.ts',
    line: 465,
    found:
      'the Queensland Multicultural Festival was a Roma Street Parklands event that ended in 2011. The real Queensland celebration held each August is Multicultural Queensland Month (https://www.dwatsipm.qld.gov.au/multicultural-queensland-month/home)',
  },
  {
    text: 'Tropical North Queensland Multicommunity Centre',
    file: 'src/lib/communities/intersection-editorial.ts',
    line: 515,
    found:
      'no body of that name found. Cairns has the Cairns and Region Multicultural Association (CARMA, https://www.carmafamily.com/) and a Cairns Community and Multicultural Centre under construction at White Rock',
  },
  {
    text: 'Newcastle Multicommunity Centre',
    file: 'src/lib/communities/intersection-editorial.ts',
    line: 911,
    found:
      'no venue of that name found. Newcastle has the Multicultural Neighbourhood Centre in Lambton and Hunter Multicultural Communities (https://huntermulticultural.org.au/)',
  },
  {
    text: 'Geelong Multicommunity Centre',
    file: 'src/lib/communities/intersection-editorial.ts',
    line: 921,
    found:
      'no body of that name found. The Geelong organisation is Cultura, formed from the merger of Diversitat and MACS (https://www.cultura.org.au/)',
  },
  {
    text: 'Darwin Multicommunity Centre',
    file: 'src/lib/communities/intersection-editorial.ts',
    line: 936,
    found:
      'no venue of that name found. Darwin has the Malak Community Centre (https://www.darwin.nt.gov.au/community/community-facilities/malak-community-centre)',
  },
]

/** The corruption this registry exists to catch, in every case form. */
export const CORRUPTION = /multicommunity/i

/**
 * Remove every registered proper noun from a line, so a caller can ask whether
 * anything OTHER than a registered name carries the banned word.
 * @param {string} line
 * @returns {string}
 */
export function withoutProperNouns(line) {
  let out = line
  for (const entry of PROPER_NOUNS) out = out.split(entry.name).join('')
  return out
}
