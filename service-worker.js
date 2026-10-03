/* =====================================================================
   PEÇA JÁ · service-worker.js — app instalável (PWA) e abertura rápida
   ---------------------------------------------------------------------
   Estratégia (pensada para GitHub Pages + Supabase):
   • Arquivos do próprio site (HTML/CSS/JS/ícones): REDE PRIMEIRO, com
     cópia em cache como reserva. Online, sempre vem a versão mais nova do
     GitHub. Sem internet, o app ainda abre.
   • Bibliotecas de CDN (supabase-js, fontes, leitor de Excel): cache
     primeiro, com atualização em segundo plano.
   • Supabase (dados e login): NUNCA é guardado em cache. Os dados são
     sempre os do banco, e nada sensível fica salvo no aparelho.
   Ao mudar a lista de arquivos abaixo, aumente VERSION.
   ===================================================================== */
const VERSION = 'pecaja-v3.0.1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-cdn`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/app.css',
  './assets/js/config.js',
  './assets/js/core.js',
  './assets/js/charts.js',
  './assets/js/data.js',
  './assets/js/pages-dados.js',
  './assets/js/acoes.js',
  './assets/js/pdf.js',
  './assets/js/relatorio.js',
  './assets/js/admin.js',
  './assets/js/notificacoes.js',
  './assets/js/auth.js',
  './assets/js/pwa.js',
  './assets/js/app.js',
  './assets/icons/logo.svg',
  './assets/icons/favicon.svg',
  './assets/icons/icon-32.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      // cache: 'reload' evita pegar arquivos velhos do cache HTTP do navegador
      .then(c => Promise.all(APP_SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null))))
  );
  // Não ativa sozinho: o app mostra "Nova versão disponível" e o usuário escolhe atualizar.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('pecaja-') && !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // POST/PATCH (Supabase) passam direto
  const url = new URL(req.url);
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return; // dados: sempre rede

  // Navegação (abrir o app / recarregar): rede primeiro, reserva = index.html em cache
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) { const c = await caches.open(SHELL); c.put('./index.html', res.clone()); }
        return res;
      } catch (e) {
        return (await caches.match('./index.html', { ignoreSearch: true })) || (await caches.match('./', { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  // Arquivos do próprio site: rede primeiro, cache como reserva
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) { const c = await caches.open(SHELL); c.put(req, res.clone()); }
        return res;
      } catch (e) {
        return (await caches.match(req, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  // CDNs: cache primeiro + atualização em segundo plano
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const c = await caches.open(RUNTIME);
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});
