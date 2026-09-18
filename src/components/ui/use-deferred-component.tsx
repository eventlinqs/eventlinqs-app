'use client'

import { useEffect, useRef, useState, type ComponentType } from 'react'

/**
 * FETCH A COMPONENT'S CHUNK WHEN THE VISITOR SHOWS INTENT, WITHOUT PAYING FOR
 * `next/dynamic` ON EVERY ROUTE THAT CARRIES THE HEADER.
 *
 * ============================================================================
 * WHY THIS EXISTS RATHER THAN `dynamic()`, WITH THE MEASUREMENT
 * ============================================================================
 *
 * The two pieces of header chrome that defer their bodies (the global search
 * overlay and the city dialog) were both written the obvious way:
 *
 *     const Panel = dynamic(() => import('./panel').then(m => m.Panel))
 *
 * That works, and it is the documented way to do it. It also drags the
 * `next/dynamic` LOADABLE RUNTIME into whatever chunk the caller lands in, and
 * these two callers land in the chunk shared by every route that renders
 * `SiteHeader` - 22 route files import it directly, and more reach it through
 * the page templates.
 *
 * Lane A measured the cost of that runtime on this tree on 18 September 2026,
 * gate build against gate build, when the same mistake was made one layer out
 * in the root layout's client shell (`no-loadable-in-the-root-shell.mjs`, and
 * the note beside it in `measurement-boot.tsx`):
 *
 *     WITH next/dynamic   13 shared chunks   161851 bytes gzip
 *     WITH import()       12 shared chunks   160545 bytes gzip
 *
 * 1306 bytes gzip and one whole chunk, for a deferral helper whose preload
 * handle, `loading` slot and SSR switch neither caller uses. A bare `import()`
 * splits the chunk just as well, because the split is done by the bundler when
 * it sees the dynamic `import()`, not by the helper wrapped around it.
 *
 * ============================================================================
 * WHY A SHARED HOOK AND NOT THE SAME TEN LINES TWICE
 * ============================================================================
 *
 * There are exactly two callers today and they arm on the same signal, so two
 * hand-rolled copies would be two chances for the cancellation to drift. The
 * hook is a few lines of application code in a chunk these callers already
 * share; it does not add a chunk, which is the entire complaint against the
 * helper it replaces.
 *
 * ============================================================================
 * WHAT IT DOES AND DOES NOT PROMISE
 * ============================================================================
 *
 * It returns `null` until `armed` has been true for at least one tick AND the
 * module has resolved, so a caller must handle the null. That null is the same
 * null `dynamic()` rendered while loading, so no caller's markup changes.
 *
 * ONCE LOADED IT STAYS LOADED. `armed` going back to false does not discard the
 * component, so every open after the first is synchronous. Cancellation only
 * guards the unmount case, where setting state would warn.
 *
 * `load` is held in a ref and deliberately NOT an effect dependency: callers
 * pass an inline arrow, which is a new function identity on every render, and
 * depending on it would refetch on each one. The ref is kept current by its own
 * effect rather than by an assignment during render.
 */
export function useDeferredComponent<P>(
  armed: boolean,
  load: () => Promise<ComponentType<P>>,
): ComponentType<P> | null {
  const [Component, setComponent] = useState<ComponentType<P> | null>(null)
  const loadRef = useRef(load)

  // Declared BEFORE the arming effect on purpose: effects run in declaration
  // order within a commit, so by the time the effect below reads `loadRef` in
  // the render where `armed` flipped, it holds that render's loader. Writing
  // `loadRef.current = load` inline during render would be a ref write during
  // render, which react-hooks/refs refuses and which is genuinely unsafe once
  // React can abandon a render.
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    if (!armed) return
    let cancelled = false
    void loadRef.current().then(resolved => {
      // The functional form: React would otherwise call a component as an updater.
      if (!cancelled) setComponent(() => resolved)
    })
    return () => {
      cancelled = true
    }
  }, [armed])

  return Component
}
