/*
 * EventLinqs door service worker (Scope v5 3.13, 5 September 2026).
 *
 * WHAT IT IS FOR. A phone at a gate with no signal gets reloaded: a pocket, a
 * thumb, a battery warning. Without this file that reload asks the network for
 * the scanner page, gets nothing, and the door is gone until the signal returns.
 * The scanner keeps its door list and its queue in IndexedDB, so all the reload
 * needs is the page itself and the script it runs on.
 *
 * WHAT IT DOES, and nothing else:
 *   - a NAVIGATION to /scan/... is fetched from the network first and the
 *     answer is kept; when the network fails, the kept copy is served
 *   - a /_next/static/ asset is served from the cache first, because Next names
 *     those by content hash so a cached copy is never wrong
 *   - every other request, every POST (server actions), every other origin,
 *     is left alone: respondWith is never called, so the browser does exactly
 *     what it would do without this worker
 *
 * It is registered with scope /scan/ (src/lib/scanner/door-types.ts), so no
 * public page, checkout, or ticket is ever touched by it. push-sw.js at scope /
 * stays push-only; two registrations at different scopes coexist and the more
 * specific one controls the scanner.
 *
 * The cache name is shared with the scanner, which warms the shell into it
 * after the door list lands; tests/unit/scanner/scan-service-worker.test.ts
 * fails if the two names drift.
 */

var SHELL_CACHE = 'eventlinqs-door-shell-v1'
var SCAN_PATH = '/scan/'
var STATIC_PATH = '/_next/static/'

self.addEventListener('install', function () {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key.indexOf('eventlinqs-door-shell-') === 0 && key !== SHELL_CACHE
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

/* The page is kept by origin and path only: the router's ?_rsc= query must not fork the entry. */
function shellKey(url) {
  return url.origin + url.pathname
}

function offlinePage() {
  return (
    '<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Door check-in is offline | EventLinqs</title>' +
    '<style>body{margin:0;background:#FAFAFA;color:#0A1628;font-family:system-ui,sans-serif}main{max-width:28rem;margin:0 auto;padding:4rem 1.25rem}' +
    'h1{font-size:1.5rem;margin:0 0 .75rem}p{line-height:1.5;margin:0 0 1rem}a{color:#0A1628;font-weight:600}</style></head>' +
    '<body><main><p style="font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;color:#8a6a10;font-weight:600">EventLinqs</p>' +
    '<h1>This door has not been opened online on this phone yet.</h1>' +
    '<p>Connect once so the door list can download, then the scanner works without a signal for 24 hours.</p>' +
    '<p><a href="">Try again</a></p></main></body></html>'
  )
}

function networkFirst(event, request, url) {
  return fetch(request)
    .then(function (response) {
      if (response.ok) {
        var copy = response.clone()
        event.waitUntil(
          caches.open(SHELL_CACHE).then(function (cache) {
            return cache.put(shellKey(url), copy)
          }),
        )
      }
      return response
    })
    .catch(function () {
      return caches
        .open(SHELL_CACHE)
        .then(function (cache) {
          return cache.match(shellKey(url))
        })
        .then(function (cached) {
          if (cached) return cached
          return new Response(offlinePage(), {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
          })
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

  if (request.mode === 'navigate' && url.pathname.indexOf(SCAN_PATH) === 0) {
    event.respondWith(networkFirst(event, request, url))
    return
  }
  if (url.pathname.indexOf(STATIC_PATH) === 0) {
    event.respondWith(cacheFirst(request))
  }
})
