/* ST Admin — offline support. Its caches start with "sta-" so they never mix with the customer app. */
const APP = 'sta-app-v3.2', IMG = 'sta-img-v1';
const SHELL = ['index.html', 'admin.js', 'admin.css', 'app.css', 'config.js', 'i18n.js', 'manifest.webmanifest', 'images/admin-192.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('sta-') && ![APP, IMG].includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com') && url.pathname.startsWith('/macros')) return;
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/starter-items.json')) return;
  if (url.hostname === 'commons.wikimedia.org' || url.hostname.startsWith('fonts.')) return;
  if (req.destination === 'image') {
    e.respondWith(caches.open(IMG).then(async c => { const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => fetch(req)));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(caches.open(APP).then(async c => {
    const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
    const net = (req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' }))
      .then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
  }));
});
