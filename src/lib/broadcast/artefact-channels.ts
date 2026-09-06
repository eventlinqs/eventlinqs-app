/**
 * THE CHANNELS AN ARTEFACT IS MINTED FOR. One list, pure, importable from anywhere.
 *
 * WHY THIS FILE EXISTS (close-out C3, 6 September 2026). The six channels the
 * Launch Kit hands an organiser a card and a caption for were written out by
 * hand in FOUR places: kit-artefacts.ts (ARTEFACT_CHANNELS), captions.ts
 * (CAPTION_ORDER and the CaptionPlatform union), and a private CHANNELS array
 * in each of the two card routes. Nothing held the four together. A channel
 * added to the kit screen and not to a route would have been silently
 * re-pointed to the Instagram link by the route's fallback, and the proof
 * script that opens every card typed its own fifth copy. The standing rule of
 * the close-out is that a list is enumerated from source, never re-typed, and
 * a list that lives in four places has no source.
 *
 * This module has NO imports, so a script outside the Next bundle (the Launch
 * Kit inspection) can load it with Node's own type stripping and read the same
 * list the product reads. Keep it that way: an import here is an import every
 * consumer pays for, and the pure-and-client-safe shape is the same reason
 * share-codes.ts exists beside share-links.ts.
 *
 * ORDER IS MEANINGFUL: it is the order the kit presents the captions and the
 * cards, and the order the reach panel lists channels, so tests pin it.
 */
export const ARTEFACT_CHANNELS = ['instagram', 'facebook', 'whatsapp', 'x', 'linkedin', 'email'] as const

export type ArtefactChannel = (typeof ARTEFACT_CHANNELS)[number]

/**
 * The channel a card is minted for when the caller names none or names one the
 * kit does not offer. Instagram leads the kit, so it is the one a bare download
 * belongs to.
 */
export const DEFAULT_ARTEFACT_CHANNEL: ArtefactChannel = 'instagram'

export function isArtefactChannel(value: unknown): value is ArtefactChannel {
  return typeof value === 'string' && (ARTEFACT_CHANNELS as readonly string[]).includes(value)
}

/** The channel a query string asked for, or the default, never anything else. */
export function artefactChannelFrom(requested: string | null | undefined): ArtefactChannel {
  return isArtefactChannel(requested) ? requested : DEFAULT_ARTEFACT_CHANNEL
}
