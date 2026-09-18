'use client'

import dynamic from 'next/dynamic'

/**
 * THE MEASUREMENT TREE, FETCHED AS ITS OWN CHUNK INSTEAD OF IN EVERY FIRST
 * LOAD.
 *
 * ============================================================================
 * WHAT THIS COST BEFORE, MEASURED
 * ============================================================================
 *
 * The six components in `measurement-stack.tsx` were mounted inline in
 * `src/app/layout.tsx`, which is the root layout, so their bytes landed in the
 * layout's client chunk and that chunk is in the first load of EVERY route.
 * The build of 18 September 2026 measured the cost exactly, because the
 * initial-bundle ratchet reported the same number 133 times:
 *
 *     +3938 bytes gzip, on 133 of 141 routes, identically
 *
 * Every one of those routes was over its recorded mark by precisely that
 * figure, on `/press` and `/login` and `/unsubscribe/[token]` alike, none of
 * which measures anything or shows a consent banner at first paint.
 *
 * ============================================================================
 * WHY DEFERRING IS CORRECT HERE AND NOT A DODGE
 * ============================================================================
 *
 * Every component in that tree already does its work in a post-paint effect,
 * and every one of them renders NOTHING into the server HTML:
 *
 *   ArrivalCapture, ClickIdentifierRelay  render null, always
 *   GatedAnalytics                        emits nothing until consent is given
 *   FunnelLanded                          renders null, always
 *   ConsentBanner                         returns null until the stored
 *                                         decision has been read on the
 *                                         client, so its server output is
 *                                         empty on every render
 *
 * So `ssr: false` removes no markup from any page: the server already sent
 * none. What changes is only WHEN the JavaScript arrives, and it now arrives
 * in its own chunk after hydration rather than ahead of first paint. The
 * components' own comments already claimed they "never cost LCP"; this is what
 * makes the bytes agree with the claim.
 *
 * The consent banner is `position: fixed` at the foot of the window and
 * reserves its own space through `useReservedSpace`, so arriving a chunk later
 * moves nothing that was already painted.
 *
 * ============================================================================
 * WHY THE dynamic() CALL IS IN A CLIENT COMPONENT
 * ============================================================================
 *
 * It has to be. Next 16's own guide is explicit, and both halves of it apply:
 *
 *   "When a Server Component dynamically imports a Client Component,
 *    automatic code splitting is currently not supported."
 *   "`ssr: false` option will only work for Client Components, move it into
 *    Client Components ensure the client code-splitting working properly."
 *
 *   node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md, next@16.3.0
 *
 * The root layout is a Server Component, so calling `dynamic()` there would
 * have produced no split at all and the 3938 bytes would have stayed exactly
 * where they were, with a file in the tree claiming otherwise. This one-line
 * client boundary is the whole reason the split happens.
 */
const MeasurementStack = dynamic(() => import('./measurement-stack'), { ssr: false })

export function MeasurementBoot() {
  return <MeasurementStack />
}
