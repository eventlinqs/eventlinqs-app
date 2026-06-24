/**
 * Schema.org BreadcrumbList JSON-LD for the hierarchical pages.
 *
 * Emits the structured-data trail Google uses to render breadcrumb
 * rich results in search (the "Home > Communities > {Community} > {City}"
 * path under a listing instead of a raw URL). This closes the one SEO gap
 * found in audit: sitemap, robots, Event JSON-LD, metadata, canonical and
 * OG were already present, but the hierarchical community and city pages
 * shipped no BreadcrumbList.
 *
 * It follows https://schema.org/BreadcrumbList: an ordered list of
 * ListItem entries, each carrying its 1-based position, name, and an
 * absolute item URL. Callers pass an ordered array of { name, url } items;
 * the URLs are already absolute (the pages build them from the same
 * baseUrl they use for every other JSON-LD payload).
 *
 * Mirrors EventSchemaJsonLd exactly: a server component (no client
 * directive) rendering a single <script type="application/ld+json"> via
 * dangerouslySetInnerHTML + JSON.stringify, suppressHydrationWarning.
 */

interface BreadcrumbItem {
  /** Human-readable label for this step in the trail. */
  name: string
  /** Absolute URL for this step. */
  url: string
}

interface BreadcrumbJsonLdProps {
  /** The trail from Home (first) to the current page (last), in order. */
  items: BreadcrumbItem[]
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }

  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  )
}
