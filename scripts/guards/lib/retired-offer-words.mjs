/**
 * THE RETIRED OFFER'S WORDS, IN ONE FILE (Lawal, 15 November 2026, 00:37: "A GUARD that fails the build on any
 * organiser-facing text promising free months, fee-free months, referral months or 'Founding Organiser' as a perk (a
 * word list in one file, with its drill), so the old offer can never come back by accident").
 *
 * LAW 24 was retired at 00:19 the same day: every organiser pays the platform fee from day one. These are the ways the
 * old offer was said on the live site (read by the PM on www.eventlinqs.com.au/organisers at 00:38) and in the code
 * that rendered it. scripts/guards/no-free-months-promise.mjs reads this list; a new way of saying it is added HERE.
 *
 * Free events stay free, so "zero platform fees on free events" is the live rule and is not on this list.
 */

const COUNT = String.raw`(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`

/** Each phrase, named, so a failure says which way the offer came back. */
export const RETIRED_OFFER_WORDS = [
  { name: 'free months', pattern: new RegExp(String.raw`\b${COUNT}\s+(?:more\s+|extra\s+|further\s+)?(?:fee[- ]free|free)\s+months?\b`, 'i') },
  { name: 'months free', pattern: /\bmonths?\s+(?:completely\s+)?(?:fee[- ]free|free)\b/i },
  { name: 'months on us', pattern: /\bmonths?\s+(?:are\s+)?on\s+us\b/i },
  { name: 'no platform fee for the first months', pattern: /\b(?:no|zero)\s+platform\s+fees?\s+for\s+(?:the\s+|your\s+|their\s+)?first\b/i },
  { name: 'the first months', pattern: new RegExp(String.raw`\bfirst\s+${COUNT}\s+months\b`, 'i') },
  { name: 'months with no platform fee', pattern: /\bmonths?\s+with\s+no\s+platform\s+fees?\b/i },
  { name: 'referral months', pattern: /\breferral\s+months?\b/i },
  { name: 'the free months end', pattern: /\bfree\s+months\s+end\b/i },
  { name: 'every organiser is a Founding Organiser', pattern: /\bevery\s+organiser\s+is\s+a\s+Founding\s+Organiser\b/i },
  { name: 'Founding Organiser as a perk', pattern: /\bFounding\s+Organiser\s+(?:offer|terms|programme|program|perk|spots?|places?)\b/i },
  { name: 'the first organisers get the terms', pattern: /\bfirst\s+organisers\s+get\s+the\s+terms\b/i },
  { name: 'a fee-free window or period', pattern: /\bfee[- ]free\s+(?:window|period)s?\b/i },
]

/**
 * The offer module's own words. Outside the files below, rendering any of them puts the old offer back on a page.
 */
export const RETIRED_OFFER_NAMES = /\b(?:FOUNDING_TERMS|FOUNDING_INITIAL_MONTHS_WORD|FOUNDING_REFERRAL_MONTHS_WORD)\b/

/**
 * THE RECORD OF THE CLOSED OFFER, by file, each with the reason it may say the words and the exact number of lines it
 * holds. One more line fails; one fewer fails too, as rot, so the list cannot outlive what it excuses.
 */
export const OFFER_RECORD = [
  {
    file: 'src/lib/payments/founding-waiver.ts',
    reason: 'the one module: the closed offer kept as the record, the switch FOUNDING_OFFER_OPEN, and the kept window\'s words',
  },
  {
    file: 'src/lib/organisers/founding-offer.ts',
    reason: 'the organisers band, closed with the offer (enabled: FOUNDING_OFFER_OPEN), kept so it can be read',
  },
  {
    file: 'src/lib/forecast/present.ts',
    reason: 'the forecast\'s second figure and sentence, drawn only while FOUNDING_OFFER_OPEN (src/app/forecast/page.tsx)',
  },
  {
    file: 'src/app/legal/organiser-terms/page.tsx',
    reason: 'the organiser agreement of 15 November 2026: the dated record of the closed offer for those who registered under it',
  },
  {
    file: 'src/app/admin/(authed)/network/founding-terms.tsx',
    reason: 'the owner\'s screen of the kept windows (admin only)',
  },
  {
    file: 'src/app/admin/(authed)/network/page.tsx',
    reason: 'the owner\'s screen of the kept windows (admin only)',
  },
  {
    file: 'src/lib/flags/broadcast.ts',
    reason: 'the founding_open switch\'s record (admin only)',
  },
]
