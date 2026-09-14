/**
 * ACCESSIBILITY, AS A LIST OF THINGS THAT ARE TRUE, AND NEVER AS A LIST OF
 * THINGS THAT ARE NOT.
 *
 * Close-out SEO5 step 4: "Add an accessibility section to the event page and
 * the venue page, populated from fields the organiser and venue can fill, and
 * show it only when filled. A blank section is worse than none."
 *
 * ============================================================================
 * THE ONE RULE THIS MODULE EXISTS TO ENFORCE
 * ============================================================================
 *
 * A `false` in one of these columns means NOT STATED. It does not mean "no".
 * Nobody asked the organiser of a warehouse party in 2024 whether their venue
 * has a hearing loop, and answering on their behalf, in either direction, is
 * the platform inventing a fact.
 *
 * So `accessibilityItems` returns only the TRUE values, there is no code path
 * anywhere that renders a negative, and when nothing is true and both text
 * fields are empty it returns an empty result which the section reads as
 * "render nothing". That last part is the owner's sentence: a blank section is
 * worse than none, because a heading that says Accessibility over white space
 * reads as "we have none" to exactly the person who needs to know.
 *
 * `scripts/guards/no-false-urgency.mjs` holds both halves of that, and
 * `tests/unit/accessibility/accessibility-fields.test.ts` drives them.
 *
 * ============================================================================
 * WHERE THE FIELDS COME FROM (Law 3, Law 7)
 * ============================================================================
 *
 * Every flag below traces to an Australian primary source read on
 * 14 September 2026. The full derivation, with the quoted sentence beside each
 * column, is in the migration that creates them:
 * `docs/migrations-pending/20260914000002_accessibility_fields.sql`.
 *
 *   AFL, Accessible Ticketing
 *     https://www.afl.com.au/tickets/accessible-ticketing
 *   ICC Sydney, Accessibility and inclusion for visitors, live events
 *     https://iccsydney.com.au/about/venue-information/accessibility-and-inclusion-for-visitors/live-events/
 *
 * THE COMPANION CARD IS THE REASON THIS IS NOT A GENERIC FEATURE LIST. It is an
 * Australian state and territory scheme: an affiliated business admits the
 * cardholder's companion at no charge, and a business that is not an affiliate
 * does not. A cardholder has to know which BEFORE they book, and no overseas
 * ticketing platform models it at all.
 *
 * ============================================================================
 * WHY THE COLUMNS ARE READ LOOSELY RATHER THAN TYPED
 * ============================================================================
 *
 * The migration is PARKED (`docs/migrations-pending/README.md`): applying one to
 * production is the founder's reserved step, merging code is not, and a
 * migration file committed ahead of him turns main red for three lanes. So this
 * module takes an unknown-shaped row and reads what is there. Before the
 * migration lands every property is `undefined`, every flag is therefore false,
 * the result is empty and the section renders nothing. After it lands the same
 * code shows the section. There is no second commit and no switch to flip.
 */

/** The scope a flag belongs to. A building cannot be interpreted. */
export type AccessibilityScope = 'event' | 'venue'

export interface AccessibilityFlag {
  /** The column on `public.events` and, where scoped `both`, `public.venues`. */
  column: string
  /** What a person reads. Australian English, stated positively, never negated. */
  label: string
  /** One line of plain explanation, shown under the label. */
  detail: string
  scopes: readonly AccessibilityScope[]
}

const BOTH = ['event', 'venue'] as const
const EVENT_ONLY = ['event'] as const

/**
 * THE ORDER IS THE DISPLAY ORDER, and it is not alphabetical.
 *
 * It runs from "can I get in and around the building" through "can I follow
 * what is happening" to "what does it cost me", because that is the order the
 * questions arrive in for somebody deciding whether to come.
 */
export const ACCESSIBILITY_FLAGS: readonly AccessibilityFlag[] = [
  {
    column: 'wheelchair_accessible',
    label: 'Wheelchair accessible',
    detail: 'Wheelchair spaces are available, with a companion seat beside them.',
    scopes: BOTH,
  },
  {
    column: 'step_free_access',
    label: 'Step-free entry',
    detail: 'You can reach the entrance and the main space without steps.',
    scopes: BOTH,
  },
  {
    column: 'accessible_toilets',
    label: 'Accessible toilets',
    detail: 'Accessible toilets are available on site.',
    scopes: BOTH,
  },
  {
    column: 'accessible_parking',
    label: 'Accessible parking',
    detail: 'Accessible parking bays are available at or beside the venue.',
    scopes: BOTH,
  },
  {
    column: 'hearing_loop',
    label: 'Hearing loop',
    detail: 'A hearing augmentation loop covers the main space.',
    scopes: BOTH,
  },
  {
    column: 'quiet_space',
    label: 'Quiet space',
    detail: 'A low-stimulation room is available if you need to step away.',
    scopes: BOTH,
  },
  {
    column: 'assistance_animals_welcome',
    label: 'Assistance animals welcome',
    detail: 'Trained and accredited assistance animals are welcome.',
    scopes: BOTH,
  },
  {
    column: 'auslan_interpreted',
    label: 'Auslan interpreted',
    detail: 'This event is interpreted into Auslan.',
    scopes: EVENT_ONLY,
  },
  {
    column: 'audio_described',
    label: 'Audio described',
    detail: 'Audio description is provided for this event.',
    scopes: EVENT_ONLY,
  },
  {
    column: 'companion_card_accepted',
    label: 'Companion Card accepted',
    detail: 'A Companion Card holder attends with their companion at no extra charge.',
    scopes: BOTH,
  },
]

/** The column names this scope may read. Used by the reader and by the guard. */
export function accessibilityColumns(scope: AccessibilityScope): string[] {
  return [
    ...ACCESSIBILITY_FLAGS.filter(f => f.scopes.includes(scope)).map(f => f.column),
    'accessibility_notes',
    'accessibility_contact',
  ]
}

export interface AccessibilityInfo {
  /** Only the flags that are TRUE. Never a negation, never a placeholder. */
  flags: AccessibilityFlag[]
  notes: string | null
  contact: string | null
}

/** Nothing to say. The section reads this and renders nothing at all. */
export const NO_ACCESSIBILITY_INFO: AccessibilityInfo = { flags: [], notes: null, contact: null }

/**
 * Trim to null.
 *
 * A column holding `'   '` is empty in every sense a reader cares about, and a
 * section that renders because of three spaces is the blank section the owner
 * ruled out.
 */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * What this row actually says about access.
 *
 * `row` is deliberately loose: it is a database row before the migration that
 * creates these columns has been applied anywhere, an event row read with `*`,
 * or a venue row read column by column. All three arrive here and all three are
 * read the same way, so there is one derivation rather than three.
 *
 * STRICT `=== true`. A column that arrives as the STRING `'true'` from some
 * future serialiser, or as `1`, is NOT treated as a claim. Coercing here is how
 * a platform ends up promising a ramp because a CSV import wrote a `1`.
 */
export function accessibilityItems(
  row: Record<string, unknown> | null | undefined,
  scope: AccessibilityScope,
): AccessibilityInfo {
  if (!row) return NO_ACCESSIBILITY_INFO
  return {
    flags: ACCESSIBILITY_FLAGS.filter(f => f.scopes.includes(scope) && row[f.column] === true),
    notes: text(row.accessibility_notes),
    contact: text(row.accessibility_contact),
  }
}

/** Is there anything to show. The single emptiness test, used by the section. */
export function hasAccessibilityInfo(info: AccessibilityInfo): boolean {
  return info.flags.length > 0 || info.notes !== null || info.contact !== null
}

/**
 * The shape the edit panel starts from, read out of a database row.
 *
 * Deliberately NOT `accessibilityItems`. That function answers "what should the
 * public page show", so it returns only the true flags and drops the false
 * ones. A form needs every box, ticked or not, and needs the two text fields
 * whether or not they are empty. Two questions, two functions, one column list.
 */
export function accessibilityInputFrom(
  row: Record<string, unknown> | null | undefined,
  scope: AccessibilityScope,
): { flags: Record<string, boolean>; notes: string | null; contact: string | null } {
  const flags: Record<string, boolean> = {}
  for (const flag of ACCESSIBILITY_FLAGS) {
    if (!flag.scopes.includes(scope)) continue
    flags[flag.column] = row?.[flag.column] === true
  }
  return {
    flags,
    notes: text(row?.accessibility_notes),
    contact: text(row?.accessibility_contact),
  }
}
