/**
 * The slug-form of a venue's name: the public handle `/venues/[handle]`
 * resolves (src/lib/venues/resolver.ts re-exports it).
 *
 * A leaf module with no imports, so a plain node script (the WI2 listings
 * import) can mint the same handle the route resolves without loading the
 * Supabase client the resolver carries.
 */
export function venueSlugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
