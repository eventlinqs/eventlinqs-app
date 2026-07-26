/**
 * The guidance registry: what each surface teaches, in one place.
 *
 * Client-safe (no server imports) because the guidance components are client
 * components that mount on interactive surfaces. Content lives here rather
 * than inline in the surfaces, so the copy laws are auditable in one file and
 * so a surface and the guide that backs it can never drift apart: the guide
 * slug is declared here and asserted against the guide library by test.
 *
 * Design position, taken from the research (see docs/design/GUIDANCE.md):
 * this is NOT a product tour. Nearly 70% of users skip linear tours, and
 * completion collapses as steps are added. So: three steps maximum, every one
 * of them about a thing the person is about to do, dismissable at any point,
 * remembered per device, and never shown twice.
 */

export type GuidanceSurfaceId = 'buyer-seat-map' | 'room-studio'

export type CoachStep = {
  id: string
  title: string
  body: string
  /** The keyboard route to the same thing, spoken to screen readers too. */
  keyboard?: string
}

/**
 * Every contextual hint the platform arms. Each one is triggered by something
 * the person just did on the surface, never by their arrival, and each is
 * wired: an id here with no trigger in a surface is dead content.
 */
export type ContextualHintId =
  | 'seat-map-pan'
  | 'seat-map-taken-seat'
  | 'seat-map-filtered-out'
  | 'studio-first-block'

/** The one sentence each hint says, in the voice of the surface it sits on. */
export const CONTEXTUAL_HINTS: Record<ContextualHintId, string> = {
  'seat-map-pan':
    'You are inside the room now. Drag the plan to move around, or tap the small map to jump.',
  'seat-map-taken-seat':
    'That chair is already taken. Grey chairs are gone; try Find our seats to get the best block open.',
  'seat-map-filtered-out':
    'That seat belongs to a different ticket type. Clear the ticket filter to take it.',
  'studio-first-block':
    'Now select it and set its ticket type in the inspector. That is what prices every seat in the block.',
}

export type GuidanceSurface = {
  id: GuidanceSurfaceId
  /** Shown on the launcher and as the guidance panel heading. */
  label: string
  /** One line under the panel heading. */
  intro: string
  /**
   * Bump when the steps change materially. The per-device memory is keyed on
   * it, so a real change gets one more showing and a typo fix does not.
   */
  version: number
  steps: CoachStep[]
  /** The guide that carries the long form of this surface. */
  guideSlug: string
  guideTitle: string
  /** Further reading offered in the panel. */
  moreGuides: { slug: string; title: string }[]
  /** Which locked assistant answers questions asked on this surface. */
  assistant: 'support' | 'organiser-onboarding'
  /** Question chips offered in the panel, phrased as a person would ask. */
  starters: string[]
}

export const GUIDANCE_SURFACES: Record<GuidanceSurfaceId, GuidanceSurface> = {
  'buyer-seat-map': {
    id: 'buyer-seat-map',
    label: 'How this seat map works',
    intro: 'Three things worth knowing before you pick.',
    version: 1,
    guideSlug: 'building-a-seating-chart',
    guideTitle: 'Building a seating chart',
    moreGuides: [{ slug: 'refunds-and-transfers', title: 'Refunds and transfers' }],
    assistant: 'support',
    starters: [
      'How do I find seats together?',
      'What do the seat colours mean?',
      'Can I change my seat later?',
    ],
    steps: [
      {
        id: 'pick',
        title: 'Tap a chair to take it',
        body: 'Every chair on the plan is a real seat. Tap one to see its price and where it sits, and tap again to let it go. Grey chairs are already gone.',
        keyboard: 'Arrow keys move seat to seat, Enter selects.',
      },
      {
        id: 'together',
        title: 'Or let us seat your group',
        body: 'Set how many of you there are, pick a price you are happy with, and we will find the best block open right now. It beats hunting the plan by eye.',
        keyboard: 'Tab to Seats together, then set the party size.',
      },
      {
        id: 'move',
        title: 'Move around the room',
        body: 'Drag the plan to move, pinch or use the zoom buttons to get closer. The small map at the bottom shows where you are looking, and tapping it jumps you there.',
        keyboard: 'Plus and minus zoom, Escape rests the cursor.',
      },
    ],
  },

  'room-studio': {
    id: 'room-studio',
    label: 'How the room studio works',
    intro: 'Three things that make the first chart quick.',
    version: 1,
    guideSlug: 'building-a-seating-chart',
    guideTitle: 'Building a seating chart',
    moreGuides: [
      { slug: 'mapping-ticket-tiers-to-seats', title: 'Mapping ticket tiers to seats' },
      { slug: 'running-the-door-with-the-qr-scanner', title: 'Running the door with the QR scanner' },
    ],
    assistant: 'organiser-onboarding',
    starters: [
      'How do I map a section to a ticket type?',
      'How do I curve my rows toward the stage?',
      'Can I edit a chart that is already selling?',
    ],
    steps: [
      {
        id: 'blocks',
        title: 'Build the room from blocks',
        body: 'Add rows, tables and standing areas, then drag them into place. They snap to the grid and line up with each other, so the room squares itself off as you go.',
        keyboard: 'Every add control is a button in the header, reachable by Tab.',
      },
      {
        id: 'inspector',
        title: 'The inspector prices the seats',
        body: 'Select a block and set its section name and ticket type. That ticket type is what every seat in the block sells at, so it is the field worth getting exactly right.',
        keyboard: 'Select a block with Tab and Enter to open the inspector.',
      },
      {
        id: 'safety',
        title: 'Nothing is final until you save',
        body: 'Undo and redo cover every edit, and a chart already on a live event never moves a seat somebody has bought. Experiment freely.',
        keyboard: 'The undo and redo buttons sit in the toolbar.',
      },
    ],
  },
}

/** The localStorage key for a surface's first-run memory, per device. */
export function coachStorageKey(surface: GuidanceSurfaceId, version: number): string {
  return `el.guidance.${surface}.v${version}`
}

/** The localStorage key for a one-time contextual hint, per device. */
export function hintStorageKey(hint: ContextualHintId): string {
  return `el.hint.${hint}`
}
