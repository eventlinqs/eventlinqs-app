/**
 * THE ONE QUESTION ASKED AT SIGNUP, and the only one.
 *
 * Close-out AN1. Parameters on a link answer where the CLICK came from. They
 * cannot answer the thing the owner most needs to know, which is whether a
 * human being told this organiser about the platform, because a word of mouth
 * arrives with no parameters at all: somebody types the name into a search box
 * a week after a DJ mentioned it.
 *
 * THE CHOICES ARE THE ANSWER, NOT A SURVEY. Five named routes plus other, each
 * one a channel the growth plan actually names as a lever, so an answer maps to
 * a decision. "A DJ or promoter I know" is first because the ranked levers put
 * supply-side recruitment by hand at number one, and if that is what is working
 * the owner should see it in the first row.
 *
 * IT IS OPTIONAL AND MUST STAY OPTIONAL. AN1 says so and it is the right call:
 * a required question on a signup form buys a worse number, because the people
 * who will not answer it answer it falsely instead. An unanswered signup is
 * recorded as unanswered and counted as such in the weekly line.
 */
export const HEARD_FROM_CHOICES = [
  { value: 'dj-or-promoter', label: 'A DJ or promoter I know' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google', label: 'Google' },
  { value: 'another-organiser', label: 'Another organiser' },
  { value: 'event-i-attended', label: 'An event I attended' },
  { value: 'other', label: 'Other' },
] as const

export type HeardFromValue = (typeof HEARD_FROM_CHOICES)[number]['value']

export const HEARD_FROM_QUESTION = 'How did you hear about EventLinqs?'

/** The label shown in the weekly line for a signup that did not answer. */
export const HEARD_FROM_UNANSWERED_LABEL = 'Not answered'

/** How much free text an answer of "other" may carry into the database. */
export const HEARD_FROM_OTHER_MAX = 120

export function isHeardFromValue(value: unknown): value is HeardFromValue {
  return typeof value === 'string' && HEARD_FROM_CHOICES.some(c => c.value === value)
}

export function heardFromLabel(value: string | null | undefined): string {
  if (!value) return HEARD_FROM_UNANSWERED_LABEL
  return HEARD_FROM_CHOICES.find(c => c.value === value)?.label ?? value
}

/**
 * What actually gets stored, from what the form sent.
 *
 * An unrecognised answer is dropped rather than stored, because the weekly line
 * groups on this column and one crafted value would put a stranger's sentence
 * into the owner's report. The free text is kept only for "other", trimmed, and
 * bounded: everywhere else it would be an answer contradicting itself.
 */
export function normaliseHeardFrom(input: {
  heardFrom?: unknown
  heardFromOther?: unknown
}): { heardFrom: HeardFromValue | null; heardFromOther: string | null } {
  const heardFrom = isHeardFromValue(input.heardFrom) ? input.heardFrom : null
  if (heardFrom !== 'other') return { heardFrom, heardFromOther: null }
  const other = typeof input.heardFromOther === 'string' ? input.heardFromOther.trim().slice(0, HEARD_FROM_OTHER_MAX) : ''
  return { heardFrom, heardFromOther: other.length > 0 ? other : null }
}
