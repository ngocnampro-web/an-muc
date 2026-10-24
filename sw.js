/* Án Mực — service worker: chạy offline sau lần mở đầu.
   index.html: mạng trước (có bản mới là thấy), mất mạng thì dùng bản đã lưu.
   Chỉ xử lý GET cùng nguồn; không bao giờ chặn hay lưu yêu cầu tới API AI (khác nguồn). */
const VERSION = '829014299605';
const CACHE = 'anmuc-' + VERSION;
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './favicon.ico', './favicon-32.png'];
const SCOPE = new URL('./', self.location).pathname;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('anmuc-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  else if (e.data === 'version' && e.ports[0]) e.ports[0].postMessage(VERSION);
});

const isPage = (req, url) => req.mode === 'navigate' || url.pathname === SCOPE || url.pathname === SCOPE + 'index.html';
const fromCache = async req => {
  const c = await caches.open(CACHE);
  return (await c.match(req, { ignoreSearch: true })) || (await c.match('./index.html')) || (await c.match('./'));
};
async function pageNetworkFirst(req) {
  const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(async res => {
    if (res.ok && res.type === 'basic') { const c = await caches.open(CACHE); await Promise.all([c.put('./index.html', res.clone()), c.put('./', res.clone())]); }
    return res;
  });
  // Mạng chập chờn: sau 6 giây dùng bản đã lưu (nếu có), mạng về sau vẫn cập nhật bộ nhớ
  const slow = new Promise(r => setTimeout(r, 6000)).then(fromCache);
  try { return await Promise.race([net, slow.then(r => r || net)]); }
  catch (err) { return (await fromCache(req)) || Response.error(); }
}
async function cacheFirst(req) {
  const c = await caches.open(CACHE); const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') c.put(req, res.clone());
  return res;
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return; // API AI, CDN… đi thẳng ra mạng
  e.respondWith(isPage(req, url) ? pageNetworkFirst(req) : cacheFirst(req));
});
