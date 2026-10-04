/**
 * Makes the site an installable app that opens instantly and works offline for everything that runs on the
 * device (play the computer, analysis). The app's own files are cached per version; live data
 * (the API and games) always goes to the network.
 */

import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self as sw } from '$app/service-worker';

const CACHE = `uttt-${version}`;
/** Every route is the same single-page app, served from this file. */
const APP_PAGE = '/200.html';
const ASSETS = new Set([
  ...[...immutable, ...assets].map(({ path }) => `/${path.replace(/^\//, '')}`),
  APP_PAGE,
]);

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([...ASSETS]))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (ASSETS.has(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(request)));
  } else if (request.mode === 'navigate') {
    // Pages: the network when online (so a new version shows up), the cached app when offline.
    event.respondWith(fetch(request).catch(() => caches.match(APP_PAGE) as Promise<Response>));
  }
});
