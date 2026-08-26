import { enforceCopyLaws } from '@/lib/ai/sanitise'
import { findCopyTells } from '@/lib/ai/copy-tells'

/**
 * THE CAPTION ENGINE.
 *
 * The kit promised a complete set of promotional material and then left the
 * organiser writing every word themselves at eleven at night, which is the
 * part of the job they actually resent. This writes one caption per channel,
 * in that channel's register, from the organiser's own event fields.
 *
 * FIVE RULES.
 *
 * 1. Deterministic. No model call, no API key, no network. The same event
 *    produces the same captions every time, which means the kit renders in
 *    the same breath as the page and never fails open into an empty box.
 * 2. Nothing invented. Every clause is built from a field the organiser
 *    supplied. A missing venue removes the venue clause; it never becomes a
 *    guess. The organiser's own summary is quoted, never rewritten.
 * 3. The tracked link is in every caption. Each channel gets ITS OWN tracked
 *    short link, so a sale from the WhatsApp caption is attributed to
 *    WhatsApp and not to a general pool.
 * 4. The copy laws hold. Dashes and exclamation marks are stripped by the
 *    platform's own enforceCopyLaws, and every template string is asserted
 *    clean against the shared tell lexicon in tests.
 * 5. Registers are genuinely different. Instagram is short lines and a hashtag
 *    set with the link spelled out because Instagram captions are not tappable.
 *    LinkedIn is full sentences and no hashtag pile. X is inside 280
 *    characters. WhatsApp is one line, the way a promoter texts a group.
 */

export type CaptionPlatform =
  | 'instagram'
  | 'facebook'
  | 'x'
  | 'linkedin'
  | 'whatsapp'
  | 'email'

export type CaptionInput = {
  title: string
  /** The organiser's own short summary, when they have one. Never rewritten. */
  summary?: string | null
  /** For example "Saturday 12 September". */
  dateLabel: string
  /** For example "8:00 pm". */
  timeLabel?: string | null
  /** Short form for the tight channels, for example "Sat 12 Sep". */
  shortDateLabel?: string | null
  venueName?: string | null
  city?: string | null
  /** The live price line, for example "From $25" or "Free entry". */
  priceLabel: string
  organiserName: string
  /** Category slug, used to pick the register and the hashtag set. */
  categorySlug?: string | null
  /** Tracked short link per channel. A channel with no link falls back to the
   *  event URL, so a caption is never handed out without somewhere to buy. */
  links: Partial<Record<CaptionPlatform, string>> & { fallback: string }
}

export type Caption = {
  platform: CaptionPlatform
  /** Channel name for the UI. */
  label: string
  /** One line on why this caption reads the way it does. */
  register: string
  /** Email only. */
  subject?: string
  text: string
  characters: number
  /** Published ceiling where one exists, otherwise null. */
  limit: number | null
  /** The honest note about how this channel handles the link. */
  linkNote: string
}

/**
 * X publishes a 280 character standard post
 * (help.x.com/en/using-x/how-to-post). We count the URL at its literal length
 * rather than the shortened length X substitutes, which keeps us inside the
 * limit rather than exactly on it.
 */
const X_LIMIT = 280

type EventFamily =
  | 'music'
  | 'arts'
  | 'market'
  | 'workshop'
  | 'fundraiser'
  | 'family'
  | 'sports'
  | 'general'

/** Map the live category taxonomy onto the register families. */
export function eventFamily(categorySlug?: string | null): EventFamily {
  const slug = (categorySlug ?? '').toLowerCase()
  if (slug === 'music' || slug === 'nightlife' || slug === 'festival') return 'music'
  // `arts-culture` was renamed to `arts-community` when the banned word left the
  // data. This comparison was not renamed with it, so every arts event has been
  // falling through to the default family since. Measured against TEST on
  // 26 August 2026: event_categories holds 22 slugs and NONE contains "culture".
  if (slug === 'arts-community' || slug === 'film' || slug === 'fashion' || slug === 'pride') {
    return 'arts'
  }
  if (slug === 'food-drink') return 'market'
  if (slug === 'education' || slug === 'technology' || slug === 'health-wellness') return 'workshop'
  if (slug === 'charity') return 'fundraiser'
  if (slug === 'family') return 'family'
  if (slug === 'sports') return 'sports'
  return 'general'
}

function isFree(priceLabel: string): boolean {
  return /free/i.test(priceLabel)
}

/** What the audience is being asked to get. Varies by what the event is. */
function ticketNoun(family: EventFamily): string {
  switch (family) {
    case 'workshop':
      return 'Places'
    case 'market':
    case 'family':
      return 'Entry'
    default:
      return 'Tickets'
  }
}

/**
 * The price and the link as one line. A free event already says "Free entry",
 * so labelling the link "Entry" straight after read as a stutter: "Free entry.
 * Entry: ...". Free events point at details instead.
 */
function ticketLine(family: EventFamily, priceLabel: string, url: string): string {
  if (isFree(priceLabel)) return `${priceLabel}. Details: ${url}`
  return `${priceLabel}. ${ticketNoun(family)}: ${url}`
}

/** The closing nudge, one short clause, true for every event of that family. */
function closingLine(family: EventFamily, priceLabel: string): string {
  const free = /free/i.test(priceLabel)
  switch (family) {
    case 'music':
      return free
        ? 'Bring whoever you were going to text about it.'
        : 'Presale now, on the door if any are left.'
    case 'workshop':
      return 'Numbers are limited by the room.'
    case 'market':
      return 'Come early for the good stuff.'
    case 'family':
      return 'Little ones welcome.'
    case 'fundraiser':
      return 'Every ticket counts towards the night.'
    case 'sports':
      return 'Get in before it fills.'
    case 'arts':
      return 'Book the seats you want while they are open.'
    default:
      return free ? 'Free to attend, book so we can plan numbers.' : 'Book before the night sells out.'
  }
}

function slugToTag(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Hashtags, and only ones a person would actually type.
 *
 * The first version of this derived a tag from the category slug and produced
 * "#artsculture" for a comedy night: junk nobody follows, and a form of the
 * word the constitution bans outright. So tags now come from two places only:
 * the organiser's city, which is real and useful, and a short hand-written
 * word per event family. There is no path from a raw slug to a tag, and the
 * banned word cannot be reached.
 *
 * Three tags, not thirty. A wall of tags is the loudest signal that a caption
 * was machine made, which is the one thing these must never look like.
 */
const FAMILY_TAG: Record<EventFamily, string> = {
  music: 'livemusic',
  arts: 'whatson',
  market: 'localmarket',
  workshop: 'workshop',
  fundraiser: 'fundraiser',
  family: 'familyfun',
  sports: 'localsport',
  general: 'whatson',
}

export function buildHashtags(input: CaptionInput, max = 3): string[] {
  const tags: string[] = []
  const city = input.city ? slugToTag(input.city) : ''
  if (city) {
    tags.push(city)
    tags.push(`${city}events`)
  }
  tags.push(FAMILY_TAG[eventFamily(input.categorySlug)])
  const unique: string[] = []
  for (const tag of tags) {
    if (tag.length > 2 && !unique.includes(tag)) unique.push(tag)
  }
  return unique.slice(0, max).map(tag => `#${tag}`)
}

function placeClause(input: CaptionInput): string {
  return [input.venueName, input.city].filter(Boolean).join(', ')
}

function whenClause(input: CaptionInput): string {
  return [input.dateLabel, input.timeLabel].filter(Boolean).join(', ')
}

function linkFor(input: CaptionInput, platform: CaptionPlatform): string {
  return (input.links[platform] ?? input.links.fallback).replace(/\/$/, '')
}

/** Trim the organiser's own summary to one sentence for the tight channels. */
function firstSentence(summary: string, maxChars: number): string {
  const clean = summary.trim().replace(/\s+/g, ' ')
  const stop = clean.search(/[.?]\s|[.?]$/)
  const sentence = stop > 0 ? clean.slice(0, stop + 1) : clean
  if (sentence.length <= maxChars) return sentence
  const cut = sentence.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, '')}.`
}

function tidy(text: string): string {
  return enforceCopyLaws(text)
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Instagram: short lines, the link written out, a small tag set. */
function instagramCaption(input: CaptionInput): Caption {
  const family = eventFamily(input.categorySlug)
  const url = linkFor(input, 'instagram')
  const place = placeClause(input)
  // Title, place, time: three short stacked lines, the way a gig post is
  // actually written. Instagram truncates after the second line in the feed,
  // so the two lines that survive are the name and where it is.
  const lines: string[] = []
  lines.push(input.title)
  if (place) lines.push(place)
  lines.push(whenClause(input))
  lines.push('')
  if (input.summary) lines.push(firstSentence(input.summary, 180))
  lines.push(closingLine(family, input.priceLabel))
  lines.push('')
  lines.push(ticketLine(family, input.priceLabel, url))
  lines.push('')
  lines.push(buildHashtags(input).join(' '))
  const text = tidy(lines.join('\n'))
  return {
    platform: 'instagram',
    label: 'Instagram',
    register: 'Short lines, one thought each, the link spelled out because Instagram captions are not tappable.',
    text,
    characters: text.length,
    limit: null,
    linkNote:
      'Instagram does not make a link in a feed caption tappable, so the address is written out and the story link sticker carries the tap. Both point at the same tracked link.',
  }
}

/** Facebook: the link unfurls the designed card, so it closes the post. */
function facebookCaption(input: CaptionInput): Caption {
  const family = eventFamily(input.categorySlug)
  const url = linkFor(input, 'facebook')
  const place = placeClause(input)
  const lines: string[] = []
  lines.push(place ? `${input.title} is on at ${place}.` : `${input.title} is on.`)
  lines.push('')
  lines.push(`${whenClause(input)}. ${input.priceLabel}.`)
  if (input.summary) {
    lines.push('')
    lines.push(input.summary.trim())
  }
  lines.push('')
  lines.push(closingLine(family, input.priceLabel))
  lines.push('')
  lines.push(url)
  const text = tidy(lines.join('\n'))
  return {
    platform: 'facebook',
    label: 'Facebook',
    register: 'A full post with the link last, where Facebook turns it into the designed preview card.',
    text,
    characters: text.length,
    limit: null,
    linkNote:
      'Facebook unfurls this link into your invitation card automatically, so the address sits on its own line at the end.',
  }
}

/** X: inside the published 280, one tag at most, link last. */
function xCaption(input: CaptionInput): Caption {
  const family = eventFamily(input.categorySlug)
  const url = linkFor(input, 'x')
  const place = placeClause(input)
  const when = [input.shortDateLabel ?? input.dateLabel, input.timeLabel].filter(Boolean).join(', ')
  const tag = buildHashtags(input, 1)[0] ?? ''

  // Assembled longest first, then dropped in a fixed order until it fits, so
  // the result is deterministic rather than truncated mid-word.
  const candidates: string[][] = [
    [place ? `${input.title} at ${place}.` : `${input.title}.`, `${when}.`, ticketLine(family, input.priceLabel, url), tag],
    [place ? `${input.title} at ${place}.` : `${input.title}.`, `${when}.`, ticketLine(family, input.priceLabel, url)],
    [`${input.title}.`, `${when}. ${input.priceLabel}.`, url],
    [`${input.title}.`, url],
  ]
  const chosen =
    candidates.find(parts => tidy(parts.filter(Boolean).join(' ')).length <= X_LIMIT) ??
    candidates[candidates.length - 1]
  const text = tidy(chosen.filter(Boolean).join(' '))
  return {
    platform: 'x',
    label: 'X',
    register: 'One post, inside the published 280 characters, with the price and the link doing the work.',
    text,
    characters: text.length,
    limit: X_LIMIT,
    linkNote:
      'X counts a link as a fixed 23 characters, so this sits comfortably inside the limit even with the address written in full.',
  }
}

/** LinkedIn: full sentences, no tag pile, the professional frame. */
function linkedinCaption(input: CaptionInput): Caption {
  const url = linkFor(input, 'linkedin')
  const place = placeClause(input)
  const lines: string[] = []
  // An anonymous composer has no organiser name, so the old templates opened
  // with a dangling verb: "has opened ticket sales for ...". The event becomes
  // the subject when there is nobody to name.
  const org = (input.organiserName ?? '').trim()
  lines.push(
    isFree(input.priceLabel)
      ? org
        ? `${org} has announced ${input.title}.`
        : `${input.title} has been announced.`
      : org
        ? `${org} has opened ticket sales for ${input.title}.`
        : `Tickets are now on sale for ${input.title}.`,
  )
  lines.push('')
  lines.push(
    place
      ? `${whenClause(input)} at ${place}. ${input.priceLabel}.`
      : `${whenClause(input)}. ${input.priceLabel}.`,
  )
  if (input.summary) {
    lines.push('')
    lines.push(input.summary.trim())
  }
  lines.push('')
  lines.push(
    isFree(input.priceLabel) ? `Full details: ${url}` : `Full details and tickets: ${url}`,
  )
  const text = tidy(lines.join('\n'))
  return {
    platform: 'linkedin',
    label: 'LinkedIn',
    register: 'Whole sentences, the organiser named, no hashtag pile. It reads as an announcement rather than a flyer.',
    text,
    characters: text.length,
    limit: null,
    linkNote: 'LinkedIn previews the link into your invitation card when it sits in the post body.',
  }
}

/** WhatsApp: the way a promoter actually texts a group. One line. */
function whatsappCaption(input: CaptionInput): Caption {
  const family = eventFamily(input.categorySlug)
  const url = linkFor(input, 'whatsapp')
  const place = placeClause(input)
  const when = [input.shortDateLabel ?? input.dateLabel, input.timeLabel].filter(Boolean).join(', ')
  const opener = place ? `${input.title} at ${place}` : input.title
  const text = tidy(`${opener}, ${when}. ${ticketLine(family, input.priceLabel, url)}`)
  return {
    platform: 'whatsapp',
    label: 'WhatsApp',
    register: 'One line, no preamble, the way you would actually text a group chat.',
    text,
    characters: text.length,
    limit: null,
    linkNote: 'WhatsApp shows your invitation card under the message once the link is pasted.',
  }
}

/** Email: a subject that survives an inbox, and a short body. */
function emailCaption(input: CaptionInput): Caption {
  const family = eventFamily(input.categorySlug)
  const url = linkFor(input, 'email')
  const place = placeClause(input)
  const subject = `${input.title}, ${input.shortDateLabel ?? input.dateLabel}`
  const lines: string[] = []
  lines.push('Hello,')
  lines.push('')
  // Same dangling-verb fix as LinkedIn: with no organiser to name, the event
  // becomes the subject rather than the sentence starting mid-clause.
  const org = (input.organiserName ?? '').trim()
  lines.push(
    org
      ? place
        ? `${org} is putting on ${input.title} at ${place} on ${whenClause(input)}.`
        : `${org} is putting on ${input.title} on ${whenClause(input)}.`
      : place
        ? `${input.title} is on at ${place} on ${whenClause(input)}.`
        : `${input.title} is on ${whenClause(input)}.`,
  )
  if (input.summary) {
    lines.push('')
    lines.push(input.summary.trim())
  }
  lines.push('')
  lines.push(ticketLine(family, input.priceLabel, url))
  // The sign-off is omitted rather than left blank when there is no organiser
  // name: a trailing empty line reads as an unfinished email.
  if (org) {
    lines.push('')
    lines.push(org)
  }
  const text = tidy(lines.join('\n'))
  return {
    platform: 'email',
    label: 'Email',
    register: 'A subject line that reads in an inbox, and a body short enough to be read on a phone.',
    subject: tidy(subject),
    text,
    characters: text.length,
    limit: null,
    linkNote: 'The address is written in full so it survives a plain-text client.',
  }
}

export const CAPTION_ORDER: readonly CaptionPlatform[] = [
  'instagram',
  'facebook',
  'whatsapp',
  'x',
  'linkedin',
  'email',
]

/** Every caption for one event, in the order the kit presents them. */
export function buildCaptions(input: CaptionInput): Caption[] {
  return [
    instagramCaption(input),
    facebookCaption(input),
    whatsappCaption(input),
    xCaption(input),
    linkedinCaption(input),
    emailCaption(input),
  ]
}

/**
 * The template's own words, with the organiser's fields removed, for the test
 * that proves the engine never ships a tell of its own. The organiser's
 * summary is deliberately excluded: those are their words, in their voice, and
 * the platform does not rewrite them.
 */
export function captionTellCheck(captions: Caption[], summary?: string | null): string[] {
  const hits = new Set<string>()
  for (const caption of captions) {
    let body = caption.text
    if (summary) body = body.split(summary.trim()).join(' ')
    if (summary) body = body.split(firstSentence(summary, 180)).join(' ')
    for (const hit of findCopyTells(body)) hits.add(hit)
    if (caption.subject) for (const hit of findCopyTells(caption.subject)) hits.add(hit)
  }
  return [...hits]
}
