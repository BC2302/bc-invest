// Service worker: deixa o app abrir rápido e instalável.
// Dados financeiros nunca são guardados em cache — só os arquivos do app.
const CACHE = 'bcinvest-v1';
const ARQUIVOS = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/config.js', 'js/supa.js', 'js/ui.js', 'js/data.js',
  'js/views/auth.js', 'js/views/inicio.js', 'js/views/gastos.js',
  'js/views/metas.js', 'js/views/simulador.js', 'js/views/conta.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Rede primeiro (sempre a versão mais nova); cache só quando estiver sem internet
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
