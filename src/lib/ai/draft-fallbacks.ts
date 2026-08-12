import 'server-only'
import { findCopyTells } from './copy-tells'

/**
 * The deterministic draft layer: every step 1 field composed from real event
 * facts with no model call at all.
 *
 * It has two jobs, and they are the same code:
 *
 * 1. FALLBACK. When the model omits a field, returns a value that does not
 *    validate, or is unavailable entirely, these functions fill the gap. The
 *    founder's bar is that every field arrives filled with something
 *    defensible and the organiser's job is subtraction, never composition
 *    from a blank field. A blank field is a failure of the tool, so the tool
 *    may never depend on a model call succeeding to avoid one.
 * 2. THE NO-AI FLOOR. The public composer must hand a stranger a real kit even
 *    when the AI key is absent, the monthly budget is exhausted, or the rate
 *    limiter has fired. Everything here runs on parsed facts and costs nothing.
 *
 * Design rules that hold throughout:
 * - Never invent a fact. Every output is composed from something the organiser
 *   actually typed or from a field the extractor already resolved.
 * - Never name a category, community or tag that is not in the live allowed
 *   list passed in by the caller. The lists are server-derived, so this layer
 *   survives a taxonomy change without an edit.
 * - Community detection is deliberately high-precision and low-recall. A wrong
 *   community tick is worse than none, so a signal must be unmistakable.
 */

/** Lowercase, punctuation-flattened text for matching. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s&/-]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Intent rules for the category fallback.
 *
 * `match` runs against the organiser's own words. `nameHints` are lowercase
 * substrings looked for in the LIVE category names the caller passes in, so
 * the rule finds its target without this file hardcoding any taxonomy name.
 * That keeps the module correct across a taxonomy migration and keeps the
 * repository copy gate clean.
 *
 * Order matters: the first rule that matches the text AND resolves against the
 * allowed list wins, so the most specific intents sit first.
 */
const CATEGORY_RULES: { match: RegExp; nameHints: string[] }[] = [
  // PURPOSE BEFORE FORMAT. A charity gala is a fundraiser that happens to
  // serve dinner, and a night market is a market that happens to have a band.
  // These rules sit first because the organiser's PURPOSE is what a buyer
  // browses by; matching the incidental format first put a fundraiser under
  // food and a market under music, which is how this ordering was found.
  { match: /\b(fundraiser|fundrais\w*|charity|benefit|gala dinner|silent auction|donation drive|telethon|in aid of|proceeds)\b/, nameHints: ['charity'] },
  { match: /\b(market|makers market|night market|farmers market|pop ?up shop|car boot|stalls)\b/, nameHints: ['food', 'community'] },
  { match: /\b(birthday party|kids|childrens|children s|toddler|face painting|school holiday|playgroup|storytime)\b/, nameHints: ['family'] },

  // Performance and comedy. Comedy DOES have its own category now: R1
  // (migration 20260808000004) created it, because the homepage already
  // merchandised a comedy tile and a comedy rail that could never match an
  // event. This rule used to file every comedy night under the performing arts
  // category as the honest best fit "until that migration lands"; it has
  // landed. The arts hint stays as the fallback so this still behaves on a
  // deployment where the migration has not been applied.
  { match: /\b(stand ?up|standup|comedy|comedian|comic|improv|sketch|open mic)\b/, nameHints: ['comedy', 'art'] },
  { match: /\b(theatre|theater|play|musical|ballet|dance recital|cabaret|circus|spoken word|poetry)\b/, nameHints: ['art'] },
  { match: /\b(exhibition|gallery|art show|installation|sculpture)\b/, nameHints: ['art'] },
  { match: /\b(film|cinema|screening|movie|documentary|short film)\b/, nameHints: ['film'] },

  // Music and nightlife.
  //
  // WHY THE GENRE WORDS ARE HERE. This rule used to read `\bdj\b`, which does
  // not match "DJs", and carried no genre vocabulary at all. So "Amapiano and
  // Afrobeats night ... three DJs" matched NOTHING and fell through to the
  // `other` bucket at the bottom of this function, and the card, the poster and
  // the event page all printed OTHER in gold on the founder's own wedge: the
  // Geelong and Melbourne dance and community scene. A DJ night filed as Other
  // is invisible to every music surface on the platform.
  //
  // The dance and club genres resolve to Nightlife, the live ones to Music.
  // Both categories exist: `nightlife` and `music` are live rows.
  //
  // Bare `house`, `rock` and `pop` are deliberately absent: house party, rock
  // climbing and pop up shop are all common and none of them is a gig.
  {
    match:
      /\b(club night|nightclub|djs?|dj set|b2b|rave|warehouse|after ?party|late set|techno|house music|tech house|deep house|afro ?house|amapiano|afrobeats?|garage|dnb|drum and bass|jungle|trance|hardstyle|disco|dancehall|soca|reggaeton|bashment)\b/,
    nameHints: ['night', 'music'],
  },
  {
    match:
      /\b(gig|band|live music|concert|acoustic|orchestra|choir|album launch|ep launch|singer|songwriter|hip ?hop|rap|rnb|r&b|soul|funk|reggae|jazz|blues|country music|folk|indie|metal|punk|classical|opera|open decks)\b/,
    nameHints: ['music'],
  },

  // Gatherings.
  { match: /\b(festival|fete|carnival|street party|multi ?day)\b/, nameHints: ['festival'] },
  { match: /\b(market|makers market|night market|farmers market|pop ?up shop|car boot)\b/, nameHints: ['food', 'community'] },
  { match: /\b(degustation|tasting|winery|brewery|distillery|long lunch|supper|dinner|banquet|food truck|cook ?off)\b/, nameHints: ['food'] },

  // Work and learning.
  { match: /\b(workshop|masterclass|short course|class|seminar|lecture|training|bootcamp|tutorial)\b/, nameHints: ['education'] },
  { match: /\b(conference|summit|networking|meetup|expo|trade show|pitch night|breakfast briefing)\b/, nameHints: ['business'] },
  { match: /\b(hackathon|demo day|product launch|startup|developer|coding)\b/, nameHints: ['technolog'] },

  // People.
  { match: /\b(fundraiser|charity|benefit|gala dinner|auction|donation drive|telethon)\b/, nameHints: ['charity'] },
  { match: /\b(kids|children|childrens|toddler|family friendly|birthday party|school holiday|playgroup|storytime)\b/, nameHints: ['family'] },
  { match: /\b(yoga|pilates|meditation|retreat|sound bath|breathwork|wellness|mental health|fun run|parkrun)\b/, nameHints: ['health', 'wellness'] },
  { match: /\b(match|game day|tournament|grand final|race|regatta|footy|cricket|soccer|netball|basketball)\b/, nameHints: ['sport'] },
  { match: /\b(church|worship|mass|service|prayer|temple|mosque|synagogue|gospel|faith)\b/, nameHints: ['religion'] },
  { match: /\b(runway|fashion show|designer|catwalk|style)\b/, nameHints: ['fashion'] },
  { match: /\b(pride|queer|lgbtq|drag|mardi gras)\b/, nameHints: ['pride'] },
]

/**
 * Choose a category from the live allowed names using the organiser's words.
 *
 * Returns the exact allowed name, or '' only when the allowed list is empty.
 * The last resort is a general-purpose bucket if one exists, because the
 * founder's ruling is that the tool always chooses: an unselected category is
 * a blank field, and a blank field is a failure of the tool.
 */
export function pickCategoryFallback(text: string, allowedNames: string[]): string {
  if (allowedNames.length === 0) return ''
  const hay = normalise(text)
  const findByHints = (hints: string[]): string | null => {
    for (const hint of hints) {
      const hit = allowedNames.find(n => n.toLowerCase().includes(hint))
      if (hit) return hit
    }
    return null
  }
  for (const rule of CATEGORY_RULES) {
    if (!rule.match.test(hay)) continue
    const hit = findByHints(rule.nameHints)
    if (hit) return hit
  }
  // Nothing matched: prefer a general bucket, else the first live category, so
  // the organiser always lands on a real selection they can change.
  return findByHints(['other', 'community']) ?? allowedNames[0]!
}

/** Australian date wording for a naive local "YYYY-MM-DDTHH:mm" string. */
function dayAndTime(local: string): { day: string; time: string } | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, hh, mm] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm))
  if (Number.isNaN(date.getTime())) return null
  const day = date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
  const hour = Number(hh)
  const minute = Number(mm)
  const suffix = hour < 12 ? 'am' : 'pm'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const time = minute === 0 ? `${h12}${suffix}` : `${h12}.${String(minute).padStart(2, '0')}${suffix}`
  return { day, time }
}

/** Australian cities and larger towns the deterministic pass can recognise. */
const AU_PLACES = [
  'geelong', 'melbourne', 'sydney', 'brisbane', 'perth', 'adelaide', 'hobart',
  'darwin', 'canberra', 'newcastle', 'wollongong', 'ballarat', 'bendigo',
  'gold coast', 'sunshine coast', 'townsville', 'cairns', 'toowoomba',
  'launceston', 'mackay', 'rockhampton', 'bunbury', 'albury', 'wodonga',
  'shepparton', 'mildura', 'warrnambool', 'traralgon', 'wagga wagga',
]

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

export type ExtractedFacts = {
  startDate: string
  venueName: string
  venueCity: string
  isFree: boolean
  prices: number[]
  capacity: number | null
}

/**
 * Facts a regular expression can read out of the organiser's own sentence.
 *
 * This exists so the no-AI floor is a REAL draft rather than a title and a
 * blob of text. It reads only what is unambiguous, and every value it returns
 * came from characters the organiser typed. Anything it is unsure of is left
 * empty for them, exactly like the model path.
 *
 * It is deliberately conservative: a wrong date on a published event is worse
 * than a missing one.
 */
export function extractFactsFallback(text: string, nowIso: string): ExtractedFacts {
  const hay = normalise(text)
  const facts: ExtractedFacts = {
    startDate: '', venueName: '', venueCity: '', isFree: false, prices: [], capacity: null,
  }

  // Prices. Every "$25" or "$25.50" in the text, deduplicated and sorted.
  const prices = [...text.matchAll(/\$\s?(\d+(?:\.\d{2})?)/g)]
    .map(m => Number(m[1]))
    .filter(n => Number.isFinite(n) && n >= 0 && n < 100000)
  facts.prices = Array.from(new Set(prices)).sort((a, b) => a - b)
  facts.isFree = facts.prices.length === 0 && /\bfree\b/.test(hay)

  // Capacity, when stated as a count of the thing being sold.
  const cap = hay.match(/\b(\d{1,6})\s*(?:tickets|seats|places|spots|capacity|kids|children|people|guests)\b/)
  if (cap) facts.capacity = Number(cap[1])

  // Venue: the proper noun after " at ", stopped at a connective or clause end.
  const venue = text.match(
    /\bat\s+((?:The\s+)?[A-Z][A-Za-z'&.-]*(?:\s+[A-Z][A-Za-z'&.-]*){0,4})/,
  )
  if (venue) {
    let name = venue[1]!.trim().replace(/[.,]$/, '')
    // A trailing recognised place name is the city, not part of the venue.
    for (const place of AU_PLACES) {
      const re = new RegExp(`\\s+${place}$`, 'i')
      if (re.test(name)) {
        facts.venueCity = place.replace(/\b\w/g, c => c.toUpperCase())
        name = name.replace(re, '').trim()
        break
      }
    }
    if (name.length >= 3) facts.venueName = name
  }
  if (!facts.venueCity) {
    const place = AU_PLACES.find(p => hay.includes(p))
    if (place) facts.venueCity = place.replace(/\b\w/g, c => c.toUpperCase())
  }

  // Date: an explicit "21 August" or "August 21", with the year inferred as the
  // next occurrence. Relative wording ("this Saturday") is deliberately NOT
  // resolved here, because guessing a date is the one mistake that ruins an
  // event, and the organiser is asked for it instead.
  const now = new Date(nowIso)
  const dayMonth =
    hay.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/) ??
    hay.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/)
  if (dayMonth && !Number.isNaN(now.getTime())) {
    const first = dayMonth[1]!
    const second = dayMonth[2]!
    const day = Number(/^\d+$/.test(first) ? first : second)
    const monthName = /^\d+$/.test(first) ? second : first
    const month = MONTHS.indexOf(monthName)
    if (month >= 0 && day >= 1 && day <= 31) {
      let year = now.getFullYear()
      if (new Date(year, month, day).getTime() < now.getTime() - 86400000) year += 1
      const time = readTime(hay)
      const p = (n: number) => String(n).padStart(2, '0')
      facts.startDate = `${year}-${p(month + 1)}-${p(day)}T${p(time.hour)}:${p(time.minute)}`
    }
  }

  return facts
}

/**
 * The start time, preferring an explicit show time over a door time, because
 * the start of the event is what a listing shows.
 */
function readTime(hay: string): { hour: number; minute: number } {
  const all = [...hay.matchAll(/\b(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)\b/g)].map(m => ({
    index: m.index ?? 0,
    hour: Number(m[1]),
    minute: m[2] ? Number(m[2]) : 0,
    meridiem: m[3]!,
  }))
  if (all.length === 0) return { hour: 19, minute: 0 }

  const showIdx = hay.search(/\b(show|starts|start|kick ?off|from)\b/)
  const preferred =
    (showIdx >= 0 ? all.find(t => t.index > showIdx) : undefined) ?? all[0]!

  let hour = preferred.hour % 12
  if (preferred.meridiem === 'pm') hour += 12
  return { hour, minute: preferred.minute }
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Does the weekday the organiser typed agree with the date they typed?
 *
 * Organisers routinely write "Friday 5 September" when the 5th is a Saturday.
 * Silently printing the true weekday makes the listing line contradict the
 * description directly under it, which reads as a fault in the product rather
 * than a typo in their sentence. So when the two disagree, the summary drops
 * the weekday entirely and the mismatch is surfaced for them to resolve.
 */
export function weekdayDisagrees(text: string, startDate: string): boolean {
  const stated = normalise(text).match(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  )
  if (!stated || !startDate) return false
  const d = new Date(startDate)
  if (Number.isNaN(d.getTime())) return false
  return WEEKDAYS[d.getDay()] !== stated[1]
}

export type SummaryFacts = {
  title: string
  description: string
  venueName: string
  venueCity: string
  startDate: string
  isFree: boolean
  lowestPrice: number | null
  currency: string
  /** Suppress the weekday when the organiser's stated day contradicts the date. */
  suppressWeekday?: boolean
}

/**
 * The 200-character short summary, composed from facts.
 *
 * This is the social preview and the search snippet, so it is written as its
 * own piece of copy and NEVER as a truncation of the description. The shape is
 * the one an experienced producer uses on a listing: what it is, where, when,
 * what it costs. Every clause is dropped whole rather than cut mid-word when
 * the budget runs out, so the result always reads as a finished sentence.
 */
export function buildSummaryFallback(facts: SummaryFacts): string {
  const where = [facts.venueName, facts.venueCity].filter(Boolean).join(', ')
  const when = facts.startDate ? dayAndTime(facts.startDate) : null

  const price = facts.isFree
    ? 'Free entry'
    : facts.lowestPrice != null && facts.lowestPrice > 0
      ? `Tickets from ${formatMoney(facts.lowestPrice, facts.currency)}`
      : ''

  // Shape: the practical anchor leads, then what it is, then the cost.
  //
  // Leading with WHERE and WHEN is what makes this its own piece of copy
  // rather than the top of the description repeated. A listing line that opens
  // with the same words as the description is a truncation by another name,
  // which is exactly the defect this field had (C2), so the order here is
  // load-bearing and the coverage test asserts it.
  const dayLabel = when
    ? facts.suppressWeekday
      ? when.day.replace(/^[A-Za-z]+\s+/, '')
      : when.day
    : ''
  const whenClause = dayLabel ? `${dayLabel} at ${when!.time}` : ''
  const anchor = [where, whenClause].filter(Boolean).join(', ')

  // What it is: the title, minus any leading venue or date wording that the
  // anchor already carried, so the line never says the same thing twice.
  const what = anchor && facts.title ? stripRepeated(facts.title, anchor) : facts.title

  const clauses = [anchor, what, price].filter(Boolean)

  let out = ''
  for (const clause of clauses) {
    const next = out ? `${out}. ${clause}` : clause
    if (next.length + 1 > 200) break
    out = next
  }
  return out ? `${out}.`.slice(0, 200) : ''
}

/**
 * Drop from `text` any clause the anchor already stated, so the listing line
 * never repeats the venue or the date it just gave.
 */
function stripRepeated(text: string, anchor: string): string {
  const anchorWords = new Set(normalise(anchor).split(' ').filter(w => w.length > 3))
  // Any clock time already in the anchor must not be repeated: a listing line
  // that says "at 8pm" and then "show starts 8pm" reads as a machine wrote it.
  const anchorTimes = new Set((anchor.toLowerCase().match(/\d{1,2}(?:[.:]\d{2})?\s*[ap]m/g) ?? []))
  const kept = text
    .split(/\s*(?:,|\bat\b|\bon\b)\s*/i)
    .map(part => part.trim())
    .filter(part => {
      if (!part) return false
      const lower = part.toLowerCase()
      // Drop a clause that only restates a time the anchor already carries.
      const times = lower.match(/\d{1,2}(?:[.:]\d{2})?\s*[ap]m/g) ?? []
      if (times.length > 0 && times.every(t => anchorTimes.has(t))) return false
      // Drop a bare weekday or date clause the anchor already carries.
      if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(lower)) return false
      const words = normalise(part).split(' ').filter(w => w.length > 3)
      if (words.length === 0) return false
      const overlap = words.filter(w => anchorWords.has(w)).length
      return overlap / words.length < 0.6
    })
  return kept.join(', ')
}

function formatMoney(amount: number, currency: string): string {
  const symbol = currency === 'AUD' || !currency ? '$' : `${currency} `
  return Number.isInteger(amount) ? `${symbol}${amount}` : `${symbol}${amount.toFixed(2)}`
}

export type TagFacts = {
  text: string
  categoryName: string
  venueCity: string
  startDate: string
}

/** Words that are never useful as a discovery tag on their own. */
const TAG_STOPWORDS = new Set([
  'event', 'events', 'night', 'day', 'the', 'and', 'with', 'from', 'this', 'that',
  'tickets', 'ticket', 'show', 'general', 'admission', 'doors', 'starts', 'start',
])

/**
 * Discovery tags, derived from what the organiser actually said.
 *
 * Tags are how an event is found by search and by the tag bridge that feeds
 * the community surfaces, so they are concrete nouns a real person would type,
 * never adjectives. Between four and eight, lowercase, deduplicated, and each
 * one traceable to the input, the resolved category, the city or the day.
 */
export function deriveTagsFallback(facts: TagFacts): string[] {
  const hay = normalise(facts.text)
  const tags: string[] = []
  const push = (t: string) => {
    const clean = t.trim().toLowerCase()
    if (!clean || clean.length < 3 || TAG_STOPWORDS.has(clean)) return
    // A tag is public, permanent discovery metadata, so it must never be one
    // of the words the anti-tell gate exists to keep out of our copy. Found by
    // reading real output: an organiser who wrote "Unlock an unforgettable
    // evening" had the last-resort word pass produce
    // ["unlock","unforgettable","evening","curated","journey","through"], which
    // is both junk as discovery metadata and the exact marketing voice the
    // platform rejects, published as though the platform had chosen it.
    if (findCopyTells(clean).length > 0) return
    if (!tags.includes(clean)) tags.push(clean)
  }

  // Format and genre words present in the organiser's own text.
  const VOCAB = [
    'stand up', 'comedy', 'improv', 'sketch', 'open mic', 'live comedy',
    'live music', 'gig', 'band', 'acoustic', 'dj', 'club night', 'techno', 'house',
    'afrobeats', 'amapiano', 'hip hop', 'jazz', 'soul', 'country', 'indie', 'rock',
    'theatre', 'cabaret', 'circus', 'poetry', 'exhibition', 'gallery',
    'market', 'night market', 'makers market', 'food truck', 'tasting', 'degustation',
    'workshop', 'masterclass', 'seminar', 'conference', 'networking', 'meetup',
    'fundraiser', 'charity', 'gala', 'auction',
    'yoga', 'pilates', 'meditation', 'wellness', 'retreat',
    'festival', 'family', 'kids', 'birthday party', 'school holiday',
    'football', 'cricket', 'netball', 'basketball', 'tournament',
  ]
  for (const term of VOCAB) if (hay.includes(term)) push(term)

  // The city is the single highest-value discovery tag in a local market.
  if (facts.venueCity) push(facts.venueCity)

  // The night of the week, which is how people actually plan.
  if (facts.startDate) {
    const parts = dayAndTime(facts.startDate)
    if (parts) push(parts.day.split(' ')[0]!)
  }

  // Still thin: pull the distinctive words the organiser actually used. A
  // promoter searching for their own night types the words they wrote, so
  // these are better tags than anything generic. Ordered by first appearance,
  // which is where the subject of the sentence lives.
  if (tags.length < 4) {
    const GENERIC = new Set([
      ...TAG_STOPWORDS, ...MONTHS,
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
      'only', 'including', 'include', 'includes', 'about', 'their', 'there',
      'your', 'ours', 'more', 'each', 'per', 'every', 'across', 'plus', 'also',
      'presale', 'door', 'entry', 'free', 'live', 'night', 'party', 'people',
    ])
    for (const word of hay.split(' ')) {
      if (tags.length >= 6) break
      const clean = word.replace(/[^a-z]/g, '')
      if (clean.length < 5 || GENERIC.has(clean)) continue
      push(clean)
    }
  }

  // The category name is the last resort so a one-line description still
  // yields a usable set rather than a blank field.
  if (tags.length < 4 && facts.categoryName) {
    for (const word of facts.categoryName.toLowerCase().split(/[^a-z]+/)) {
      if (word.length >= 4) push(word)
    }
  }

  return tags.slice(0, 8)
}

/**
 * High-precision community signals.
 *
 * A community tick puts an event on that community's landing page, so a wrong
 * tick misrepresents the organiser to a real community. Every pattern here is
 * an unmistakable marker: the community's own name, or a term that belongs to
 * no other community. Anything ambiguous is deliberately absent, because the
 * correct behaviour on a weak signal is to tick nothing and say so.
 */
const COMMUNITY_SIGNALS: { slug: string; match: RegExp }[] = [
  { slug: 'aboriginal-torres-strait-islander', match: /\b(aboriginal|torres strait|first nations|naidoc|indigenous|welcome to country|smoking ceremony)\b/ },
  { slug: 'african', match: /\b(african|afrobeats|amapiano|owambe|nigerian|ghanaian|kenyan|ethiopian|somali|sudanese)\b/ },
  { slug: 'caribbean', match: /\b(caribbean|dancehall|soca|reggae|jamaican|trinidadian|calypso)\b/ },
  { slug: 'indian', match: /\b(indian|bollywood|bhangra|diwali|holi|garba|raas|tamil|telugu|punjabi)\b/ },
  { slug: 'chinese', match: /\b(chinese|lunar new year|mid autumn|cantonese|mandarin|dragon dance)\b/ },
  { slug: 'filipino', match: /\b(filipino|filipina|pinoy|sinulog|opm|barrio fiesta)\b/ },
  { slug: 'latin-american', match: /\b(latin|latino|salsa|bachata|reggaeton|cumbia|mexican|brazilian|colombian)\b/ },
  { slug: 'vietnamese', match: /\b(vietnamese|tet festival|ao dai|v pop)\b/ },
  { slug: 'lebanese-levantine', match: /\b(lebanese|levantine|dabke|mahrajan|syrian|palestinian)\b/ },
  { slug: 'greek', match: /\b(greek|glendi|rebetiko|panigiri|bouzouki)\b/ },
  { slug: 'italian', match: /\b(italian|sagra|festa|opera italiana)\b/ },
  { slug: 'korean', match: /\b(korean|k pop|kpop|seollal|chuseok|hallyu)\b/ },
  { slug: 'japanese', match: /\b(japanese|matsuri|taiko|hanami|anime)\b/ },
  { slug: 'pacific-pasifika', match: /\b(pasifika|samoan|tongan|fijian|cook islands|polynesian)\b/ },
  { slug: 'maori', match: /\b(maori|kapa haka|matariki|te reo)\b/ },
  { slug: 'persian-iranian', match: /\b(persian|iranian|nowruz|yalda)\b/ },
  { slug: 'turkish', match: /\b(turkish|saz|sema|whirling)\b/ },
  { slug: 'arab', match: /\b(arabic|arab|egyptian|iraqi|khaleeji|oud|tarab)\b/ },
  { slug: 'other-south-asian', match: /\b(nepali|sri lankan|pakistani|bangladeshi|sinhala)\b/ },
  { slug: 'other-east-southeast-asian', match: /\b(thai|indonesian|malaysian|cambodian|lao|songkran)\b/ },
  { slug: 'other-european', match: /\b(german|polish|irish|ukrainian|balkan|serbian|croatian|oktoberfest|ceili)\b/ },
]

/**
 * Communities genuinely signalled by the text, constrained to the live allowed
 * slugs. Returns an empty array when nothing is unmistakable, which is the
 * correct and expected outcome for most events.
 */
export function detectCommunitiesFallback(text: string, allowedSlugs: string[]): string[] {
  const hay = normalise(text)
  const allowed = new Set(allowedSlugs)
  const hits: string[] = []
  for (const signal of COMMUNITY_SIGNALS) {
    if (!allowed.has(signal.slug)) continue
    if (signal.match.test(hay) && !hits.includes(signal.slug)) hits.push(signal.slug)
  }
  // More than three heritages on one event is a sign of loose matching rather
  // than a genuinely pan-community event, so the list is capped.
  return hits.slice(0, 3)
}
