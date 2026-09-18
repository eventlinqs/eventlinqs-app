'use client'

import { useEffect, useState, type ComponentType } from 'react'

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
 * So deferring removes no markup from any page: the server already sent none.
 * What changes is only WHEN the JavaScript arrives, and it now arrives in its
 * own chunk after hydration rather than ahead of first paint. The components'
 * own comments already claimed they "never cost LCP"; this is what makes the
 * bytes agree with the claim.
 *
 * The consent banner is `position: fixed` at the foot of the window and
 * reserves its own space through `useReservedSpace`, so arriving a chunk later
 * moves nothing that was already painted.
 *
 * ============================================================================
 * WHY THIS IS A BARE `import()` AND NOT `next/dynamic`, WITH THE MEASUREMENT
 * ============================================================================
 *
 * This boundary was written with `dynamic(() => import('./measurement-stack'),
 * { ssr: false })` on 18 September. It split the chunk correctly and it left
 * 1099 bytes gzip behind on EVERY route, which the ratchet then reported 116
 * times over, and the first reading of that residual blamed `RegisterAppWorker`.
 * That reading was wrong and `git log` says so: `register-app-worker.tsx` was
 * added at 6bf6bc66, long before the marks in `perf-budget.json` were written
 * at 8c2bd2da, so its bytes have been inside the mark the whole time.
 *
 * The residual was `next/dynamic` itself. Nothing in the root layout's client
 * shell had ever imported it: the four other lazy wrappers on the platform
 * (`seat-selector-lazy`, `venue-map-lazy`, `m5-events-map-lazy`, the events
 * page's map) are all route-level, so their copy of the loadable runtime is
 * paid for by the routes that use them. Putting the first `dynamic()` call into
 * the shell moved that runtime into the first load of all 141 routes to defer
 * one tree that a bare `import()` defers just as well.
 *
 *     WITH next/dynamic   13 shared chunks   161851 bytes gzip   +1099 over mark
 *     WITH import()       12 shared chunks   160545 bytes gzip    -207 under it
 *
 * 1306 bytes gzip, and one whole chunk that stops being fetched at all, off the
 * first load of all 141 routes. The ratchet went from 134 faults to 16 on that
 * one edit, because 116 of them were this one number reported once per route.
 *
 * Both numbers are the gzip total of the chunks common to every route in
 * `.next/diagnostics/route-bundle-stats.json`, which is the same file
 * `scripts/guards/initial-bundle-budget.mjs --built` weighs, and BOTH ARE FROM
 * A GATE BUILD, which is not the same thing as a build.
 *
 * `scripts/ops/pre-push-gate.mjs:195` sets `NEXT_PUBLIC_SENTRY_DSN` to a
 * parity DSN when the environment has none, because that value is INLINED at
 * build time: without it the local build ships a browser bundle that no
 * deployment ever serves. The first version of this note quoted 160425 and a
 * saving of 1426, taken from a bare `next build` with the DSN empty, and the
 * push measured 160545 on every one of the 141 routes and refused all of them
 * by an identical +120 bytes. A mark, and a measurement quoted beside it, is
 * only meaningful against the build the gate judges.
 *
 * WHAT IS GIVEN UP BY NOT USING `next/dynamic`: nothing that is used here.
 * `dynamic()` adds a preload handle, a `loading` slot and SSR control. This
 * tree renders null on the server either way, wants no loading state, and is
 * never preloaded. The three lines below are the whole of what it was doing.
 *
 * HYDRATION IS SAFE BY CONSTRUCTION. The server renders null because effects
 * do not run there; the client's FIRST render also renders null because the
 * state starts null; the tree appears only on the render after the effect, so
 * there is no markup for React to reconcile and no mismatch to suppress.
 *
 * `tests/unit/analytics/consent-context-stays-in-the-deferred-tree.test.ts`
 * holds this shape, and `scripts/guards/no-loadable-in-the-root-shell.mjs`
 * fails the build if `next/dynamic` is imported anywhere the root layout's
 * client shell can reach.
 */
export function MeasurementBoot() {
  const [Stack, setStack] = useState<ComponentType | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('./measurement-stack').then(mod => {
      if (!cancelled) setStack(() => mod.default)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return Stack ? <Stack /> : null
}
