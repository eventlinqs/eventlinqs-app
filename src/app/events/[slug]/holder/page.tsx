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
 * It is the same page. Nothing is duplicated: the component and its metadata
 * are the parent route's own.
 */
export { default, generateMetadata } from '../page'
