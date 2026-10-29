import { fromZonedInputValue } from '@/lib/dates/event-time'
import { FREE_REGISTRATION_REQUIRED } from '@/lib/events/cta'

/**
 * AN ORGANISER'S SUBMISSION OF AN OUTSIDE EVENT (release checklist H1, the project manager's 13:10 of 28 October
 * 2026: "a form: event, booking link, photo they own, permission line, into the review queue").
 *
 * The rules, pure, so the form, its server action and the tests read one judgement. What passes becomes one row of
 * listing_submissions (supabase/migrations/20261028140201), which holds the same rules again; nothing is published
 * until a person accepts it in /admin/submissions.
 *
 * Section B's content truth starts here: the entry is said by the organiser (free, free with registration, paid),
 * never inferred from a missing price, and a price is taken only for a paid event.
 */

export const SUBMISSION_CITIES = ['melbourne', 'geelong', 'ballarat', 'bendigo'] as const
export type SubmissionCity = (typeof SUBMISSION_CITIES)[number]
export const SUBMISSION_CITY_WORDS: Readonly<Record<SubmissionCity, string>> = {
  melbourne: 'Melbourne',
  geelong: 'Geelong',
  ballarat: 'Ballarat',
  bendigo: 'Bendigo',
}

export const SUBMISSION_ROLES = ['organiser', 'venue', 'promoter'] as const
export type SubmissionRole = (typeof SUBMISSION_ROLES)[number]
export const SUBMISSION_ROLE_WORDS: Readonly<Record<SubmissionRole, string>> = {
  organiser: 'I organise it',
  venue: 'It is at my venue',
  promoter: 'I promote it',
}

export const SUBMISSION_ENTRIES = ['free', 'free_registration', 'paid'] as const
export type SubmissionEntry = (typeof SUBMISSION_ENTRIES)[number]
export const SUBMISSION_ENTRY_WORDS: Readonly<Record<SubmissionEntry, string>> = {
  free: 'Free, no registration',
  free_registration: FREE_REGISTRATION_REQUIRED,
  paid: 'Paid tickets',
}

/**
 * The permission line, Lawal's own words (the release checklist's K4, 28 October 2026, 14:33), as the project
 * manager's 14:53 words it for every place it is asked (this form, the partner kit, outreach), kept on every row in
 * exactly these words with the moment it was given. A new wording is a new constant, so a row always says what its
 * sender agreed to.
 */
export const PERMISSION_WORDS =
  "Yes, you're welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events."

/** K4's "with authority confirmed": the sender says they may give that permission. */
export const AUTHORITY_WORDS = 'I organise this event, or act for its organiser or venue, and I can give this permission.'

/** Asked only when a photo is sent; a submission never needs one (K: discovery never stops for want of an image). */
export const PHOTO_OWNED_WORDS = 'I own this photo or have the right to share it.'

export const SUBMISSION_ZONE = 'Australia/Melbourne'

/** The furthest ahead an event may start, so a mistyped year is caught. */
const FURTHEST_AHEAD_DAYS = 548

export interface SubmissionInput {
  readonly name: string
  readonly email: string
  readonly role: string
  readonly title: string
  readonly startsLocal: string
  readonly endsLocal: string
  readonly venueName: string
  readonly venueAddress: string
  readonly city: string
  readonly bookingUrl: string
  readonly entry: string
  readonly price: string
  readonly description: string
  /** Whether a photo came with the submission; it is never required. */
  readonly hasPhoto: boolean
  readonly photoOwned: boolean
  readonly authority: boolean
  readonly permission: boolean
}

export interface SubmissionRow {
  readonly name: string
  readonly email: string
  readonly role: SubmissionRole
  readonly title: string
  readonly starts_at: string
  readonly ends_at: string | null
  readonly venue_name: string
  readonly venue_address: string
  readonly city_slug: SubmissionCity
  readonly booking_url: string
  readonly entry: SubmissionEntry
  readonly price_from_cents: number | null
  readonly description: string | null
  readonly photo_owned: boolean
  readonly authority_confirmed: true
  readonly permission_words: string
  readonly permission_given_at: string
}

export type SubmissionJudgement = { readonly ok: true; readonly row: SubmissionRow } | { readonly ok: false; readonly problem: string }

const within = (s: string, most: number) => s.trim().length > 0 && s.trim().length <= most

function httpsAddress(v: string): string | null {
  const t = v.trim()
  if (t.length === 0 || t.length > 2000 || /\s/.test(t)) return null
  try {
    const u = new URL(t)
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : null
  } catch {
    return null
  }
}

/** Dollars as typed ("35", "35.50", "$35") to cents; null for anything else. */
export function priceCents(v: string): number | null {
  const m = /^\$?\s*(\d{1,5})(?:\.(\d{1,2}))?$/.exec(v.trim())
  if (!m) return null
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0)
  return cents > 0 ? cents : null
}

export function judgeSubmission(input: SubmissionInput, now: Date): SubmissionJudgement {
  const no = (problem: string): SubmissionJudgement => ({ ok: false, problem })
  if (!within(input.name, 120)) return no('Give your name.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim()) || input.email.trim().length > 320) return no('Give an email address we can reply to.')
  if (!(SUBMISSION_ROLES as readonly string[]).includes(input.role)) return no('Say how you are connected to the event.')
  if (!within(input.title, 200)) return no('Give the name of the event.')

  const startsAt = fromZonedInputValue(input.startsLocal, SUBMISSION_ZONE)
  if (startsAt === '') return no('Give the date and time the event starts.')
  const starts = new Date(startsAt).getTime()
  if (starts <= now.getTime()) return no('The start is in the past. Give a date and time still to come.')
  if (starts > now.getTime() + FURTHEST_AHEAD_DAYS * 86_400_000) return no('The start is more than 18 months away. Check the year.')
  let endsAt: string | null = null
  if (input.endsLocal.trim() !== '') {
    endsAt = fromZonedInputValue(input.endsLocal, SUBMISSION_ZONE)
    if (endsAt === '') return no('Give the end as a date and time, or leave it empty.')
    if (new Date(endsAt).getTime() <= starts) return no('The end comes before the start.')
  }

  if (!within(input.venueName, 160)) return no('Give the name of the venue.')
  if (!within(input.venueAddress, 300)) return no('Give the venue address.')
  if (!(SUBMISSION_CITIES as readonly string[]).includes(input.city)) return no('Choose the city it is in.')

  const bookingUrl = httpsAddress(input.bookingUrl)
  if (bookingUrl === null) return no('Give the booking or event page as a full https address.')
  if (/(^|\.)eventlinqs\.com(\.au)?$/i.test(new URL(bookingUrl).hostname)) return no('Give the page where people book, not an EventLinqs page.')

  if (!(SUBMISSION_ENTRIES as readonly string[]).includes(input.entry)) return no('Say whether entry is free, free with registration, or paid.')
  const entry = input.entry as SubmissionEntry
  let price: number | null = null
  if (input.price.trim() !== '') {
    if (entry !== 'paid') return no('A price is only for paid tickets. Clear it, or choose paid tickets.')
    price = priceCents(input.price)
    if (price === null) return no('Give the lowest ticket price in dollars, for example 35 or 35.50.')
  }

  const description = input.description.trim()
  if (description.length > 2000) return no('Keep the description under 2,000 characters.')

  if (input.hasPhoto && !input.photoOwned) return no('Confirm you own the photo or have the right to share it, or send the event without it.')
  if (!input.authority) return no('Confirm you can give permission for this event.')
  if (!input.permission) return no('Give your permission for EventLinqs to use your promotional material.')

  return {
    ok: true,
    row: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role as SubmissionRole,
      title: input.title.trim(),
      starts_at: startsAt,
      ends_at: endsAt,
      venue_name: input.venueName.trim(),
      venue_address: input.venueAddress.trim(),
      city_slug: input.city as SubmissionCity,
      booking_url: bookingUrl,
      entry,
      price_from_cents: price,
      description: description === '' ? null : description,
      photo_owned: input.hasPhoto && input.photoOwned,
      authority_confirmed: true,
      permission_words: PERMISSION_WORDS,
      permission_given_at: now.toISOString(),
    },
  }
}
