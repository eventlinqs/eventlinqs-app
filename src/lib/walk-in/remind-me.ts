/**
 * REMIND ME: THE WORDS, IN ONE VERSIONED PLACE (WI1, 21 October 2026).
 *
 * WI1-ITEM.md, point 3: Remind me "takes an email with the purpose stated beside
 * the button" and "is stored as a reminder request for that one event. It is
 * never a marketing consent." It sends at most two messages: the full program
 * once, when the organiser publishes it, and one reminder the day before.
 *
 * The line beside the button IS the consent the person gives, so it is stored on
 * the row exactly as they read it, with the version it came from. Operating rule
 * 6 of 25 September 2026: "Legal and consent wording is versioned, never edited.
 * A change is a new dated version, and every existing consent keeps the wording
 * the person agreed to." A change to any sentence below is a new version here,
 * and rows already stored keep the words they carry.
 *
 * A leaf: no imports, so the client form and the server action read one copy.
 */

export const REMIND_ME_CONSENT_VERSION = 'remind-me-v1-2026-10-21'

/** The heading above the email box, before and after the organiser publishes the program. */
export function remindMeHeading(programPublished: boolean): string {
  return programPublished ? 'Get a reminder the day before' : 'Get the program when it lands'
}

/**
 * The purpose, stated beside the button, in the item's own words with the
 * organiser's name filled in. Once the program is out there is no program
 * update left to send, so the sentence promises only what is still true.
 */
export function remindMePurpose(organiserName: string, programPublished: boolean): string {
  if (programPublished) return 'We send one reminder the day before. Nothing else.'
  return `We send the full timetable when ${organiserName} releases it, and one reminder the day before. Nothing else.`
}

/** What the person sees once their request is stored, and what a bot sees too. */
export const REMIND_ME_DONE = 'Done. We will send only what is promised above.'

/**
 * The hidden field a person never fills (WI1, Lawal's change 4 of 21 October
 * 2026). A submission that fills it gets REMIND_ME_DONE and stores nothing. The
 * name is chosen to be one no browser autofills.
 */
export const REMIND_ME_TRAP_FIELD = 'remind_extra_note'
