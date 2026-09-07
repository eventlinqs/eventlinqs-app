import type { Metadata } from 'next'
import { generateMetadata as parentMetadata } from '../page'
import { noIndexMetadata } from '@/lib/seo/indexing-policy'

/**
 * THE HOLDER'S VIEW OF AN ARCHIVED EVENT, at a path the edge never caches.
 *
 * /events/[slug] is edge-cached publicly for 300s (next.config.ts) on the
 * assumption that the render is anonymous, and an archived event's answer is
 * per viewer: 404 to a stranger, the page to a ticket holder. Measured on the
 * pull request preview (C:\dev\EVIDENCE\C13\preview-holder-probe.txt): a
 * signed-in holder was served the stranger's cached 404 (x-vercel-cache: HIT)
 * even though the holder's own response would never have been cached, because
 * the edge looks the URL up before any function runs and cookies are not part
 * of the key.
 *
 * Routing Middleware "runs globally before the cache" and rewriting is the
 * documented way to personalise cached content
 * (https://vercel.com/docs/routing-middleware, last updated 2026-08-14,
 * fetched 2026-09-06). So src/proxy.ts rewrites a request that carries the
 * signed-in marker cookie, for a slug with no live row and no tombstone, to
 * THIS path. The address bar still says /events/[slug]; the edge looks up
 * /events/[slug]/holder, which no public cache rule matches and which the
 * `missing` condition on that rule keeps private anyway; and the parent
 * layout's existence guard decides, as it does for every request, whether
 * this viewer holds a ticket. Everyone else gets the same 404 they would get
 * at the public path.
 *
 * It is the same page. The component IS the parent route's own.
 *
 * THE METADATA IS NOT, AND THAT WAS A DEFECT UNTIL 8 SEPTEMBER 2026. This file
 * used to re-export the parent's `generateMetadata` unchanged, so the private,
 * per-viewer view of an ARCHIVED event inherited the parent's `index, follow`
 * and its self-referencing canonical. An archived event is deliberately absent
 * from search (close-out C13.6: 404 to anyone who does not hold a ticket), so
 * a page that renders it must not ask to be indexed. The parent's title,
 * description and social card are kept, because it is the same event; only the
 * robots directive changes, and the canonical is dropped with it.
 */
export { default } from '../page'

export async function generateMetadata(
  props: Parameters<typeof parentMetadata>[0],
): Promise<Metadata> {
  const parent = await parentMetadata(props)
  const { alternates: _dropped, ...rest } = parent
  return { ...rest, ...noIndexMetadata() }
}
