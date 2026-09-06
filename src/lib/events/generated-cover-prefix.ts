/**
 * The storage prefix composed covers live under, in the event-images bucket.
 *
 * A leaf module with no imports, so the delete path (src/lib/upload.ts) can
 * name the prefix it must sweep without pulling the cover rasteriser into its
 * import graph. generated-cover.ts re-exports it, so there is one definition.
 */
export const GENERATED_COVER_PREFIX = 'generated-covers'
