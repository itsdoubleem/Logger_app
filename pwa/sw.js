/* 근무기록 Work Log — offline shell.
 *
 * The app is one self-contained HTML file: fonts, React, the dc runtime and
 * every asset are already inside it, so there is nothing to cache except the
 * file itself and the install icons. No request ever leaves the device, and
 * this worker never adds one.
 *
 * Bump CACHE on every rebuild — build.py stamps it.
 */
const CACHE = 'worklog-__BUILD__';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // one miss (a host that does not serve './') must not fail the install
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ── Navigations ──
  // This was cache-first with a background refresh: serve the cached shell
  // instantly, fetch the new one for *next* time. Offline that is perfect, and
  // on a hosted site it is invisible. In the APK it was not: updating the app
  // put a new index.html in assets/ that nobody saw, because the worker kept
  // answering from the old cache. The new build only appeared on the second
  // launch. A worker who installs an update, opens the app and sees no change
  // concludes the update failed — and in an app that exists to be trusted with
  // wage evidence, that is the wrong thing to teach them.
  //
  // So: prefer fresh, but never wait on a dead connection. The network and a
  // short timer race, and the cache always answers when the timer wins. In the
  // APK the page comes from WebViewAssetLoader on the device, so "the network"
  // is local and instant and an update is visible the first time it is opened.
  // Offline, fetch fails at once and this is cache-first again.
  const NAV_TIMEOUT = 1500;
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match('./index.html').then((hit) => {
          const net = fetch(req).then((res) => {
            if (res && res.ok) {
              // keep the cache current even when the timer already won
              e.waitUntil(c.put('./index.html', res.clone()));
              return res;
            }
            return null;
          }).catch(() => null);
          // nothing cached yet — the network is the only answer there is
          if (!hit) return net.then((res) => res || fetch(req));
          const timer = new Promise((done) => setTimeout(() => done(null), NAV_TIMEOUT));
          return Promise.race([net, timer]).then((res) => res || hit);
        })
      )
    );
    return;
  }

  // Everything else is a static file that only changes on a rebuild.
  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
          return res;
        })
      )
    )
  );
});
