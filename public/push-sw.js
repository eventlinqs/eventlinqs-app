/*
 * EventLinqs push service worker.
 *
 * Deliberately push-only: it registers NO fetch handler, so it never intercepts
 * navigations or assets and cannot affect caching, updates, or LCP. It exists
 * solely to show Web Push notifications and route clicks to the event.
 */

self.addEventListener('push', function (event) {
  if (!event.data) return
  var payload
  try {
    payload = event.data.json()
  } catch (e) {
    payload = { title: 'EventLinqs', body: event.data.text(), url: '/' }
  }
  var title = payload.title || 'EventLinqs'
  var options = {
    body: payload.body || '',
    data: { url: payload.url || '/' },
    tag: payload.tag,
    icon: '/icon1',
    badge: '/icon1',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var client = list[i]
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
