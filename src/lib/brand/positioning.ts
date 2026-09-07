/**
 * THE POSITIONING, AS ONE SOURCE.
 *
 * WHY THIS FILE EXISTS. The owner's ruling of 7 September 2026 states the
 * category plainly: EventLinqs is NOT a ticketing platform, it is the platform
 * where events get made, and the phrases "ticketing platform" and "ticket
 * seller" are never used for us in copy, metadata, social cards, emails or the
 * About page.
 *
 * When that ruling arrived the platform described itself as "The ticketing
 * platform built for every community" in FIFTEEN separate source files: the root
 * title tag, the Open Graph and Twitter cards, the homepage hero, the site
 * footer, the auth shell, the About, Press, Careers and Events metadata, the
 * site JSON-LD (which production was serving inside its Organization schema),
 * the help centre, and four transactional email footers. Fifteen literals is
 * how a positioning decision half-lands: someone changes the hero, the emails
 * keep saying the old thing for another year, and nobody notices because prose
 * is not executed.
 *
 * So the strapline, the tagline, the promise and the positioning statement live
 * here once and every surface imports them. `scripts/guards/positioning-lock.mjs`
 * fails the build if a user-facing surface calls the platform a ticketing
 * platform or a ticket seller again.
 *
 * THE TAGLINE IS UNCHANGED by that ruling and by CLAUDE.md. It is here so the
 * two lines sit beside each other and cannot drift apart, not because it is new.
 */

/** The tagline. Locked in CLAUDE.md and restated UNCHANGED by the 7 September ruling. */
export const BRAND_TAGLINE = 'Every community. Every event. One platform.'

/**
 * The tagline with each PHRASE bound by a non-breaking space, which is what the
 * homepage hero renders.
 *
 * Not decoration: close-out C17.4 measured "platform." orphaning onto its own
 * line at 390 and 768. Binding inside each phrase makes the headline wrap phrase
 * by phrase, so it can break after "community." or "event." and never leave one
 * word alone. It is derived from the tagline above rather than typed again, so
 * the two can never drift into saying different things.
 */
export const BRAND_TAGLINE_PHRASE_BOUND = BRAND_TAGLINE.split('. ')
  .map(phrase => phrase.replace(/ /g, ' '))
  .join('. ')

/** The promise, in the owner's own three words. */
export const BRAND_PROMISE = "You've got help."

/**
 * The strapline: the one-line self-description that replaces "The ticketing
 * platform built for every community" everywhere it stood. It says the category
 * (the place an event gets made) and keeps the community-first identity that the
 * ruling explicitly reinforces rather than replaces.
 */
export const BRAND_STRAPLINE = 'The place events get made, for every community.'

/**
 * The same line for a slot that already carries the brand name beside it, so a
 * title tag does not read "EventLinqs | The place events get made" twice over.
 */
export const BRAND_STRAPLINE_SHORT = 'Where events get made, for every community'

/** The positioning statement, verbatim from the ruling. */
export const BRAND_POSITIONING_STATEMENT =
  'For anyone putting on an event in Australia, EventLinqs is the one place it gets made. ' +
  'Find your suppliers, book them, sell your tickets, run your door, get paid. ' +
  'Unlike ticketing platforms that stop at the checkout, EventLinqs helps you put the event on.'

/**
 * What the platform does, as a sentence for a meta description or an assistant
 * prompt. It names the whole arc the ruling names, in order, because the arc IS
 * the category: ticketing is one module of it.
 */
export const BRAND_CATEGORY_LINE =
  'EventLinqs is where events get made: find your suppliers, sell your tickets, run your door and get paid, ' +
  'for every community in Australia.'

/**
 * The phrases that may never describe EventLinqs. Exported so the guard, the
 * tests and any future surface read the same list rather than three copies of it.
 * Describing a COMPETITOR with these words is allowed and is not what this
 * governs; the guard draws that line by requiring a self-referential subject.
 */
export const BANNED_SELF_DESCRIPTIONS = ['ticketing platform', 'ticket seller'] as const
