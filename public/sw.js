/**
 * Sync's service worker.
 *
 * Deliberately does one thing: receive push messages and show them. There is no
 * caching here and no offline mode, which is a choice rather than an omission.
 *
 * Every page in this app is one person's private half of a shared conversation,
 * and the whole product assumes phones get handed around and read over
 * shoulders. A cache would leave a reveal, a menu, or an opened letter sitting in
 * storage where the next person to open the app offline sees it — and it would
 * serve a stale "waiting for them" screen after they had in fact answered, which
 * is the one lie the app must never tell. Being unusable on a train is a smaller
 * cost than either.
 *
 * The push payload is written by send_nudges() in Postgres and carries no content
 * from anybody's answers, guesses, menu, or letters. It says that something
 * happened and where to look. A lock screen is a public surface.
 */

self.addEventListener('install', () => {
  // Replace the previous worker immediately instead of waiting for every tab to
  // close. Nothing here is cached, so there is no stale state to protect.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    // A push with a body we cannot parse still has to show something: the
    // browser will post a generic "This site has been updated in the background"
    // notice if a userVisibleOnly subscription receives a push and shows nothing,
    // which looks broken. Ours is at least in our own voice.
    data = {}
  }

  const title = data.title || 'Sync'
  const options = {
    body: data.body || 'Something is waiting for you.',
    icon: '/brand/syncicon.png',
    badge: '/brand/syncicon.png',
    // Android only, and ignored where unsupported.
    vibrate: [14, 40, 22],
    // Collapses repeats in the tray. Postgres already guarantees one nudge of
    // each kind per person per day, so this is belt-and-braces against a retry
    // that the send side thinks failed and the phone received anyway.
    tag: data.tag || 'sync',
    renotify: false,
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const target = new URL(event.notification.data?.url || '/', self.location.origin)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Reuse a tab that is already open on this origin rather than stacking up
      // another one. On iOS an installed PWA has exactly one window, and opening
      // a second does nothing useful.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(target.href)
            } catch {
              // Cross-document navigation can be refused; the focus already
              // happened, which is the important half.
            }
          }
          return
        }
      }

      await self.clients.openWindow(target.href)
    })(),
  )
})
