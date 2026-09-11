/* Service worker: офлайн-оболочка и открытие приложения по уведомлению.

   Стратегия обновления. Раньше всё, кроме разметки, отдавалось из кэша и
   никогда не перепроверялось — установленное приложение навсегда оставалось
   на той версии, которую скачало при первой установке. Теперь файлы отдаются
   из кэша мгновенно, но параллельно скачиваются заново, так что следующий
   запуск уже свежий. Страница сама перезагружается, когда новый воркер
   вступает в силу. */

var VERSION = 'v3';
var CACHE = 'timevalue-' + VERSION;
var SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/quotes.js',
  './js/store.js',
  './js/notify.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function putInCache(req, res) {
  if (!res || res.status !== 200 || res.type !== 'basic') return res;
  var copy = res.clone();
  caches.open(CACHE).then(function (c) { c.put(req, copy); });
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; /* шрифты идут своим путём */

  /* Разметка — из сети, кэш только как запас на офлайн. */
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
    e.respondWith(
      fetch(req)
        .then(function (res) { return putInCache(req, res); })
        .catch(function () {
          return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
        })
    );
    return;
  }

  /* Остальное — сразу из кэша, обновление скачивается в фоне. */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var fromNetwork = fetch(req)
        .then(function (res) { return putInCache(req, res); })
        .catch(function () { return hit; });
      return hit || fromNetwork;
    })
  );
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
