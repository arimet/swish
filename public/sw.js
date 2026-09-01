/*
 * The service worker whose only job is to remove itself.
 *
 * Earlier versions shipped a Workbox worker (`vite-plugin-pwa`) so the application
 * would work offline. Offline is gone — the database is the only source of truth —
 * but a worker registered on a phone stays registered, and keeps serving the shell it
 * precached in 2026 against a database it no longer understands. That is the "I have
 * to clear everything to see the new version" people report, and it never resolves on
 * its own: the browser checks for a new worker at `/sw.js`, and with no file there the
 * SPA rewrite answered `index.html` as `text/html` — a bad MIME type, so the update
 * *failed* and the old worker was kept. The one file that could replace it was the one
 * file missing.
 *
 * So this exists, and is real JavaScript. The old worker's next update check finds it,
 * installs it, and it wipes the caches, un-registers itself and reloads the open
 * windows — which then load the current build from the network, with no worker left in
 * front of it.
 *
 * Nothing registers this file: `main.tsx` un-registers workers, it never installs one.
 * It is only ever fetched by a device that already carries the old registration.
 *
 * Deletable once no device is still carrying a 2026 worker — the same season or two as
 * the shim in `main.tsx`, and for the same reason.
 */
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // The precache first: un-registering alone would leave those megabytes on the
    // device, and a worker re-registered by an old tab would find them still warm.
    for (const key of await caches.keys()) await caches.delete(key)
    await self.registration.unregister()
    // The windows this worker still controls are showing the old shell. They are
    // reloaded rather than left as they are: without this the phone shows the stale
    // application until someone thinks to pull it down, which is the very gesture we
    // are trying to spare them.
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url)
  })())
})
