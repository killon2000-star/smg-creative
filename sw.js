// SMG 크리에이티브 서비스워커: 앱 화면(HTML·JS·CSS·아이콘)만 저장해 빠르게 시작.
// Firestore·로그인(Google/Firebase) 등 다른 주소 요청은 절대 저장·가로채지 않음.
const V = 'smgc-v3', SHELL = V + '-shell', ASSETS = V + '-assets';
const scope = new URL(self.registration.scope);
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll([scope.pathname, scope.pathname + 'manifest.webmanifest']).catch(() => {}))); });
self.addEventListener('activate', e => { e.waitUntil((async () => { for (const k of await caches.keys()) if (!k.startsWith(V)) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
async function trim(c, max = 80) { const ks = await c.keys(); for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]); }
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(scope.pathname) || u.pathname.includes('/__/')) return; // 외부(Firestore·인증) 무시
  if (r.mode === 'navigate') { // 화면: 네트워크 우선(새 배포 즉시 반영) → 오프라인·느릴 때 저장본
    e.respondWith((async () => { const c = await caches.open(SHELL);
      try { const res = await fetch(r, { cache: 'no-store' }); if (res.ok) c.put(scope.pathname, res.clone()); return res; }
      catch { return (await c.match(scope.pathname)) || Response.error(); } })()); return; }
  if (/\/assets\/|\/icons\/|\.(png|woff2)$/.test(u.pathname)) { // 해시 붙은 파일: 저장본 우선
    e.respondWith((async () => { const c = await caches.open(ASSETS); const hit = await c.match(r); if (hit) return hit;
      const res = await fetch(r); if (res.ok && res.type === 'basic') { c.put(r, res.clone()); trim(c); } return res; })()); }
});
