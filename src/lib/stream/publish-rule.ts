import { isAcceptableStreamLink } from './embed'

/**
 * A LIVESTREAM CANNOT GO LIVE WITHOUT A LINK (Scope v5, 3.11).
 *
 * A virtual event, or a hybrid event with at least one livestream tier, sells a
 * ticket to something. If the organiser has not yet added the stream link, the
 * buyer's Join the livestream button would open a page that says "not yet",
 * which is a ticket to nothing. So publishing is refused until the link exists.
 *
 * Pure and client-safe, so the form disables Publish with this sentence and the
 * server action refuses with the same sentence: one rule, two readers, never a
 * live button beside a refusal.
 */
export function livestreamNeedsLink(input: {
  eventType: 'in_person' | 'virtual' | 'hybrid'
  tierAccessModes: readonly ('in_person' | 'virtual')[]
  streamUrl: string | null | undefined
}): boolean {
  const sellsLivestream =
    input.eventType === 'virtual' || (input.eventType === 'hybrid' && input.tierAccessModes.includes('virtual'))
  return sellsLivestream && !isAcceptableStreamLink(input.streamUrl)
}

export const STREAM_LINK_REQUIRED_MESSAGE =
  'Add the stream link your livestream viewers will open before this goes live. It is revealed only to ticket holders, never on the event page.'

/** What the database trigger holds, mirrored so the form and the action never send a mismatch. */
export function coerceAccessMode(
  eventType: 'in_person' | 'virtual' | 'hybrid',
  requested: 'in_person' | 'virtual' | null | undefined,
): 'in_person' | 'virtual' {
  if (eventType === 'virtual') return 'virtual'
  if (eventType === 'in_person') return 'in_person'
  return requested === 'virtual' ? 'virtual' : 'in_person'
}
