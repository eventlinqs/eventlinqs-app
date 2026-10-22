import { lineProblems } from '@/lib/events/eventlinqs-listing-words'
import { localDate } from '@/lib/walk-in/dates'
import { seriesProblem, weekdayOf, type SeriesRule } from './occurrences'

/**
 * WHAT ONE ROW OF A CHECKED LISTINGS FILE MAY BECOME (WI2 Part 1,
 * docs/walk-in/WI2-PLAN.md section 6).
 *
 * The project manager's checked files in C:\dev\design\listings are judged row
 * by row here, before anything is written: each row is IMPORT or REFUSED (a
 * rule it breaks, named), under the plan's rules and the 21 October 22:25
 * answers to its section 12 questions. Nothing is guessed or mended: the file is never
 * edited, and a value the file does not give is never invented, so a row is
 * either taken as written or reported for the project manager to set.
 *
 * Pure, so its own test drives every rule and the import script (which writes)
 * and its dry run (which only reports) share one judgement.
 */

/**
 * The columns: the 19 of the project manager's Melbourne file, plus the four
 * the project manager named on 22 October (23:45): city, frequency,
 * instagram_post and venue_email. Order is not judged; the set is.
 */
export const LISTING_COLUMNS = [
  'city',
  'date',
  'day',
  'start',
  'finish',
  'frequency',
  'name',
  'host',
  'address',
  'suburb',
  'category',
  'entry',
  'age_limit',
  'what_happens',
  'website',
  'instagram',
  'instagram_post',
  'venue_email',
  'facebook',
  'source_url',
  'source_date',
  'freshness',
  'notes',
] as const
export type ListingColumn = (typeof LISTING_COLUMNS)[number]

/** A source older than this is not confirmed (the 21-day rule, WI2-ITEM.md). */
export const SOURCE_MAX_AGE_DAYS = 21

const FREQUENCY_TO_RULE: Record<string, SeriesRule> = {
  once: 'once',
  weekly: 'weekly',
  fortnightly: 'fortnightly',
  'monthly-1st': 'monthly-1',
  'monthly-2nd': 'monthly-2',
  'monthly-3rd': 'monthly-3',
  'monthly-4th': 'monthly-4',
  'monthly-last': 'monthly-last',
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const AGE: Record<string, number | null> = { '': null, 'all ages': 0, '16+': 16, '18+': 18 }
/** Google: "Don't mark business hours as events", "Don't mark coupons or vouchers as events". The plain cases only. */
const NOT_AN_EVENT = /happy hour|% off|\bopen from\b/i
/** Free walk-in entry, as the files write it: nothing to book, register or pay. */
const FREE_WALK_IN = /^free(;\s*no booking required)?$/i
const BOOKING = /\bbook|\bregist|\brsvp\b|\breserv|\bticket/i
const DONATION = /donation|pay as you feel|gold coin/i

export type ListingRow = {
  citySlug: string
  date: string
  rule: SeriesRule
  startsAt: string
  endsAt: string | null
  name: string
  host: string
  address: string
  suburb: string
  categorySlug: string
  ageRestrictionMin: number | null
  summary: string
  websiteUrl: string | null
  instagramHandle: string | null
  instagramPostUrl: string | null
  venueEmail: string | null
  /** Entry is free and the source calls the donation optional (answer 5); the page says so. */
  donationOptional: boolean
  sourceUrl: string
  sourceDate: string
}

export type RowVerdict =
  | { verdict: 'import'; row: ListingRow }
  | { verdict: 'refused'; reasons: string[] }

export type JudgeContext = {
  now: Date
  /** The live event_categories slugs. */
  categorySlugs: ReadonlySet<string>
  /** The guide cities (free_guide on), slug to IANA zone. */
  guideCities: ReadonlyMap<string, string>
}

/** "7pm" or "6:30pm" (the form the files write), as "HH:MM"; null when it is not that form. */
export function clockFrom12h(text: string): string | null {
  const m = /^(1[0-2]|[1-9])(?::([0-5]\d))?\s*(am|pm)$/i.exec(text.trim())
  if (!m) return null
  const hour12 = Number(m[1]) % 12
  const hour = m[3].toLowerCase() === 'pm' ? hour12 + 12 : hour12
  return `${String(hour).padStart(2, '0')}:${m[2] ?? '00'}`
}

/** RFC 4180: quoted fields, commas and line breaks inside quotes, "" for a quote. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

/** Why a header is not the file's columns, or null. */
export function headerProblem(header: readonly string[]): string | null {
  const got = new Set(header.map((h) => h.trim()))
  const missing = LISTING_COLUMNS.filter((c) => !got.has(c))
  const unknown = [...got].filter((c) => !(LISTING_COLUMNS as readonly string[]).includes(c))
  const parts = []
  if (missing.length) parts.push(`missing ${missing.join(', ')}`)
  if (unknown.length) parts.push(`not columns of this file: ${unknown.join(', ')}`)
  if (got.size !== header.length) parts.push('a column is named twice')
  return parts.length ? `the header is not the listings columns (${parts.join('; ')})` : null
}

const isHttpsUrl = (v: string) => {
  try {
    return new URL(v).protocol === 'https:'
  } catch {
    return false
  }
}
const isHttpUrl = (v: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol)
  } catch {
    return false
  }
}

/** One row, as named columns, judged. */
export function judgeRow(record: Readonly<Record<string, string>>, ctx: JudgeContext): RowVerdict {
  const v = (c: ListingColumn) => (record[c] ?? '').trim()
  const refused: string[] = []

  const city = v('city')
  const zone = ctx.guideCities.get(city)
  if (!zone) refused.push(`city "${city}" is not a guide city (${[...ctx.guideCities.keys()].join(', ')})`)

  const date = v('date')
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
  if (!dateOk) refused.push(`date "${date}" is not YYYY-MM-DD`)
  else if (v('day') !== DAYS[weekdayOf(date)]) refused.push(`day "${v('day')}" is not ${date}'s weekday (${DAYS[weekdayOf(date)]})`)

  const startsAt = clockFrom12h(v('start'))
  if (!startsAt) refused.push(`start "${v('start')}" is not a time like 7pm or 6:30pm`)
  // Answer 1: a night with no finish imports with none, and the page says
  // "From 6:30pm"; a finish is never made up.
  let endsAt: string | null = null
  if (v('finish') !== '') {
    endsAt = clockFrom12h(v('finish'))
    if (!endsAt) refused.push(`finish "${v('finish')}" is not a time like 10pm`)
  }

  const rule = FREQUENCY_TO_RULE[v('frequency')]
  if (!rule) refused.push(`frequency "${v('frequency')}" is not one of ${Object.keys(FREQUENCY_TO_RULE).join(', ')}`)
  else if (dateOk && startsAt && zone) {
    const problem = seriesProblem({ rule, anchorDate: date, startsAt, endsAt, timezone: zone })
    if (problem) refused.push(problem)
  }

  const name = v('name')
  if (!name) refused.push('name is empty')
  else if (name.length > 80) refused.push(`name is ${name.length} characters, over 80`)
  for (const c of ['host', 'address', 'suburb'] as const) if (!v(c)) refused.push(`${c} is empty`)

  const category = v('category')
  if (!ctx.categorySlugs.has(category)) refused.push(`category "${category}" is not one of the live category slugs (the project manager sets it)`)

  // Answer 2: a free event that needs a booking is WI3's, never this import's.
  // Answer 5: a donation only where entry is free and the source calls it optional.
  const entry = v('entry')
  let donationOptional = false
  if (!FREE_WALK_IN.test(entry)) {
    if (BOOKING.test(entry)) refused.push(`entry "${entry}" needs a booking, registration, RSVP or ticket: WI3 lists these, the WI2 import does not`)
    else if (DONATION.test(entry) && /^free\b/i.test(entry) && /\boptional\b/i.test(entry)) donationOptional = true
    else if (DONATION.test(entry)) refused.push(`entry "${entry}" asks for a donation that is not said to be optional`)
    else refused.push(`entry "${entry}" is not free walk-in entry`)
  }

  const ageKey = v('age_limit').toLowerCase()
  if (!(ageKey in AGE)) refused.push(`age_limit "${v('age_limit')}" is not blank, all ages, 16+ or 18+`)

  const summary = v('what_happens')
  if (!summary) refused.push('what_happens is empty')
  else for (const p of lineProblems(summary)) refused.push(`what_happens: ${p}`)
  if (NOT_AN_EVENT.test(name) || NOT_AN_EVENT.test(summary)) refused.push('it reads as opening hours, a happy hour or a discount, which is not an event')

  const website = v('website')
  if (website && !isHttpsUrl(website)) refused.push(`website "${website}" is not an https address`)
  const handle = v('instagram')
  if (handle && (handle.length > 64 || /[\s/@?#]/.test(handle))) refused.push(`instagram "${handle}" is not a bare handle (no @, no spaces or slashes)`)
  const post = v('instagram_post')
  if (post && !/^https:\/\/www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\/?(\?.*)?$/.test(post)) refused.push(`instagram_post "${post}" is not an Instagram post or reel address`)
  const email = v('venue_email')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) refused.push(`venue_email "${email}" is not an email address`)

  const sourceUrl = v('source_url')
  if (!isHttpUrl(sourceUrl)) refused.push(`source_url "${sourceUrl}" is not a web address`)
  const sourceMatch = /^(?:read )?(\d{4}-\d{2}-\d{2})$/.exec(v('source_date'))
  const sourceDate = sourceMatch?.[1] ?? ''
  if (!sourceMatch) refused.push(`source_date "${v('source_date')}" is not a date`)
  else if (zone) {
    const today = localDate(ctx.now.toISOString(), zone) ?? ''
    if (sourceDate > today) refused.push(`source_date ${sourceDate} is in the future`)
    else if ((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${sourceDate}T00:00:00Z`)) / 86_400_000 > SOURCE_MAX_AGE_DAYS)
      refused.push(`source_date ${sourceDate} is older than ${SOURCE_MAX_AGE_DAYS} days`)
  }
  if (v('freshness') !== 'CURRENT') refused.push(`freshness "${v('freshness')}" is not CURRENT`)

  if (refused.length) return { verdict: 'refused', reasons: refused }
  return {
    verdict: 'import',
    row: {
      citySlug: city,
      date,
      rule: rule!,
      startsAt: startsAt!,
      endsAt,
      name,
      host: v('host'),
      address: v('address'),
      suburb: v('suburb'),
      categorySlug: category,
      ageRestrictionMin: AGE[ageKey] ?? null,
      summary,
      websiteUrl: website || null,
      instagramHandle: handle || null,
      instagramPostUrl: post || null,
      venueEmail: email || null,
      donationOptional,
      sourceUrl,
      sourceDate,
    },
  }
}

export type FileJudgement = {
  headerProblem: string | null
  rows: Array<{ line: number; name: string } & RowVerdict>
  counts: { import: number; refused: number }
}

/** A whole file: the header first (a wrong header refuses every row), then each row. */
export function judgeFile(text: string, ctx: JudgeContext): FileJudgement {
  const [header = [], ...body] = parseCsv(text)
  const problem = headerProblem(header)
  const counts = { import: 0, refused: 0 }
  if (problem) return { headerProblem: problem, rows: [], counts }
  const rows = body.map((cells, i) => {
    const record = Object.fromEntries(header.map((h, k) => [h.trim(), cells[k] ?? '']))
    const judged = judgeRow(record, ctx)
    counts[judged.verdict] += 1
    return { line: i + 2, name: (record.name ?? '').trim(), ...judged }
  })
  return { headerProblem: null, rows, counts }
}
