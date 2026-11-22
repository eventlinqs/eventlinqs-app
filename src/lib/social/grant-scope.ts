/**
 * WHAT AN EMAILED GRANT'S OWN WORDS PERMIT (the PM's 11:05 of 22 November 2026; law 32 (c): the organiser's declaration
 * covers the placement). Fred Alale AM granted AMCF's photographs to Lawal on 14 October 2026, quoted: "photographs from
 * previous festivals that you are welcome to use to promote AMCF". Promoting AMCF includes our social posts, yet the
 * register recorded those photographs for the website only, so the engine could not post the better ones on the festival's
 * last day. A grant whose words permit promotion, marketing or social posts is recorded for social as well as site, unless
 * its own words keep it to the website or off social media. Pure.
 */
const PERMITS_PROMOTION = /\b(promot(e|es|ed|ing|ion)|marketing|publicis(e|ing)|advertis(e|ing)|social media|socials|social posts?|instagram|facebook)\b/i
const KEEPS_OFF_SOCIAL = /\b(website only|site only|only on (your|the) (website|site)|not (on|for) social|no social|not on (instagram|facebook)|not for (instagram|facebook))\b/i

export function scopeFromGrantWords(words: string | null | undefined): 'both' | null {
  const w = (words ?? '').trim()
  if (!w || KEEPS_OFF_SOCIAL.test(w)) return null
  return PERMITS_PROMOTION.test(w) ? 'both' : null
}

/** The scope to record: a person's 'site' widened to 'both' when the grant's own words permit promotion. Pure. */
export function scopeToRecord(chosen: 'social' | 'site' | 'both', grantWords: string | null | undefined): 'social' | 'site' | 'both' {
  return chosen === 'site' && scopeFromGrantWords(grantWords) === 'both' ? 'both' : chosen
}
