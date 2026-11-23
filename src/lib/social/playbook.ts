/**
 * THE PLAYBOOK, AS DATA (Lawal, 23 November 2026, 16:04, binding: "All these errors you're now finding from the engine's
 * work are the corrections you'll be making for the future, so that it doesn't repeat itself"; and 16:07: the rule covers
 * designing the posts too; PM-ORDER-EVENTLINQS-2-LAUNCH-8NOV.md under 'PM, 23 November 2026, 16:04' and '16:07'). Every
 * PM RETURN becomes three things in the same train: the code fix at its cause, a regression test that fails on the old
 * output, and a rule here with its reason.
 *
 * Versioned data, and beside it the one check of each rule a machine can judge (relativeDateWords below), which the creative
 * intake's gate reads (src/lib/creative/intake.ts). The creative engine's critic will read the rest when it lands; until then
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
export const PLAYBOOK_VERSION = '2026-11-24'

const RETURN_1530 = "the PM's RETURN of 15:30 on piece da22e104 (A Moment of Sanity), 23 November 2026; Lawal's 16:04"
const REVIEW_1234 = "Lawal's review of the seven designs, 23 November 2026, 12:34 (DESIGN-REVIEW-SEVEN-23NOV.md)"
const DECISION_1247 = "Lawal's final creative decision, 23 November 2026, 12:47 (FINAL-CREATIVE-DECISION-23NOV.md)"
const INTAKE_2215 = "the PM's intake read of 23 November 2026, 22:15"
const INTAKE_2324 = "the PM's intake of 23 and 24 November 2026"

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
  {
    id: 'caption-emoji-from-category',
    rule: "A caption's emoji comes from the night's own category first (a theatre night takes the theatre mask), then from its words; nights of music of several kinds take the music note.",
    reason: "Kyivska Perepichka, a theatre show, carried the music note, because its words name live music and the kind was read from its words before its category.",
    source: `${INTAKE_2215} (Kyivska, piece 23f34b07)`,
    date: '2026-11-23',
  },
  {
    id: 'caption-one-show-says-each-fact-once',
    rule: "A one-show caption says its title once (the hook) and its date once (the date line from its own record, '📅 Saturday 5 December, 6:30pm to 8:30pm').",
    reason: "Kyivska read '🎶 Kyivska Perepichka: Ukrainian Theatre in Melbourne at The Wheeler Centre, Saturday 5 December.' and then 'Sat 5 Dec, 6.30 pm: Kyivska Perepichka: Ukrainian Theatre in Melbourne': its title twice and its date twice.",
    source: `${INTAKE_2215} (Kyivska, piece 23f34b07)`,
    date: '2026-11-23',
  },
  {
    id: 'caption-no-from-to-on-one-day',
    rule: "A list whose nights all fall on one day carries no 'From ... on <day> to ... on <day>' line; the line runs only across different days.",
    reason: "The live music caption read 'From Choir 3006 In Concert on Friday to Michelle Nicolle & David McEvoy on Friday.', which is neither true as a journey nor natural.",
    source: `${INTAKE_2215} (live music, piece 8d252108)`,
    date: '2026-11-23',
  },
  {
    id: 'caption-rows-time-alone-on-one-day',
    rule: "Rows under a one-day date line ('📅 Friday 27 November') say their times alone, never the day again on every row; rows over several days keep their days.",
    reason: "Each row of the live music caption repeated 'Fri 27 Nov' under the line that already says Friday 27 November.",
    source: `${INTAKE_2215} (live music, piece 8d252108)`,
    date: '2026-11-23',
  },
  {
    id: 'piece-and-first-revision-together',
    rule: 'A piece and its first revision are written together: when the database refuses the first words, the piece is removed at once and the removal is read, so no empty piece ever holds a week\'s place; one writer (writePieceWithFirstRevision) for every path.',
    reason: "At 22:14 on 23 November the comedy set's piece 28e4096c was kept while the caption check refused its words; the clean up's delete was refused by a missing grant and never read, the empty piece held the week's one Melbourne weekend carousel place, and the next intake was refused: 'this week's campaign already holds a weekend carousel piece for melbourne'.",
    source: INTAKE_2324,
    date: '2026-11-24',
  },
  {
    id: 'unapproved-set-redrawn-with-todays-rules',
    rule: "An approved set's piece that nobody has approved, scheduled or posted is drawn again with today's nights and words as a new revision, its piece id kept; an approved, scheduled or posted piece is never redrawn.",
    reason: "The live music (8d252108) and Kyivska (23f34b07) pieces were drawn at 22:15 with the captions train seven fixed, and intake, finding each by its first file, only ever answered 'drawn already'.",
    source: INTAKE_2324,
    date: '2026-11-24',
  },
]

/**
 * THE RULE 'no-relative-date', AS A MACHINE JUDGES IT: the relative day words a feed post never carries, since it stays on
 * the profile after its day. Read by the creative intake's gate at intake and again before publishing.
 */
const RELATIVE_DATE_WORDS = /\b(?:today|tonight|tomorrow|yesterday|this (?:weekend|week|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|next (?:week|weekend))\b/gi

/** Every relative day word a text carries, each once, lower case. Pure. */
export function relativeDateWords(text: string): string[] {
  return [...new Set((text.match(RELATIVE_DATE_WORDS) ?? []).map((w) => w.toLowerCase()))]
}
