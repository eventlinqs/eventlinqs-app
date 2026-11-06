/**
 * The value for "a gallery that holds this photo" on events.gallery_urls, a jsonb array of { url, ... } objects.
 *
 * Passed to contains() as a JSON STRING: postgrest-js writes an array handed to contains() as a Postgres array literal
 * ('cs.{[object Object]}', node_modules/@supabase/postgrest-js/dist/index.cjs, contains), which a jsonb column refuses
 * ('invalid input syntax for type json', TEST, 6 November 2026), and writes a string through as given. Pure.
 */
export function galleryHolding(url: string): string {
  return JSON.stringify([{ url }])
}
