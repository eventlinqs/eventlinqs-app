/*
 * EventLinqs root service worker (close-out C8B.5, Scope v5 10.3, 15 September 2026).
 *
 * WHAT IT IS FOR. Scope v5 10.3 asks for "a PWA that functions offline", and on
 * 15 September the platform had none: `scripts/verify/scope-10-3-audit.mjs` cut
 * the network, navigated to /, and got `net::ERR_INTERNET_DISCONNECTED` with
 * nothing on screen belonging to EventLinqs. A buyer on a train, in a lift, or
 * at a venue with bad reception saw the browser's dinosaur.
 *
 * WHAT IT DOES, and nothing else:
 *   - a NAVIGATION is passed straight to the network. When the network REFUSES,
 *     the precached /offline document is served instead.
 *   - a /_next/static/ asset is served cache-first, because Next names those by
 *     content hash, so a cached copy can never be the wrong copy.
 *   - every other request, every POST, every server action, every other origin,
 *     is left alone: respondWith is never called, so the browser does exactly
 *     what it would do without this worker.
 *
 * WHAT IT DELIBERATELY DOES NOT DO, and each omission is a decision:
 *
 *   IT NEVER CACHES A NAVIGATION RESPONSE. `public/scan-sw.js` does, and is
 *   right to: a door with a stale attendee list still opens a gate, and a door
 *   with no page at all does not. The opposite is true here. A cached event page
 *   carries a PRICE, a remaining-tickets count and a sale state, and serving a
 *   buyer yesterday's price is worse than telling them plainly that they are
 *   offline. The all-in pricing law (ACCC drip-pricing) is a promise about what
 *   the buyer is shown, and a cache that can serve a superseded total would
 *   quietly break it in a way nothing would ever detect.
 *
 *   IT NEVER CACHES A TICKET, an order, or anything under /account. Those are
 *   per-viewer, and the honest version of offline ticket access needs its own
 *   decision about a shared device rather than arriving as a side effect of a
 *   performance item. The /offline page points the buyer at their confirmation
 *   email instead, which their mail app already holds without a signal.
 *
 *   IT COSTS THE LCP NOTHING ON A FIRST VISIT. A worker does not control the
 *   page that registers it, and registration is deferred to after `load`
 *   (src/components/pwa/register-app-worker.tsx), so the document Lighthouse
 *   measures is never intercepted by it.
 *
 * TWO REGISTRATIONS ALREADY EXIST AND THIS IS THE THIRD. `push-sw.js` at scope /
 * is push-only and registers no fetch handler; `scan-sw.js` at scope /scan/
 * owns the door. Workers at different scopes coexist and the most specific one
 * controls a page, so /scan/ keeps its own behaviour and is untouched here.
 * This one is registered at scope / and must therefore be the careful one.
 *
 * The cache name carries a version: bump it and the activate handler below
 * deletes every older EventLinqs app-shell cache, which is how the /offline
 * document is replaced rather than accumulated.
 */

var SHELL_CACHE = 'eventlinqs-app-shell-v1'
var OFFLINE_URL = '/offline'
var STATIC_PATH = '/_next/static/'

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        /*
         * `cache: 'reload'` so the install never adopts a copy of /offline that
         * the HTTP cache happened to be holding from a previous deployment.
         * An offline page is the one document that must not be stale, because
         * it is the only one a buyer can see when nothing else works.
         */
        return cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))
      })
      .then(function () {
        return self.skipWaiting()
      }),
  )
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key.indexOf('eventlinqs-app-shell-') === 0 && key !== SHELL_CACHE
            })
            .map(function (key) {
              return caches.delete(key)
            }),
        )
      })
      .then(function () {
        return self.clients.claim()
      }),
  )
})

function offlineDocument() {
  return caches.open(SHELL_CACHE).then(function (cache) {
    return cache.match(OFFLINE_URL).then(function (cached) {
      if (cached) return cached
      /*
       * THE LAST RESORT, AND IT IS NOT DECORATION. If install ran while the
       * network was already failing, the precache is empty and there is nothing
       * to serve. Answering with this beats answering with nothing, and it says
       * the same thing the real page says.
       */
      return new Response(
        '<!doctype html><html lang="en-AU"><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width, initial-scale=1">' +
          '<title>You are offline | EventLinqs</title>' +
          '<style>body{margin:0;background:#FAFAFA;color:#0A1628;font-family:system-ui,sans-serif}' +
          'main{max-width:28rem;margin:0 auto;padding:4rem 1.25rem}h1{font-size:1.5rem;margin:0 0 .75rem}' +
          'p{line-height:1.5;margin:0 0 1rem}a{color:#0A1628;font-weight:600}</style></head>' +
          '<body><main><p style="font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;color:#8a6a10;font-weight:600">EventLinqs</p>' +
          '<h1>You are offline</h1>' +
          '<p>EventLinqs could not reach the network, so this page could not load. Nothing you have already paid for is affected.</p>' +
          '<p><a href="/">Try again</a></p></main></body></html>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
      )
    })
  })
}

function cacheFirst(request) {
  return caches.open(SHELL_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached
      return fetch(request).then(function (response) {
        if (response.ok) cache.put(request, response.clone())
        return response
      })
    })
  })
}

self.addEventListener('fetch', function (event) {
  var request = event.request
  if (request.method !== 'GET') return
  var url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  /*
   * /scan/ belongs to scan-sw.js. Both workers are registered on this origin and
   * the more specific scope controls a page under it, so this branch should
   * never run for a scanner navigation. It is here anyway, because "should never
   * run" is a claim about registration order, and a door that fell through to
   * the buyer's offline page would be a bad way to discover the claim was wrong.
   */
  if (url.pathname.indexOf('/scan/') === 0) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function () {
        return offlineDocument()
      }),
    )
    return
  }

  if (url.pathname.indexOf(STATIC_PATH) === 0) {
    event.respondWith(cacheFirst(request))
  }
})
