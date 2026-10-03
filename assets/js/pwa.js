/* =====================================================================
   PEÇA JÁ · pwa.js — instalação como aplicativo (PWA)
   • Registra o service worker (só em HTTPS ou localhost)
   • Botão/banner "Instalar app" — aparece SOMENTE quando a instalação
     está disponível (Android/Chrome/Edge) ou com instruções no iPhone
   • Aviso "Nova versão disponível" quando o GitHub Pages publica mudanças
   • Modo tela cheia (standalone) e aviso de conexão
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, $ = PJ.$, esc = PJ.esc;
const W = PJ.PWA = { deferred: null, mode: null, reg: null };

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIOSSafari = () => isIOS() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios/i.test(navigator.userAgent);
W.isStandalone = isStandalone;
document.documentElement.classList.toggle('standalone', isStandalone());
matchMedia('(display-mode: standalone)').addEventListener('change', () => document.documentElement.classList.toggle('standalone', isStandalone()));

// Disponível? 'prompt' (Android/Chrome/Edge) · 'ios' (instruções manuais) · null
W.available = () => isStandalone() ? null : W.deferred ? 'prompt' : isIOSSafari() ? 'ios' : null;

// ---------- UI de instalação ----------
W.refreshUI = () => {
  const av = W.available();
  PJ.$$('[data-install]').forEach(b => { b.hidden = !av; });
  const banner = $('#installBanner');
  if (banner && !av) banner.remove();
};
W.install = async () => {
  if (W.deferred) {
    const ev = W.deferred; W.deferred = null;
    try { ev.prompt(); const r = await ev.userChoice; if (r && r.outcome === 'accepted') PJ.toast('Instalando o PEÇA JÁ…', 'ok'); }
    catch (e) { console.warn('Instalação cancelada:', e); }
    W.refreshUI(); return;
  }
  if (isIOSSafari()) {
    PJ.modal({ title: 'Instalar o PEÇA JÁ no iPhone', body: `<div class="install-steps">
      <div class="install-app">${PJ.logoHTML(56)}<div><b>PEÇA JÁ</b><small>Centro de Controle</small></div></div>
      <ol><li>Toque em <b>Compartilhar</b> <span class="ios-ic">${PJ.icon('share')}</span> na barra do Safari.</li>
      <li>Role e toque em <b>Adicionar à Tela de Início</b> <span class="ios-ic">${PJ.icon('plus')}</span>.</li>
      <li>Confirme o nome <b>PEÇA JÁ</b> e toque em <b>Adicionar</b>.</li></ol>
      <p class="help">O ícone aparece na tela inicial e o app abre em tela cheia, sem a barra do navegador.</p></div>`,
      actions: [{ label: 'Entendi', cls: 'btn-primary' }] });
    return;
  }
  PJ.toast('A instalação não está disponível neste navegador. No Android use o Chrome; no iPhone, o Safari.', 'info');
};
// Banner inferior no celular (uma vez; pode ser dispensado por 14 dias)
W.maybeBanner = () => {
  const av = W.available(); if (!av || innerWidth > 900 || $('#installBanner')) return;
  const last = PJ.pref.get('installDismissed', 0); if (Date.now() - last < 14 * 864e5) return;
  const b = PJ.h(`<div class="install-banner" id="installBanner" role="dialog" aria-label="Instalar aplicativo">
    ${PJ.logoHTML(42)}<div class="grow"><b>Instale o PEÇA JÁ</b><small>Acesso rápido pela tela inicial, em tela cheia.</small></div>
    <button class="btn btn-primary btn-sm" type="button" data-ib="ok">${PJ.icon('download')}Instalar</button>
    <button class="icon-btn" type="button" data-ib="x" aria-label="Agora não">${PJ.icon('x')}</button></div>`);
  b.onclick = e => { const a = e.target.closest('[data-ib]'); if (!a) return;
    if (a.dataset.ib === 'x') PJ.pref.set('installDismissed', Date.now()); b.classList.add('out'); setTimeout(() => b.remove(), 250);
    if (a.dataset.ib === 'ok') W.install(); };
  document.body.appendChild(b);
};

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); W.deferred = e; W.refreshUI(); if (PJ.me) W.maybeBanner(); });
window.addEventListener('appinstalled', () => { W.deferred = null; W.refreshUI(); PJ.toast('PEÇA JÁ instalado! Abra pelo ícone na tela inicial.', 'ok'); });
document.addEventListener('click', e => { if (e.target.closest('[data-install]')) { e.preventDefault(); W.install(); } });

// ---------- Service worker + atualização ----------
W.showUpdate = worker => {
  if ($('#updToast')) return;
  const t = PJ.toast(`<b>Nova versão do PEÇA JÁ disponível.</b><div style="margin-top:8px"><button class="btn btn-primary btn-sm" type="button" id="updBtn">${PJ.icon('refresh')}Atualizar agora</button></div>`, 'info', { sticky: true });
  t.el.id = 'updToast';
  t.el.querySelector('#updBtn').onclick = () => { W.updating = true; worker.postMessage({ type: 'SKIP_WAITING' }); t.close(); };
};
const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && secure) {
  let reloading = false;
  // Recarrega SOMENTE quando o usuário pediu a atualização (na 1ª visita o SW assume em silêncio, sem recarregar)
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !W.updating) return; reloading = true; location.reload(); });
  window.addEventListener('load', async () => {
    try {
      const reg = W.reg = await navigator.serviceWorker.register('service-worker.js', { scope: './' });
      if (reg.waiting && navigator.serviceWorker.controller) W.showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => { const nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) W.showUpdate(nw); }); });
      // procura atualização ao voltar para o app e a cada 30 min
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    } catch (e) { console.warn('Service worker não registrado:', e); }
  });
}

// ---------- Conexão ----------
window.addEventListener('offline', () => PJ.toast('Você está sem internet. Os dados serão atualizados quando a conexão voltar.', 'warn', { ms: 6000 }));
window.addEventListener('online', () => { PJ.toast('Conexão restabelecida.', 'ok', { ms: 2500 }); if (PJ.me && PJ.D && PJ.D.loaded) PJ.D.loadAll(); });

W.refreshUI();
})();
