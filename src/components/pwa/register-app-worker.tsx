'use client'

import { useEffect } from 'react'

/** The root-scope worker and its scope, in one place so the tests and the guard read them rather than a literal. */
export const APP_SERVICE_WORKER_URL = '/app-sw.js'
export const APP_SERVICE_WORKER_SCOPE = '/'

/**
 * REGISTERS THE ROOT SERVICE WORKER, AFTER THE PAGE HAS PAINTED.
 *
 * Close-out C8B.5, Scope v5 10.3 ("a PWA that functions offline"). Renders
 * nothing. `public/app-sw.js` says what the worker does and, more usefully, what
 * it refuses to do.
 *
 * ============================================================================
 * WHY IT WAITS FOR `load`
 * ============================================================================
 *
 * The whole of C8 is about not putting script in front of the paint.
 * `navigator.serviceWorker.register` is cheap but it is not free: it starts a
 * worker thread, and on the throttled mobile profile Lighthouse simulates,
 * anything competing with the render-blocking stylesheet is paid for in LCP.
 * H3 (8 September) measured exactly this class of cost with the error-reporting
 * SDK and moved it off the paint path; this arrives after the same gate rather
 * than repeating the lesson.
 *
 * A worker also never controls the page that registered it, so deferring costs
 * the buyer nothing: the offline fallback becomes available from the NEXT
 * navigation either way.
 *
 * ============================================================================
 * WHY IT DOES NOT HIDE FROM AN AUDIT AGENT
 * ============================================================================
 *
 * `html[data-headless]` exists so motion does not run under Lighthouse, and it
 * would have been easy to reuse here. It would also have been dishonest: a gate
 * that measures a page without the worker the buyer gets is measuring a
 * different product. Deferring past `load` already puts this outside the window
 * every Lighthouse metric is drawn from, so there is nothing to hide from.
 */
export function RegisterAppWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    let cancelled = false
    const register = () => {
      if (cancelled) return
      navigator.serviceWorker
        .register(APP_SERVICE_WORKER_URL, { scope: APP_SERVICE_WORKER_SCOPE })
        .catch(error => {
          /*
           * A refused registration is reported, never swallowed. It is not worth
           * interrupting a buyer over: every page still works, they simply lose
           * the offline fallback. But a silent failure here would mean the
           * offline story quietly stops being true on some browser, in some
           * private mode, and nobody would learn it from the product.
           */
          console.warn(`[pwa] the root service worker could not be registered: ${String(error)}`)
        })
    }

    // `document.readyState === 'complete'` covers a client-side navigation,
    // where the load event fired long before this effect ever ran.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('load', register)
    }
  }, [])

  return null
}
