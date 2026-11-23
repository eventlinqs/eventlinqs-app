/**
 * THE PLAYBOOK, AS DATA (Lawal, 23 November 2026, 16:04, binding: "All these errors you're now finding from the engine's
 * work are the corrections you'll be making for the future, so that it doesn't repeat itself"; and 16:07: the rule covers
 * designing the posts too; PM-ORDER-EVENTLINQS-2-LAUNCH-8NOV.md under 'PM, 23 November 2026, 16:04' and '16:07'). Every
 * PM RETURN becomes three things in the same train: the code fix at its cause, a regression test that fails on the old
 * output, and a rule here with its reason.
 *
 * Versioned data only: nothing reads it yet. The creative engine's critic will read these rules when it lands; until then
 * the caption rules are held in code by their own tests (lifecycle-plan.ts feedNightDates, shown-organiser.ts nightMaker).
 * A rule is never edited away: a change is a new rule with its own date, and the one it replaces names it.
 */

export type PlaybookRule = {
  /** A stable name, never reused. */
  readonly id: string
  /** What the engine does, in one sentence. */
  readonly rule: string
  /** Why, in the words of the return or the review that set it. */
  readonly reason: string
  /** Where it was ruled: the return, review or ruling, with its time. */
  readonly source: string
  /** The day it was ruled, YYYY-MM-DD. */
  readonly date: string
}

/** The version of this list: the day of its newest rule. */
export const PLAYBOOK_VERSION = '2026-11-23'

const RETURN_1530 = "the PM's RETURN of 15:30 on piece da22e104 (A Moment of Sanity), 23 November 2026; Lawal's 16:04"
const REVIEW_1234 = "Lawal's review of the seven designs, 23 November 2026, 12:34 (DESIGN-REVIEW-SEVEN-23NOV.md)"
const DECISION_1247 = "Lawal's final creative decision, 23 November 2026, 12:47 (FINAL-CREATIVE-DECISION-23NOV.md)"
const INTAKE_2215 = "the PM's intake read of 23 November 2026, 22:15"

export const PLAYBOOK: readonly PlaybookRule[] = [
  {
    id: 'caption-feed-date-line',
    rule: "A feed post's date line is built from the event record's own date and times, in one format: '📅 Tuesday 24 November, 7pm to 9pm', the weekday once, the month in full, the end time when the record holds one; a night past midnight is dated by the day it starts, and a run reads as its run.",
    reason: "The line read '📅 Tuesday, Tue 24 Nov, 7pm to 9pm', which repeats the weekday; it must read '📅 Tuesday 24 November, 7pm to 9pm'.",
    source: RETURN_1530,
    date: '2026-11-23',
  },
  {
    id: 'caption-credit-names-the-organiser',
    rule: "A caption's 'Title, by ...' names the organiser the listing names (its organiser, or the host it records or its own words name, the organisation where a person is named with it), never the venue unless the venue is the organiser; with none named, the title stands alone.",
    reason: "'A Moment of Sanity, by Thornbury Apothecary' named the venue as the event's maker; the listing names Berenice Franklin of GroovyTown Wellbeing as host, so it must read 'A Moment of Sanity, by GroovyTown Wellbeing'.",
    source: RETURN_1530,
    date: '2026-11-23',
  },
  {
    id: 'design-no-repeat-of-the-poster',
    rule: "Never repeat on our own slide a fact the organiser's poster already shows (its name, description, date, time or venue); our slide adds what the poster does not say.",
    reason: "The organiser's original artwork already contains the event name, description, date and venue, and the EventLinqs design repeats some of that information; the engine should learn to distinguish information that must be repeated for clarity from information that merely takes up space.",
    source: `${REVIEW_1234}; ${DECISION_1247}`,
    date: '2026-11-23',
  },
  {
    id: 'design-comedy-no-cartoon',
    rule: 'Comedy artwork carries no cartoon illustration: an authentic, permitted photograph of a comedian performing or an audience laughing, and with none, a theatrical editorial treatment.',
    reason: 'The comedy cover still looks too cartoon-like; prefer authentic, permissioned performance photography, and if unavailable a more sophisticated editorial design rather than playful illustrations (the oversized cartoon microphone feels less premium).',
    source: `${DECISION_1247}; ${REVIEW_1234}`,
    date: '2026-11-23',
  },
  {
    id: 'design-overlapping-times-are-choices',
    rule: 'Shows whose times overlap are presented as choices, never as a sequential itinerary.',
    reason: 'The performances at 6:00, 7:00 or 9:30, 7:30 and 8:30 across different venues are overlapping options, not a practical hour by hour itinerary; someone following it could mistakenly assume they can attend all four.',
    source: REVIEW_1234,
    date: '2026-11-23',
  },
  {
    id: 'design-no-claim-the-record-does-not-prove',
    rule: "Make no claim the record does not prove: a count of rooms, stages or venues is the record's own count ('four rooms' is withdrawn when two of the four shows share a venue, and so is 'one stage').",
    reason: "Content accuracy: organiser claims and event facts must be verified against the record before publication; two of the four Friday shows are at Melbourne Recital Centre, so 'One Friday. Four rooms.' gave way to 'Four sounds.'.",
    source: `${REVIEW_1234}; ${DECISION_1247}; the PM's design rounds of 23 November 2026`,
    date: '2026-11-23',
  },
  {
    id: 'design-one-clear-action',
    rule: "Artwork carries one clear action, tickets through the 'link in bio', never more.",
    reason: 'Make the next step more prominent; the customer journey must be consistent, so the artwork never offers two ways to book.',
    source: `${REVIEW_1234}; ${DECISION_1247}`,
    date: '2026-11-23',
  },
  {
    id: 'design-seller-in-the-caption',
    rule: "The organiser's ticketing provider is named in the caption, never on our artwork; an organiser poster that names its own provider stays whole.",
    reason: 'EventLinqs must not imply that tickets are sold directly through EventLinqs unless that is true; the caption explains that EventLinqs helps people discover the event and that booking is completed through the organiser\'s ticketing provider.',
    source: `${REVIEW_1234}; ${DECISION_1247}`,
    date: '2026-11-23',
  },
  {
    id: 'no-relative-date',
    rule: "No relative date ('today', 'tonight', 'tomorrow', 'this weekend') in any feed caption or artwork: a feed post names its day and date.",
    reason: "The design said 'Tomorrow night', wording that must be checked against the actual publication date, not the design date; a feed post stays on the profile after its day.",
    source: `${REVIEW_1234}; the PM's 13:32 of 23 November 2026 ('no relative date')`,
    date: '2026-11-23',
  },
  {
    id: 'database-caption-marks-one-rule',
    rule: "The database refuses a caption's marks by the code's one rule: a long dash always, and an exclamation mark unless it is a letter written inside a word ('Holy Sh!t Improv'); every check written the same way on our social words takes the same rule.",
    reason: "The comedy weekend set was refused on production: 'new row for relation \"social_piece_revisions\" violates check constraint \"social_piece_revisions_caption_check\"', which refused every '!' while the code kept the show's own name; the code drew a caption the database would never keep.",
    source: INTAKE_2215,
    date: '2026-11-23',
  },
  {
    id: 'poster-drawn-whole',
    rule: "An organiser's poster (an asset typed artwork) is drawn as its own slide, whole: never cropped, no focal crop, nothing of ours over it or on its story; a photograph leads where both are permitted.",
    reason: "The lifecycle planner drew only assets typed 'photo', so A Moment of Sanity's poster (9080529b), rightly typed artwork, dropped out of the engine; Lawal's 13:41 and the PM's 13:55 item 3: 'The only thing kept whole is an organiser's POSTER'.",
    source: INTAKE_2215,
    date: '2026-11-23',
  },
]
