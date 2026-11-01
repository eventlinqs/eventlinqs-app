/**
 * THE GUIDE'S CATEGORY RULES (city first, directive 2; C:\dev\EVIDENCE\CITY-FIRST-1NOV\data-model.md section 3).
 *
 * One primary category of the fifteen and up to three secondary, by written rules that are the same in every city,
 * first match wins for the primary:
 *   1. the organiser's own choice stands;
 *   2. a reviewer's choice stands, EXCEPT where the reviewer could only pick a broad category because the precise one did
 *      not exist yet (markets, theatre, classes and workshops were added on 1 November 2026): then the words decide;
 *   3. the source's own category words;
 *   4. whole words in the title;
 *   5. nothing matched: no primary, sent to review. A section is never filled with an event that does not belong to it.
 * Every answer says which rule set it, so the coverage report can show why an event is where it is.
 *
 * Pure. No city is named here.
 */

/**
 * In the order a visitor looks for them (Lawal, 19:17 1 November; CONTROLLER 19:19 (3)): music, sport, comedy,
 * nightlife, markets, food and drink, family, arts, then the rest, community last (Lawal 01:12, 2 November). public.event_categories.guide_order is this order
 * (migration 20261101192001); a test reads both.
 */
export const GUIDE_CATEGORIES = [
  'music', 'sports', 'comedy', 'nightlife', 'markets', 'food-drink', 'family', 'arts-community',
  'theatre', 'festival', 'classes-workshops', 'business-networking', 'health-wellness', 'education', 'community',
] as const
export type GuideCategory = (typeof GUIDE_CATEGORIES)[number]

export const GUIDE_CATEGORY_WORDS: Readonly<Record<GuideCategory, string>> = {
  music: 'Music and concerts',
  sports: 'Sports',
  comedy: 'Comedy',
  nightlife: 'Nightlife and DJs',
  markets: 'Markets',
  'food-drink': 'Food and drink',
  family: 'Family and children',
  'arts-community': 'Arts and exhibitions',
  theatre: 'Theatre and performing arts',
  festival: 'Festivals and community celebrations',
  'classes-workshops': 'Classes and workshops',
  'business-networking': 'Business and networking',
  'health-wellness': 'Health and wellness',
  education: 'Education and talks',
  community: 'Community',
}

/**
 * The written word lists, in the order they are tried: the most precise first, so a 'kids yoga class' is a class and a
 * 'night market' is a market. Whole words only, case ignored.
 */
export const WORD_RULES: readonly { category: GuideCategory; words: readonly string[] }[] = [
  { category: 'markets', words: ['market', 'markets', 'bazaar', 'flea market', 'farmers market', 'makers market', 'night market', 'trash and treasure'] },
  { category: 'comedy', words: ['comedy', 'comedian', 'comedians', 'stand-up', 'standup', 'improv'] },
  { category: 'theatre', words: ['theatre', 'theater', 'musical', 'opera', 'ballet', 'cabaret', 'pantomime', 'panto'] },
  { category: 'classes-workshops', words: ['workshop', 'workshops', 'class', 'classes', 'course', 'masterclass', 'lesson', 'lessons'] },
  { category: 'festival', words: ['festival', 'fest', 'carnival', 'fiesta', 'parade'] },
  { category: 'nightlife', words: ['dj', 'djs', 'club night', 'rave', 'karaoke'] },
  { category: 'music', words: ['concert', 'gig', 'live music', 'band', 'bands', 'orchestra', 'symphony', 'choir', 'recital', 'jazz', 'open mic'] },
  { category: 'sports', words: ['match', 'race', 'marathon', 'parkrun', 'fun run', 'tournament', 'footy', 'cricket', 'soccer', 'basketball', 'netball', 'rugby'] },
  { category: 'health-wellness', words: ['yoga', 'pilates', 'meditation', 'mindfulness', 'wellness', 'walking group', 'run club'] },
  { category: 'food-drink', words: ['wine', 'beer', 'tasting', 'degustation', 'brunch', 'dinner', 'cider', 'gin', 'whisky', 'food'] },
  { category: 'arts-community', words: ['exhibition', 'gallery', 'art show', 'installation', 'sculpture'] },
  { category: 'education', words: ['talk', 'lecture', 'seminar', 'author', 'book launch', 'panel', 'forum'] },
  { category: 'business-networking', words: ['networking', 'business', 'startup', 'conference'] },
  { category: 'family', words: ['kids', 'children', 'family', 'toddler', 'toddlers', 'storytime', 'school holiday', 'school holidays'] },
  { category: 'community', words: ['community', 'meetup', 'volunteer', 'working bee'] },
]

/** The broad category a reviewer had to use before the precise one existed, for each category added on 1 November 2026. */
export const ADDED_FROM: Readonly<Partial<Record<GuideCategory, readonly GuideCategory[]>>> = {
  markets: ['community', 'food-drink', 'family'],
  theatre: ['arts-community', 'festival'],
  'classes-workshops': ['education', 'community', 'arts-community', 'health-wellness'],
}

export type CategoryRule = 'organiser' | 'reviewer' | 'reviewer-refined' | 'source-words' | 'title-words' | 'review'

export interface ClassifyInput {
  readonly organiserChoice?: GuideCategory | null
  readonly reviewerChoice?: GuideCategory | null
  readonly sourceCategories?: readonly string[]
  readonly title: string
}

export interface Classification {
  readonly primary: GuideCategory | null
  readonly secondary: GuideCategory[]
  readonly rule: CategoryRule
  /** Every rule that matched, for the record. */
  readonly matched: GuideCategory[]
}

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The categories whose words appear in a text, as whole words, in rule order. */
export function wordMatches(text: string): GuideCategory[] {
  const t = text.toLowerCase()
  const out: GuideCategory[] = []
  for (const r of WORD_RULES) {
    if (r.words.some((w) => new RegExp(`(^|[^a-z0-9])${escape(w)}([^a-z0-9]|$)`).test(t)) && !out.includes(r.category)) out.push(r.category)
  }
  return out
}

const secondaryOf = (primary: GuideCategory | null, matched: readonly GuideCategory[]) =>
  matched.filter((c) => c !== primary).slice(0, 3)

export function classify(input: ClassifyInput): Classification {
  const fromSource = wordMatches((input.sourceCategories ?? []).join(' | '))
  const fromTitle = wordMatches(input.title)
  const matched = [...fromSource, ...fromTitle.filter((c) => !fromSource.includes(c))]

  if (input.organiserChoice) return { primary: input.organiserChoice, secondary: secondaryOf(input.organiserChoice, matched), rule: 'organiser', matched }
  if (input.reviewerChoice) {
    const refined = matched.find((c) => ADDED_FROM[c]?.includes(input.reviewerChoice!))
    if (refined) return { primary: refined, secondary: secondaryOf(refined, [input.reviewerChoice, ...matched]), rule: 'reviewer-refined', matched }
    return { primary: input.reviewerChoice, secondary: secondaryOf(input.reviewerChoice, matched), rule: 'reviewer', matched }
  }
  if (fromSource.length > 0) return { primary: fromSource[0], secondary: secondaryOf(fromSource[0], matched), rule: 'source-words', matched }
  if (fromTitle.length > 0) return { primary: fromTitle[0], secondary: secondaryOf(fromTitle[0], matched), rule: 'title-words', matched }
  return { primary: null, secondary: [], rule: 'review', matched }
}
