/* =====================================================================
   PEÇA JÁ · app.js — rotas, menu lateral retrátil, transições, topo
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, D = PJ.D, $ = PJ.$, esc = PJ.esc;
const App = PJ.App = {};

// Cada rota exige permissões. O banco também valida (RLS) — o menu só esconde o que não pode.
const OP = ['dados.ver', 'modulo.operacao'], PF = ['dados.ver', 'modulo.performance'], CL = ['dados.ver', 'modulo.clientes'];
App.routes = [
  { id: 'dashboard', t: 'Dashboard', icon: 'grid', sec: null, can: () => PJ.can('dados.ver') },
  { id: 'vendas', t: 'Vendas', icon: 'cart', sec: 'Operação', can: () => PJ.can(...OP) },
  { id: 'entregas', t: 'Entregas', icon: 'truck', sec: 'Operação', can: () => PJ.can(...OP) },
  { id: 'sla', t: 'SLA', icon: 'clock', sec: 'Operação', can: () => PJ.can(...OP) },
  { id: 'parceiros', t: 'Parceiros', icon: 'route', sec: 'Operação', can: () => PJ.can(...OP) },
  { id: 'faturamento', t: 'Faturamento', icon: 'trend', sec: 'Performance', can: () => PJ.can(...PF) },
  { id: 'custos', t: 'Custo logístico', icon: 'wallet', sec: 'Performance', can: () => PJ.can(...PF) },
  { id: 'indicadores', t: 'Indicadores', icon: 'gauge', sec: 'Performance', can: () => PJ.can(...PF) },
  { id: 'conversao', t: 'Conversão', icon: 'funnel', sec: 'Performance', can: () => PJ.can(...PF) },
  { id: 'clientes', t: 'Clientes PEÇA JÁ', icon: 'users', sec: 'Clientes', can: () => PJ.can(...CL) },
  { id: 'aptos', t: 'Clientes aptos', icon: 'usercheck', sec: 'Clientes', can: () => PJ.can(...CL) },
  { id: 'acoes', t: 'Ações PEÇA JÁ', icon: 'rocket', sec: 'Evolução', can: () => PJ.can('acoes.ver') },
  { id: 'usuarios', t: 'Usuários', icon: 'shield', sec: 'Administração', can: () => PJ.can('usuarios.ver') },
  { id: 'permissoes', t: 'Permissões', icon: 'key', sec: 'Administração', can: () => PJ.can('usuarios.ver') },
  { id: 'configuracoes', t: 'Configurações', icon: 'gear', sec: () => (PJ.can('usuarios.ver') || PJ.can('config.editar') || PJ.can('base.importar')) ? 'Administração' : 'Preferências', can: () => !!PJ.me },
];
const DATA_PAGES = new Set(['dashboard', 'vendas', 'entregas', 'sla', 'parceiros', 'faturamento', 'custos', 'indicadores', 'clientes', 'configuracoes']);
const byId = id => App.routes.find(r => r.id === id);
const secOf = r => typeof r.sec === 'function' ? r.sec() : r.sec;

// ---------- Menu ----------
App.buildNav = () => {
  let sec = undefined, h = '';
  App.routes.filter(r => r.can()).forEach(r => {
    const rs = secOf(r);
    if (rs !== sec) { sec = rs; if (sec) h += `<div class="nav-sec">${esc(sec)}</div>`; }
    h += `<a class="nav-a" href="#/${r.id}" data-r="${r.id}" data-label="${esc(r.t)}">${PJ.icon(r.icon)}<span class="t">${esc(r.t)}</span></a>`;
  });
  $('#nav').innerHTML = h;
};
App.markNav = id => PJ.$$('#nav .nav-a').forEach(a => { const on = a.dataset.r === id; a.classList.toggle('active', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
// tooltip do menu recolhido
const tip = $('#navTip');
$('#nav').addEventListener('mouseover', e => { const a = e.target.closest('.nav-a'); if (!a || !document.body.classList.contains('sb-collapsed') || innerWidth <= 900) return;
  const r = a.getBoundingClientRect(); tip.textContent = a.dataset.label; tip.style.left = (r.right + 12) + 'px'; tip.style.top = (r.top + r.height / 2 - 15) + 'px'; tip.classList.add('show'); });
$('#nav').addEventListener('mouseout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.nav-a')) tip.classList.remove('show'); });
$('#nav').addEventListener('focusin', e => { const a = e.target.closest('.nav-a'); if (a && document.body.classList.contains('sb-collapsed') && innerWidth > 900) { const r = a.getBoundingClientRect(); tip.textContent = a.dataset.label; tip.style.left = (r.right + 12) + 'px'; tip.style.top = (r.top + r.height / 2 - 15) + 'px'; tip.classList.add('show'); } });
$('#nav').addEventListener('focusout', () => tip.classList.remove('show'));
$('#nav').addEventListener('click', () => { tip.classList.remove('show'); App.closeDrawer(); });

const setCollapsed = c => { document.body.classList.toggle('sb-collapsed', c); PJ.pref.set('sbCollapsed', c);
  $('#sbToggle').innerHTML = PJ.icon('chevsL') + `<span class="t">${c ? 'Expandir menu' : 'Recolher menu'}</span>`; $('#sbToggle').setAttribute('aria-label', c ? 'Expandir menu' : 'Recolher menu');
  $('#sbToggle').setAttribute('aria-expanded', String(!c)); };
$('#sbToggle').onclick = () => setCollapsed(!document.body.classList.contains('sb-collapsed'));
App.openDrawer = () => { document.body.classList.add('sb-open'); const s = PJ.h('<div class="scrim" id="scrim"></div>'); s.onclick = App.closeDrawer; document.body.appendChild(s); $('#menuBtn').setAttribute('aria-expanded', 'true'); };
App.closeDrawer = () => { document.body.classList.remove('sb-open'); const s = $('#scrim'); s && s.remove(); $('#menuBtn').setAttribute('aria-expanded', 'false'); };
$('#menuBtn').onclick = () => document.body.classList.contains('sb-open') ? App.closeDrawer() : App.openDrawer();
document.addEventListener('keydown', e => { if (e.key === 'Escape') App.closeDrawer(); });

// ---------- Topo ----------
App.renderTop = () => {
  $('#topBrand').innerHTML = PJ.brandHTML(true);
  $('#menuBtn').innerHTML = PJ.icon('menu'); $('#cfgBtn').innerHTML = PJ.icon('gear'); $('#outBtn').innerHTML = PJ.icon('logout');
  const me = PJ.me;
  $('#userBtn').innerHTML = `<span class="avatar">${esc(PJ.fmt.initials(me.nome || me.email))}</span><span class="who"><b>${esc(me.nome || me.email)}</b><span class="role ${me.perfil}">${esc(me.perfil_nome || PJ.PERFIS[me.perfil])}</span></span>`;
  $('#userBtn').setAttribute('aria-label', `Perfil: ${me.nome || me.email}`);
  $('#cfgBtn').setAttribute('data-tip', 'Configurações'); $('#outBtn').setAttribute('data-tip', 'Sair'); $('#bellBtn').setAttribute('data-tip', 'Notificações');
};
$('#userBtn').onclick = () => PJ.Auth.userMenu();
$('#outBtn').onclick = async () => { if (await PJ.confirm({ title: 'Sair do sistema', text: 'Deseja encerrar sua sessão no PEÇA JÁ?', ok: 'Sair', icon: 'logout' })) PJ.Auth.logout(); };
$('#cfgBtn').onclick = () => { location.hash = '#/configuracoes'; };
$('#bellBtn').onclick = () => PJ.Notif.open();

// ---------- Roteador com transição ----------
let cur = null, off = null, navSeq = 0;
const denied = r => `<div class="grid" style="margin-top:40px"><div class="card c12 soon" style="align-items:center;text-align:center;padding:40px"><div class="ic" style="margin:0 auto">${PJ.icon('lock')}</div>
  <h3 style="margin:8px 0 0;font:700 18px var(--f-display)">Acesso restrito</h3><div class="d" style="color:var(--ink-2)">Seu perfil (${esc(PJ.me.perfil_nome)}) não tem permissão para ${r ? '<b>' + esc(r.t) + '</b>' : 'esta página'}.</div>
  <a class="btn btn-ghost" href="#/${App.home()}" style="margin-top:8px">Voltar ao início</a></div></div>`;
App.home = () => (App.routes.find(r => r.can()) || { id: 'dashboard' }).id;
App.go = async () => {
  if (!PJ.me) return;
  let id = (location.hash.match(/^#\/([a-z\-]+)/) || [])[1] || App.home();
  const r = byId(id); if (!r) { location.replace('#/' + App.home()); return; }
  const my = ++navSeq, view = $('#view');
  if (cur) { view.classList.add('leaving'); await new Promise(res => setTimeout(res, PJ.reduced() ? 0 : 140)); if (my !== navSeq) return; }
  off && off(); off = null; cur = id; window.scrollTo({ top: 0 });
  App.markNav(id);
  $('#crumb').innerHTML = (secOf(r) ? `<span>${esc(secOf(r))}</span>${PJ.icon('chevR')}` : '') + `<b>${esc(r.t)}</b>`;
  document.title = `${r.t} · PEÇA JÁ`;
  view.classList.remove('leaving', 'entering'); void view.offsetWidth; view.classList.add('entering');
  if (!r.can()) { view.innerHTML = denied(r); return; }
  const page = PJ.pages[id];
  try {
    await page.mount(view);
    if (my !== navSeq) return;
    if (DATA_PAGES.has(id)) { off = D.on(() => { if (cur === id) page.update(); }); if (D.loaded) page.update(); else if (!D.loadingStarted) { D.loadingStarted = true; D.loadAll(); } }
  } catch (e) { console.error('Erro ao abrir a página:', e); view.innerHTML = `<div class="banner err">${PJ.icon('alert')}<div class="grow">${esc(PJ.friendly(e))}</div></div>`; }
  setTimeout(() => view.classList.remove('entering'), 400);
};
window.addEventListener('hashchange', () => { if (PJ.me && !/access_token|type=recovery/.test(location.hash)) App.go(); });

// ---------- Ciclo de vida ----------
App.start = () => {
  $('#app').hidden = false; App.renderTop(); App.buildNav(); setCollapsed(PJ.pref.get('sbCollapsed', false));
  D.CUR_IMP = null; D.loaded = false; D.loadingStarted = false;
  if (PJ.can('dados.ver')) { D.loadingStarted = true; D.loadAll(); }
  PJ.Notif.start();
  if (/access_token|type=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#/' + App.home());
  cur = null; App.go();
};
App.stop = () => {
  $('#app').hidden = true; off && off(); off = null; cur = null; PJ.Notif.stop();
  Object.assign(D, { OPC: null, RES: null, CUR_IMP: null, loaded: false, loadingStarted: false, error: null, slaSeg: null });
  Object.keys(D.F).forEach(k => D.F[k] = ''); $('#view').innerHTML = ''; const m = $('#userMenu'); m && m.remove();
};

PJ.Auth.init();
})();
