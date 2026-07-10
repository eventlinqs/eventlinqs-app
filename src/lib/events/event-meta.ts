/**
 * Build the <meta name="description"> content for an event detail page.
 *
 * ROOT FIX for the Lighthouse SEO failure (meta-description audit, score 0 ->
 * SEO category 0.92) on events whose summary, description AND venue_city are all
 * empty (e.g. the CI seed event afrobeats-melbourne-summer-sessions, which has a
 * null venue_city): the old inline logic produced an empty string, so Next
 * emitted no meta description. This helper is GUARANTEED non-empty - it always
 * falls back to a meaningful sentence built from the event title (a required
 * field), venue, date and category - so every event detail page ships a real
 * meta description and the SEO category scores 1.0.
 */
export function buildEventMetaDescription(input: {
  title: string
  summary?: string | null
  description?: string | null
  venueCity?: string | null
  venueName?: string | null
  dateLabel?: string | null
  categoryName?: string | null
}): string {
  const summarySource =
    input.summary ?? (input.description ? input.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '')
  const cityLine = input.venueCity ? `In ${input.venueCity}. ` : ''
  const primary = (cityLine + summarySource).trim()
  if (primary) return primary.slice(0, 155)

  // Fallback: summary + description + venue_city were all empty. Build a real
  // sentence from the always-present title (+ venue/date/category when present)
  // so the tag is never missing or empty.
  const where = input.venueName
    ? ` at ${input.venueName}${input.venueCity ? `, ${input.venueCity}` : ''}`
    : input.venueCity
      ? ` in ${input.venueCity}`
      : ''
  const when = input.dateLabel ? ` on ${input.dateLabel}` : ''
  const lead = input.categoryName ? `${input.categoryName}. ` : ''
  return `${lead}Get tickets to ${input.title}${where}${when}. All-in pricing, no surprise fees.`.slice(0, 155)
}
