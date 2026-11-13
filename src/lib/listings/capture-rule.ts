import lexicon from '@/lib/ai/copy-tells.json'
import { classify, type GuideCategory } from '@/lib/categories/classify'
import { fold, type HuntSource } from './headline-hunt'

/**
 * CAPTURE PUBLISHES BY ITSELF (Lawal's 10:42, 10:49 and 11:05 of 13 November 2026: 'I need my events working without you
 * manually doing this every day. That's the engine'; the project manager's 11:06 item 1, the checks below; read on
 * production at 10:45 that day: 607 upcoming nights captured and waiting for a person, none accepted by a person in 7
 * days).
 *
 * A VERIFIED source's new night, in one of the four cities the guides serve, publishes WITHOUT A PERSON when it passes
 * every check, and waits in the Command Centre with its reason when it fails one:
 *
 *   1. its source's terms permit it and its robots allow it: the database lets no source be read otherwise
 *      (listing_sources_read_needs_permission, _read_needs_terms), and the run reads no page robots bar;
 *   2. a future date and a start time to trust: the judge's holds (no time, an offset that is not the venue's, a time
 *      implausible for its kind, a midnight start, a span of days) and no start between midnight and 9 am in Melbourne;
 *   3. its venue is a venue EventLinqs already holds in that city, by its exact name, and not one that lists its own
 *      nights or has claimed itself (venue_not_known);
 *   4. a title of at most a listing's 80 characters (title_too_long) and a link to its own page, whose ticket link
 *      reaches its seller (link_unreached);
 *   5. not a duplicate of a listed night: no similar listing at the venue, no listed night of the same title that day;
 *   6. no banned word in its title: the community law's word, from the platform's one lexicon (banned_words);
 *   7. a category, from its own words or its source's (no_category).
 *
 * Every night the rule publishes is published through its candidate row (decided_by 'partner_rule', at high
 * confidence, with no reason), so each is logged as having passed exactly these checks; the Command Centre shows ten of
 * each day's for a glance. THE PER-SOURCE SWITCH: a source whose verification is taken off 'verified' stops publishing
 * by this rule at once, and its nights wait for a person (source_unverified). An open records canary (law 19 section
 * 7.4) still limits a source to its tenth.
 *
 * A run decides at most CAPTURE_RULE_PER_RUN nights by this rule per source, so a source with hundreds of waiting nights
 * never spends the run's budget on one source's link checks; the rest are decided by the next runs.
 */

/** The cities the guides serve and the rule may publish in (publishHuntNight's state is Victoria's). */
export const CAPTURE_RULE_CITIES = ['melbourne', 'geelong', 'ballarat', 'bendigo'] as const
export type CaptureCity = (typeof CAPTURE_RULE_CITIES)[number]

/** A listing's title limit (collect-store.ts publishHuntNight refuses a longer one). */
export const LISTING_TITLE_MAX = 80

/** At most this many nights per source are decided by the rule in one run (each asks its ticket link first). */
export const CAPTURE_RULE_PER_RUN = 20

/** The checks a night published by the rule passed, as the Command Centre names them. */
export const CAPTURE_RULE_CHECKS: readonly string[] = [
  'terms permit and robots allow',
  'a future date and a time to trust',
  'a venue EventLinqs holds in that city',
  'a title and its own page, the ticket link reaching its seller',
  'not a duplicate of a listed night',
  'no banned word',
  'a category',
]

const BANNED_NAMES = new Set(['banned-word-community-law'])
const BANNED: readonly RegExp[] = lexicon.hard.filter((t) => BANNED_NAMES.has(t.name)).map((t) => new RegExp(t.source, 'i'))

/** The title carries a word the platform bans (the community law's word, from src/lib/ai/copy-tells.json). */
export function hasBannedWord(title: string): boolean {
  return BANNED.some((re) => re.test(title))
}

/** The held venue whose name is the night's venue words exactly (case, accents and punctuation aside); else null. */
export function knownVenueMatch(venueName: string, known: readonly string[]): string | null {
  const v = fold(venueName)
  if (!v) return null
  return known.find((name) => fold(name) === v) ?? null
}

export type CaptureRuleSource = {
  pageUrl: string
  citySlug?: string | null
  verified: boolean
  partner: boolean
  hunt?: HuntSource | null
  ownProgramme?: HuntSource | null
  categorySlug?: string | null
}

/** The source falls under this rule: verified, in a guide's city, and under no other rule (the hunt, its own programme, a partner's). */
export function underCaptureRule(source: CaptureRuleSource): source is CaptureRuleSource & { citySlug: CaptureCity } {
  return (
    source.verified &&
    !source.partner &&
    !source.hunt &&
    !source.ownProgramme &&
    (CAPTURE_RULE_CITIES as readonly string[]).includes(source.citySlug ?? '')
  )
}

export type CaptureHold = 'venue_not_known' | 'title_too_long' | 'banned_words' | 'no_category'

/**
 * The rule for one night: the venue it publishes at and the category it is listed under, or the holds that keep it for
 * a person. Pure.
 */
export function captureDecision(
  night: { title: string; venueName: string },
  source: CaptureRuleSource & { citySlug: CaptureCity },
  knownVenues: readonly string[],
): { rule: HuntSource; venue: string } | { holds: CaptureHold[] } {
  const holds: CaptureHold[] = []
  const venue = knownVenueMatch(night.venueName, knownVenues)
  if (!venue) holds.push('venue_not_known')
  if (night.title.trim().length > LISTING_TITLE_MAX) holds.push('title_too_long')
  if (hasBannedWord(night.title)) holds.push('banned_words')
  const category = (classify({ title: night.title }).primary as GuideCategory | null) ?? ((source.categorySlug ?? null) as GuideCategory | null)
  if (!category) holds.push('no_category')
  if (holds.length > 0 || !venue || !category) return { holds }
  let host = ''
  try {
    host = new URL(source.pageUrl).hostname.replace(/^www\./, '')
  } catch {
    host = source.pageUrl
  }
  return { rule: { host, citySlug: source.citySlug, venues: [venue], usualCategory: category }, venue }
}
