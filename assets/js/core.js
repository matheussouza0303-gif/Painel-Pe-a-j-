/* =====================================================================
   PEÇA JÁ · core.js — utilitários, ícones, cliente Supabase, UI base
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ = window.PJ || {};

// ---------- DOM ----------
PJ.$ = (s, r = document) => r.querySelector(s);
PJ.$$ = (s, r = document) => [...r.querySelectorAll(s)];
PJ.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
PJ.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
PJ.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
PJ.reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
PJ.raf2 = fn => requestAnimationFrame(() => requestAnimationFrame(fn));

// ---------- Formatação (somente na apresentação) ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
PJ.fmt = {
  brl: v => brl.format(+v || 0),
  brlK: v => { v = +v || 0; const a = Math.abs(v);
    return a >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi'
      : a >= 1e3 ? 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'
      : 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }); },
  pct: (v, d = 2) => isFinite(v) ? (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%' : '–',
  int: v => (Math.round(+v || 0)).toLocaleString('pt-BR'),
  dec: (v, d = 1) => isFinite(v) ? (+v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–',
  hms(sec) {
    if (sec == null || !isFinite(sec)) return '–';
    sec = Math.round(sec); const p2 = n => String(n).padStart(2, '0');
    const d = Math.floor(sec / 86400), r = sec % 86400, h = Math.floor(r / 3600), m = Math.floor(r % 3600 / 60), s = r % 60;
    return d > 0 ? `${d}d ${p2(h)}:${p2(m)}` : `${p2(h)}:${p2(m)}:${p2(s)}`;
  },
  date: s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '–',
  dateTime: s => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : '–',
  rel(s) {
    if (!s) return '–'; const d = (Date.now() - new Date(s).getTime()) / 1000;
    if (d < 60) return 'agora'; if (d < 3600) return `há ${Math.floor(d / 60)} min`;
    if (d < 86400) return `há ${Math.floor(d / 3600)} h`; if (d < 86400 * 7) return `há ${Math.floor(d / 86400)} d`;
    return PJ.fmt.dateTime(s);
  },
  MES: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  MESF: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  mes: k => { const [y, m] = String(k).split('-'); return `${PJ.fmt.MES[+m - 1]}/${y.slice(2)}`; },
  mesF: k => { const [y, m] = String(k).split('-'); return `${PJ.fmt.MESF[+m - 1]} de ${y}`; },
  initials: n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?',
};
// Data de hoje no fuso de São Paulo (AAAA-MM-DD)
PJ.today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// ---------- Ícones (SVG inline, traço) ----------
const P = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  cart: 'M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2M10 20.5h.01M17 20.5h.01',
  truck: 'M3 6h11v10H3zM14 10h4l3 3v3h-7M7.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h4M18 9v6a4 4 0 0 1-4 4h-4',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01',
  gauge: 'M12 14l4-4M3.5 18a9 9 0 1 1 17 0',
  funnel: 'M3 4h18l-7 9v6l-4 2v-8z',
  users: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  usercheck: 'M15 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 11l2 2 4-4',
  user: 'M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  rocket: 'M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2M9 15l-3-3c.8-3.6 3.6-7.7 9-9 1-.2 2-.2 3 0 .2 1 .2 2 0 3-1.3 5.4-5.4 8.2-9 9zM15 9h.01',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM9 12l2 2 4-4',
  key: 'M15 3a6 6 0 0 1 0 12 6 6 0 0 1-2.3-.5L10 17H8v2H6v2H3v-3l6.5-6.5A6 6 0 0 1 15 3zM16.5 7.5h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 20a2 2 0 0 0 3.4 0',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M4 6h16M4 12h16M4 18h16',
  chevL: 'M15 18l-6-6 6-6', chevR: 'M9 18l6-6-6-6', chevD: 'M6 9l6 6 6-6', chevsL: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  filter: 'M4 5h16M7 12h10M10 19h4',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2',
  check: 'M5 12l5 5 9-10', x: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 3l10 18H2zM12 10v4M12 17.5v.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01',
  checkc: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  calendar: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  table: 'M3 5h18v14H3zM3 10h18M9 10v9',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  panel: 'M3 4h18v16H3zM9 4v16',
  arrowUp: 'M12 19V5M5 12l7-7 7 7', arrowDown: 'M12 5v14M19 12l-7 7-7-7', minus: 'M5 12h14',
  barChart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  pie: 'M21 12A9 9 0 1 1 12 3v9zM15 3.5A9 9 0 0 1 20.5 9H15z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  pause: 'M8 5v14M16 5v14',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z',
};
PJ.icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || P.info}"/></svg>`;

// ---------- Marca ----------
PJ.brandHTML = (compact) => {
  const L = (window.PJ_CONFIG || {}).LOGO_URL;
  const ag = L ? `<span class="ag"><img src="${PJ.esc(L)}" alt="Autoglass"></span>` : `<span class="ag">AUTOGLASS</span>`;
  return `${ag}<span class="sep"></span><span class="pj-mark"><span class="bolt">${PJ.icon('bolt')}</span><span><b>PEÇA <span>JÁ</span></b>${compact ? '' : '<small>Centro de Controle</small>'}</span></span>`;
};

// ---------- Cliente Supabase ----------
const C = window.PJ_CONFIG || {};
PJ.configOk = /^https?:\/\//.test(C.SUPABASE_URL || '') && !!C.SUPABASE_ANON_KEY && !/COLE_/.test(C.SUPABASE_URL + C.SUPABASE_ANON_KEY);
if (/service_role|sb_secret_/i.test(C.SUPABASE_ANON_KEY || '')) {
  console.error('ERRO DE SEGURANÇA: uma chave secreta foi colocada no frontend. Use a anon/publishable key.');
  PJ.configOk = false; PJ.secretKey = true;
}
PJ.sb = (PJ.configOk && window.supabase) ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

// Mensagens amigáveis — o detalhe técnico vai só para o console
PJ.friendly = function (e) {
  const m = String(e && (e.message || e) || ''), c = e && e.code;
  if (!c && /Failed to fetch|NetworkError|Load failed|fetch/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  if (c === '42501' || /permission|row-level security|Sem permissão|Somente o Master/i.test(m)) {
    const own = m.match(/(Somente o Master[^.]*|Você não pode[^.]*|O sistema precisa[^.]*)/);
    return own ? own[1] + '.' : 'Você não tem permissão para esta ação.';
  }
  if (c === 'PGRST301' || /JWT expired|invalid JWT/i.test(m)) return 'Sua sessão expirou. Entre novamente.';
  if (c === 'PGRST202' || c === '42883' || c === 'PGRST205' || c === '42P01') return 'O banco de dados não está configurado. Execute o supabase_schema.sql (veja o README).';
  if (c === '57014') return 'A consulta demorou demais. Tente um período ou filtro menor.';
  if (c === '23505' || /já existe/i.test(m)) return 'Já existe um registro com esses dados (e-mail duplicado?).';
  if (c === '23514' || c === '22P02' || c === '22003' || c === '22007' || c === '22008') return 'Alguns valores estão fora do formato esperado. Revise os campos.';
  if (c === '22023') return (m.length < 120 ? m : 'Dados inválidos') + (/[.!]$/.test(m) ? '' : '.');
  if (/Envio incompleto/i.test(m)) return 'O envio da base ficou incompleto. Carregue a planilha novamente.';
  if (/Rascunho não encontrado/i.test(m)) return 'Este rascunho não existe mais. Carregue a planilha novamente.';
  if (/não encontrado/i.test(m)) return 'Registro não encontrado. Atualize a página.';
  return 'Não foi possível concluir a operação agora. Tente de novo em instantes.';
};
PJ.rpc = async function (fn, args) {
  const { data, error } = await PJ.sb.rpc(fn, args || {});
  if (error) { console.error(`Erro em ${fn}:`, error); throw error; }
  return data;
};
PJ.q = async function (promise, label) {
  const { data, error } = await promise;
  if (error) { console.error(`Erro em ${label}:`, error); throw error; }
  return data;
};

// ---------- Sessão / permissões (preenchido por auth.js) ----------
PJ.me = null;
PJ.can = (...perms) => !!PJ.me && PJ.me.status === 'ativo' && (PJ.me.perfil === 'master' || perms.every(p => (PJ.me.permissoes || []).includes(p)));
PJ.isMaster = () => !!PJ.me && PJ.me.perfil === 'master' && PJ.me.status === 'ativo';
PJ.PERFIS = { master: 'Master', administrador: 'Administrador', gestor: 'Gestor', visualizacao: 'Visualização' };

// ---------- Loading do topo ----------
let loadN = 0;
PJ.loading = on => {
  const el = PJ.$('#topload'); if (!el) return;
  loadN = Math.max(0, loadN + (on ? 1 : -1));
  if (loadN > 0) { el.classList.remove('done'); el.classList.add('on'); }
  else { el.classList.add('done'); setTimeout(() => { if (!loadN) el.classList.remove('on', 'done'); }, 350); }
};

// ---------- Toast ----------
PJ.toast = function (msg, type = 'ok', opts = {}) {
  const box = PJ.$('#toasts'); const ic = { ok: 'checkc', err: 'alert', info: 'info', warn: 'alert' }[type] || 'info';
  const t = PJ.h(`<div class="toast ${type}" role="${type === 'err' ? 'alert' : 'status'}">${PJ.icon(ic)}<div class="tx" style="flex:1;min-width:0"></div><button class="x" type="button" aria-label="Fechar">${PJ.icon('x')}</button></div>`);
  const tx = t.querySelector('.tx'); tx.innerHTML = msg;
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  t.querySelector('.x').onclick = close;
  box.appendChild(t);
  const api = { el: t, close, set(m) { tx.innerHTML = m; }, progress(p) { let pr = t.querySelector('.prog'); if (!pr) { pr = PJ.h('<div class="prog"><i></i></div>'); tx.appendChild(pr); } pr.firstChild.style.width = (p * 100).toFixed(1) + '%'; } };
  if (!opts.sticky) setTimeout(close, opts.ms || (type === 'err' ? 7000 : 4200));
  return api;
};

// ---------- Modal / confirmação ----------
PJ.modal = function ({ title, body, wide, actions = [], onOpen }) {
  const prev = document.activeElement;
  const wrap = PJ.h(`<div class="modal-wrap"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mdlT">
    <div class="modal-h"><h3 id="mdlT">${PJ.esc(title)}</h3><button class="icon-btn" type="button" data-x aria-label="Fechar">${PJ.icon('x')}</button></div>
    <div class="modal-b"></div><div class="modal-f"></div></div></div>`);
  const b = wrap.querySelector('.modal-b'), f = wrap.querySelector('.modal-f');
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  const close = () => { wrap.style.opacity = '0'; wrap.style.transition = 'opacity .15s'; setTimeout(() => wrap.remove(), 160); document.removeEventListener('keydown', onKey); prev && prev.focus && prev.focus(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  actions.forEach(a => { const btn = PJ.h(`<button type="button" class="btn ${a.cls || 'btn-ghost'}">${a.icon ? PJ.icon(a.icon) : ''}${PJ.esc(a.label)}</button>`); btn.onclick = () => a.onClick ? a.onClick({ close, btn, body: b }) : close(); f.appendChild(btn); });
  if (!actions.length) f.remove();
  wrap.querySelector('[data-x]').onclick = close;
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  const first = wrap.querySelector('input,select,textarea,button:not([data-x])'); first && setTimeout(() => first.focus(), 60);
  onOpen && onOpen({ close, body: b, el: wrap });
  return { close, body: b, el: wrap };
};
PJ.confirm = function ({ title, text, ok = 'Confirmar', danger = false, icon }) {
  return new Promise(res => {
    let done = false;
    const m = PJ.modal({
      title,
      body: `<div class="confirm-ic ${danger ? 'danger' : ''}">${PJ.icon(icon || (danger ? 'alert' : 'info'))}</div><p style="margin:4px 0 0;color:var(--ink-2)">${text}</p>`,
      actions: [
        { label: 'Cancelar', onClick: ({ close }) => { done = true; res(false); close(); } },
        { label: ok, cls: danger ? 'btn-danger' : 'btn-primary', onClick: ({ close }) => { done = true; res(true); close(); } },
      ],
    });
    m.el.querySelector('.modal').classList.add('confirm');
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) res(false); } });
    obs.observe(document.body, { childList: true });
  });
};
PJ.btnBusy = (btn, on, label) => {
  if (on) { btn.dataset.l = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${PJ.esc(label || 'Aguarde…')}`; }
  else { btn.disabled = false; if (btn.dataset.l) btn.innerHTML = btn.dataset.l; }
};

// ---------- Drawer ----------
PJ.drawer = function ({ title, body, foot, onClose }) {
  const ov = PJ.h('<div class="overlay"></div>');
  const d = PJ.h(`<aside class="drawer" role="dialog" aria-modal="true" aria-label="${PJ.esc(title)}"><div class="drawer-h"><h3>${PJ.esc(title)}</h3><button class="icon-btn" type="button" data-x aria-label="Fechar">${PJ.icon('x')}</button></div><div class="drawer-b"></div></aside>`);
  const b = d.querySelector('.drawer-b');
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  if (foot) { const f = PJ.h('<div class="drawer-f"></div>'); if (typeof foot === 'string') f.innerHTML = foot; else f.appendChild(foot); d.appendChild(f); }
  const close = () => { d.classList.remove('open'); ov.classList.remove('open'); document.removeEventListener('keydown', onKey); setTimeout(() => { d.remove(); ov.remove(); }, 330); onClose && onClose(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  ov.onclick = close; d.querySelector('[data-x]').onclick = close;
  document.addEventListener('keydown', onKey);
  document.body.append(ov, d);
  PJ.raf2(() => { d.classList.add('open'); ov.classList.add('open'); });
  return { close, body: b, el: d };
};

// ---------- Tooltip global (data-tip) ----------
const tip = () => PJ.$('#tip');
document.addEventListener('mousemove', e => {
  const el = tip(); if (!el) return;
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t) { el.classList.remove('show'); return; }
  if (el._src !== t) { el.innerHTML = t.dataset.tip; el._src = t; }
  el.classList.add('show');
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y + h > innerHeight - 8) y = e.clientY - h - 14;
  el.style.left = x + 'px'; el.style.top = y + 'px';
}, { passive: true });
document.addEventListener('scroll', () => tip() && tip().classList.remove('show'), { passive: true, capture: true });

// ---------- Contador animado ----------
PJ.countUp = function (el, to, fmt, dur = 900) {
  if (!el) return; to = +to;
  const from = el._v != null && isFinite(el._v) ? el._v : 0; el._v = to;
  if (!isFinite(to)) { el.textContent = fmt(to); return; }
  if (PJ.reduced() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now(); cancelAnimationFrame(el._raf);
  const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e); if (k < 1) el._raf = requestAnimationFrame(step); };
  el._raf = requestAnimationFrame(step);
};

// ---------- Preferências de interface (só conveniência visual) ----------
PJ.pref = {
  get(k, d) { try { const v = localStorage.getItem('pj.ui.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pj.ui.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

// Mostrar/ocultar senha
document.addEventListener('click', e => {
  const b = e.target.closest('[data-eye]'); if (!b) return;
  const i = document.getElementById(b.dataset.eye); const show = i.type === 'password';
  i.type = show ? 'text' : 'password'; b.innerHTML = PJ.icon(show ? 'eyeOff' : 'eye'); b.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
});
PJ.$$('[data-eye]').forEach(b => b.innerHTML = PJ.icon('eye'));

PJ.emptyHTML = (msg, icon = 'database') => `<div class="empty">${PJ.icon(icon)}<span>${msg}</span></div>`;
})();
