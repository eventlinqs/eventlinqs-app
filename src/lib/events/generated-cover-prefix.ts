/**
 * The storage prefix composed covers live under, in the event-images bucket.
 *
 * A leaf module with no imports, so the delete path (src/lib/upload.ts) can
 * name the prefix it must sweep without pulling the cover rasteriser into its
 * import graph. generated-cover.ts re-exports it, so there is one definition.
 */
export const GENERATED_COVER_PREFIX = 'generated-covers'

/**
 * A COMPOSED cover is the platform's own typographic fallback (Law 6's answer to an organiser with no artwork), not
 * something the organiser supplied; its artwork is the event title. Defined here, in the leaf, so the card's media
 * component (rendered inside client components too) can ask it without pulling the photo spine into a client bundle;
 * src/lib/images/event-media.ts re-exports it, so there is one definition.
 */
export function isComposedCover(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.includes(`/${GENERATED_COVER_PREFIX}/`)
}
