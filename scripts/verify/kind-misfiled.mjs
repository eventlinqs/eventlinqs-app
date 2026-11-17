/**
 * A NIGHT FILED AGAINST ITS KIND (the PM's 04:38 of 18 November 2026): no night the one kind reader the posts use
 * (nightKind, src/lib/social/campaign.ts) calls a talk carries Music or Arts, and no stage production carries Arts, on its
 * page or in discovery's filters (both read events.category_id). Read on production at 06:18 that day: An Evening with
 * Alastair Campbell, a talk, was Music, and Cosi by the Geelong Repertory Theatre Company, a play, was Arts.
 *
 * The words are read from the kind reader's own source text, never copied here, so the reader and this check cannot
 * drift apart. The order is the reader's: a title that calls itself a concert, or names a fight, is never a talk; a
 * soft talk word is a talk only where the night's own words name no performance ('An Evening with'), and 'stories' or
 * 'reading' only where, besides, the night is not filed as music. A Music night with theatre words is left
 * to the reader's own rule (a music night at a concert hall or theatre reads as a gig first), so only Arts is held there.
 *
 * Pure: kindMisfiled(rows, campaignSource) takes rows of { title, summary, category } and the text of campaign.ts.
 */

const DECLARED = (src, name) => {
  const m = src.match(new RegExp(`^const ${name} = /(.+)/([a-z]*)$`, 'm'))
  if (!m) throw new Error(`${name} is not declared as one regular expression on its own line in src/lib/social/campaign.ts`)
  return new RegExp(m[1], m[2])
}

/** The categories each kind is never filed under. */
export const NEVER_UNDER = { talk: ['music', 'arts-community'], theatre: ['arts-community'] }

export function kindMisfiled(rows, campaignSource) {
  const TALK = DECLARED(campaignSource, 'TALK_WORDS')
  const EVENING = DECLARED(campaignSource, 'EVENING_WITH')
  const SOFT = DECLARED(campaignSource, 'SOFT_TALK_WORDS')
  const PERFORMANCE = DECLARED(campaignSource, 'PERFORMANCE_WORDS')
  const THEATRE = DECLARED(campaignSource, 'THEATRE_WORDS')
  const FIGHT = DECLARED(campaignSource, 'FIGHT_WORDS')
  const out = []
  for (const n of rows) {
    const title = n.title ?? ''
    const words = `${title} ${n.summary ?? ''}`
    let kind = null
    if (/\bconcert\b/i.test(title) || FIGHT.test(title)) kind = null
    else if (TALK.test(words) || (!PERFORMANCE.test(words) && (EVENING.test(words) || (n.category !== 'music' && SOFT.test(words))))) kind = 'talk'
    else if (THEATRE.test(words)) kind = 'theatre'
    if (kind && NEVER_UNDER[kind].includes(n.category)) out.push({ ...n, kind })
  }
  return out
}
