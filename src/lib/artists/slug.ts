/**
 * Derives a stable, URL-safe slug from an artist name. Deterministic (no random
 * suffix) so it can be used as the find-or-create key in the artists table.
 * Strips diacritics, lower-cases, and collapses any run of non-alphanumerics
 * into a single hyphen.
 */
export function artistSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
