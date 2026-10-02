/* =====================================================================
   PEÇA JÁ · data.js — estado dos indicadores, filtros globais e helpers
   Toda a agregação acontece no banco (RPC dashboard_resumo). Uma chamada
   por mudança de filtro alimenta TODOS os módulos de dados.
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, $ = PJ.$, esc = PJ.esc, F = PJ.fmt;

const D = PJ.D = {
  OPC: null, RES: null, CUR_IMP: null, loaded: false, error: null,
  F: { dIni: '', dFim: '', tipo: '', seg: '', par: '', exp: '', eq: '', emp: '' },
  slaSeg: null,
  ls: new Set(),
};
D.FILTERS = [
  ['tipo', 'Tipo de venda', 'p_tipo_venda', 'Todos'], ['seg', 'Segmento', 'p_segmento', 'Todos'],
  ['par', 'Transportadora', 'p_transportadora', 'Todas'], ['exp', 'Tipo de expedição', 'p_tipo_expedicao', 'Todos'],
  ['eq', 'Equipe', 'p_equipe', 'Todas'], ['emp', 'Filial', 'p_filial', 'Todas'],
];
D.OPTKEY = { tipo: 'tipo', seg: 'seg', par: 'par', exp: 'exp', eq: 'eq', emp: 'emp' };
D.on = fn => { D.ls.add(fn); return () => D.ls.delete(fn); };
D.emit = () => D.ls.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
D.EMPTY = { total: { n: 0, valor: 0, custo: 0, sla_n: 0, sla_soma: 0, codigos: 0 }, por_tipo: [], por_transportadora: [], sla_transportadora_segmento: [], por_segmento: [], por_filial: [], por_equipe: [], por_expedicao: [], por_mes: [] };

D.params = () => {
  const p = { p_importacao_id: D.CUR_IMP, p_data_ini: D.F.dIni || null, p_data_fim: D.F.dFim || null };
  D.FILTERS.forEach(([k, , arg]) => p[arg] = D.F[k] || null);
  return p;
};
D.activeCount = () => Object.values(D.F).filter(Boolean).length;

// Remove filtros cujo valor não existe mais na base atual
function sanitize() {
  const o = (D.OPC && D.OPC.opcoes) || {}; let changed = false;
  D.FILTERS.forEach(([k]) => { if (D.F[k] && !(o[D.OPTKEY[k]] || []).includes(D.F[k])) { D.F[k] = ''; changed = true; } });
  return changed;
}

let seq = 0;
D.loadAll = async function () {
  if (!PJ.sb) return;
  const my = ++seq; PJ.loading(true); document.body.classList.add('loading-data');
  try {
    const [o, r] = await Promise.all([PJ.rpc('dashboard_opcoes', { p_importacao_id: D.CUR_IMP }), PJ.rpc('dashboard_resumo', D.params())]);
    if (my !== seq) return;
    D.OPC = o; D.RES = r;
    if (sanitize()) D.RES = await PJ.rpc('dashboard_resumo', D.params());
    if (my !== seq) return;
    D.loaded = true; D.error = null; D.emit();
  } catch (e) { if (my === seq) { D.error = PJ.friendly(e); D.loaded = true; D.emit(); } }
  finally { PJ.loading(false); if (my === seq) document.body.classList.remove('loading-data'); }
};
D.loadResumo = async function () {
  if (!PJ.sb) return;
  const my = ++seq; PJ.loading(true); document.body.classList.add('loading-data');
  try { const r = await PJ.rpc('dashboard_resumo', D.params()); if (my !== seq) return; D.RES = r; D.error = null; D.emit(); }
  catch (e) { if (my === seq) { D.error = PJ.friendly(e); D.emit(); } }
  finally { PJ.loading(false); if (my === seq) document.body.classList.remove('loading-data'); }
};
const reload = PJ.debounce(() => D.loadResumo(), 260);
D.setFilter = (k, v) => { D.F[k] = v || ''; reload(); D.renderBars(); };
D.clearFilters = () => { Object.keys(D.F).forEach(k => D.F[k] = ''); D.loadResumo(); D.renderBars(); };

// ---------- Agregados ----------
D.G = o => { const n = +o.n || 0, v = +o.valor || 0, c = +o.custo || 0, sn = +o.sla_n || 0;
  return { key: o.key, n, valor: v, custo: c, pc: v ? c / v : NaN, slaN: sn, sla: sn ? (+o.sla_soma) / sn : null, codigos: +o.codigos || 0 }; };
D.R = () => D.RES || D.EMPTY;
D.total = () => D.G(D.R().total);
D.group = name => (D.R()[name] || []).map(D.G);
D.meta = () => { const m = D.OPC && D.OPC.config ? +D.OPC.config.meta_custo_pct : NaN; return isFinite(m) ? m / 100 : NaN; };
D.months = () => D.group('por_mes').sort((a, b) => a.key < b.key ? -1 : 1);
// Comparativo: último mês do período filtrado vs o mês anterior
D.mom = () => { const m = D.months(); return m.length >= 2 ? { cur: m[m.length - 1], prev: m[m.length - 2] } : null; };
D.slaBySeg = seg => {
  const acc = new Map();
  (D.R().sla_transportadora_segmento || []).forEach(x => { if (seg && x.seg !== seg) return;
    const a = acc.get(x.key) || { key: x.key, n: 0, valor: 0, custo: 0, sla_n: 0, sla_soma: 0 }; a.sla_n += +x.sla_n || 0; a.sla_soma += +x.sla_soma || 0; acc.set(x.key, a); });
  return [...acc.values()].map(D.G).filter(g => g.slaN > 0);
};

// ---------- Cores por transportadora (fixas por entidade, nunca pelo ranking) ----------
const FIXED = { Shippify: 'var(--s1)', Uber: 'var(--s2)', Lalamove: 'var(--s3)', Outros: 'var(--s-other)', '(sem parceiro)': 'var(--s-other)', '(vazio)': 'var(--s-other)' };
const POOL = ['var(--s4)', 'var(--s5)', 'var(--s1)', 'var(--s2)', 'var(--s3)'];
D.parColor = name => {
  if (FIXED[name]) return FIXED[name];
  const others = [...((D.OPC && D.OPC.opcoes && D.OPC.opcoes.par) || [])].filter(p => !FIXED[p]).sort();
  const i = others.indexOf(name); return i < 0 ? 'var(--s-other)' : (i < POOL.length ? POOL[i] : 'var(--s-other)');
};

// ---------- Componentes de cabeçalho ----------
D.pageHead = ({ eyebrow, title, sub, filters = true, extra = '' }) => `
  <div class="page-head"><div><div class="eyebrow">${esc(eyebrow || '')}</div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>
  <div class="fbar">${extra}${filters ? '<div class="fbar" data-fbar></div>' : ''}</div></div>
  <div data-banners></div>`;

D.renderBars = () => {
  PJ.$$('[data-fbar]').forEach(el => {
    const chips = [];
    if (D.F.dIni || D.F.dFim) chips.push(['dates', `Período: <b>${D.F.dIni ? F.date(D.F.dIni) : 'início'} – ${D.F.dFim ? F.date(D.F.dFim) : 'fim'}</b>`]);
    D.FILTERS.forEach(([k, lab]) => { if (D.F[k]) chips.push([k, `${esc(lab)}: <b>${esc(D.F[k])}</b>`]); });
    const n = D.activeCount();
    el.innerHTML = chips.map(([k, t]) => `<span class="chip">${t}<button type="button" data-rm="${k}" aria-label="Remover filtro">${PJ.icon('x')}</button></span>`).join('') +
      `<button class="btn btn-ghost btn-sm" type="button" data-open-filters>${PJ.icon('filter')}Filtros${n ? ` <span class="fcount">${n}</span>` : ''}</button>`;
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const k = b.dataset.rm; if (k === 'dates') { D.F.dIni = D.F.dFim = ''; reload(); D.renderBars(); } else D.setFilter(k, ''); });
    el.querySelector('[data-open-filters]').onclick = D.openFilters;
  });
  PJ.$$('[data-banners]').forEach(el => {
    let h = '';
    if (D.error) h += `<div class="banner err">${PJ.icon('alert')}<div class="grow">${esc(D.error)}</div><button class="btn btn-sm btn-ghost" type="button" data-retry>${PJ.icon('refresh')}Tentar de novo</button></div>`;
    if (D.CUR_IMP && D.OPC && D.OPC.importacao) h += `<div class="banner warn">${PJ.icon('eye')}<div class="grow"><b>Você está vendo um RASCUNHO</b> · ${esc(D.OPC.importacao.nome_arquivo)} · ${F.int(D.OPC.total)} registros. Só quem importa bases vê esta versão.</div>
      <button class="btn btn-sm btn-ghost" type="button" data-discard>Voltar à base publicada</button><button class="btn btn-sm btn-primary" type="button" data-publish>${PJ.icon('check')}Publicar para todos</button></div>`;
    if (D.loaded && !D.error && D.OPC && !D.OPC.importacao) h += `<div class="banner info">${PJ.icon('database')}<div class="grow">Nenhuma base publicada ainda.${PJ.can('base.importar') ? ' Importe a planilha em <a href="#/configuracoes">Configurações → Bases de dados</a>.' : ' Peça a um administrador para publicar a base.'}</div></div>`;
    el.innerHTML = h;
    const r = el.querySelector('[data-retry]'); if (r) r.onclick = () => D.loadAll();
    const p = el.querySelector('[data-publish]'); if (p) p.onclick = () => PJ.Bases && PJ.Bases.publish(p);
    const x = el.querySelector('[data-discard]'); if (x) x.onclick = () => { D.CUR_IMP = null; D.loadAll(); };
  });
};

// ---------- Gaveta de filtros ----------
D.openFilters = function () {
  const o = (D.OPC && D.OPC.opcoes) || {}, dmin = D.OPC && D.OPC.data_min || '', dmax = D.OPC && D.OPC.data_max || '';
  const body = PJ.h(`<div style="display:flex;flex-direction:column;gap:16px">
    <div class="field"><span class="label">Período rápido</span><div class="presets" id="fPre">
      <button type="button" data-p="all">Tudo</button><button type="button" data-p="m1">Último mês da base</button><button type="button" data-p="m3">Últimos 3 meses</button><button type="button" data-p="y">Ano da base</button></div>
      <span class="help">${dmax ? `A base vai de ${F.date(dmin)} a ${F.date(dmax)}.` : 'Sem base publicada.'}</span></div>
    <div class="grid-form"><div class="field"><label for="fIni">Data inicial</label><input class="input" type="date" id="fIni" min="${dmin}" max="${dmax}" value="${D.F.dIni}"></div>
      <div class="field"><label for="fFim">Data final</label><input class="input" type="date" id="fFim" min="${dmin}" max="${dmax}" value="${D.F.dFim}"></div></div>
    ${D.FILTERS.map(([k, lab, , all]) => { const vals = [...(o[D.OPTKEY[k]] || [])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      return `<div class="field"><label for="ff_${k}">${esc(lab)}</label><select class="select" id="ff_${k}" data-k="${k}"><option value="">${all}</option>${vals.map(v => `<option value="${esc(v)}"${v === D.F[k] ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`; }).join('')}
  </div>`);
  const foot = PJ.h(`<div style="display:flex;gap:10px;width:100%"><button class="btn btn-ghost" type="button" id="fClr">${PJ.icon('refresh')}Limpar</button><button class="btn btn-primary" type="button" id="fOk" style="flex:1">Ver resultados</button></div>`);
  const dr = PJ.drawer({ title: 'Filtros', body, foot });
  const markPre = () => body.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === preOf()));
  const preOf = () => { if (!D.F.dIni && !D.F.dFim) return 'all'; for (const p of ['m1', 'm3', 'y']) { const r = range(p); if (r && r[0] === D.F.dIni && r[1] === D.F.dFim) return p; } return ''; };
  const range = p => { if (!dmax) return null; const [y, m] = dmax.split('-').map(Number);
    const first = (yy, mm) => { while (mm < 1) { mm += 12; yy--; } return `${yy}-${String(mm).padStart(2, '0')}-01`; };
    return p === 'm1' ? [first(y, m), dmax] : p === 'm3' ? [first(y, m - 2), dmax] : p === 'y' ? [`${y}-01-01`, dmax] : ['', '']; };
  body.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const r = range(b.dataset.p) || ['', '']; D.F.dIni = r[0]; D.F.dFim = r[1];
    body.querySelector('#fIni').value = r[0]; body.querySelector('#fFim').value = r[1]; markPre(); reload(); D.renderBars(); });
  body.querySelector('#fIni').oninput = e => { D.F.dIni = e.target.value; markPre(); reload(); D.renderBars(); };
  body.querySelector('#fFim').oninput = e => { D.F.dFim = e.target.value; markPre(); reload(); D.renderBars(); };
  body.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => D.setFilter(s.dataset.k, s.value));
  foot.querySelector('#fClr').onclick = () => { D.clearFilters(); body.querySelector('#fIni').value = body.querySelector('#fFim').value = ''; body.querySelectorAll('select[data-k]').forEach(s => s.value = ''); markPre(); };
  foot.querySelector('#fOk').onclick = dr.close;
  markPre();
};

// ---------- Construtores visuais compartilhados ----------
D.kpiHTML = (id, label, icon, accent) => `<div class="kpi" id="k_${id}" style="--accent:${accent || 'var(--blue)'}">
  <div class="top"><span class="l">${esc(label)}</span><span class="ic">${PJ.icon(icon)}</span></div>
  <div class="v num"><span class="sk" style="display:inline-block;width:70%;height:24px"></span></div><div class="s"></div><div class="spark"></div></div>`;
// better: 'up' (maior é melhor), 'down' (menor é melhor), null (neutro)
D.setKpi = (id, value, fmt, sub, opts = {}) => {
  const k = $('#k_' + id); if (!k) return;
  const v = k.querySelector('.v'); if (v.querySelector('.sk')) v.textContent = '';
  PJ.countUp(v, value, fmt); v.title = isFinite(value) ? fmt(value) : '';
  let s = sub || '';
  if (opts.delta) s = D.deltaHTML(opts.delta, opts.better) + (s ? ' ' + s : '');
  k.querySelector('.s').innerHTML = s;
  PJ.charts.spark(k.querySelector('.spark'), opts.spark, opts.sparkColor || 'var(--sky)');
};
// delta: {cur, prev, label, mode:'pct'|'pp'}
D.deltaHTML = (d, better) => {
  if (!d || !isFinite(d.cur) || !isFinite(d.prev)) return '';
  let diff, txt;
  if (d.mode === 'pp') { diff = (d.cur - d.prev) * 100; txt = `${diff > 0 ? '+' : ''}${F.dec(diff, 2)} p.p.`; }
  else { if (!d.prev) return ''; diff = (d.cur - d.prev) / d.prev; txt = `${diff > 0 ? '+' : ''}${F.pct(diff, 1)}`; }
  const flat = Math.abs(diff) < (d.mode === 'pp' ? .005 : .001);
  const good = better === 'up' ? diff > 0 : better === 'down' ? diff < 0 : null;
  const cls = flat || good === null ? 'flat' : good ? 'up' : 'down';
  return `<span class="delta ${cls}" data-tip="${esc(PJ.tipHTML('Comparativo', [[F.mes(d.curKey), d.fmt(d.cur)], [F.mes(d.prevKey), d.fmt(d.prev)]]))}">${PJ.icon(flat ? 'minus' : diff > 0 ? 'arrowUp' : 'arrowDown')}${txt}</span><span>vs ${F.mes(d.prevKey)}</span>`;
};
D.momDelta = (field, fmt, mode) => { const m = D.mom(); if (!m) return null; return { cur: m.cur[field], prev: m.prev[field], curKey: m.cur.key, prevKey: m.prev.key, fmt, mode }; };

D.card = (id, title, desc, opts = {}) => `<div class="card ${opts.cls || 'c6'} lift" ${opts.style ? `style="${opts.style}"` : ''}>
  <div class="card-h"><div><h3>${esc(title)}</h3>${desc ? `<div class="d" ${opts.descId ? `id="${opts.descId}"` : ''}>${desc}</div>` : ''}</div>${opts.head || ''}</div>
  <div class="chart-body" id="${id}">${opts.sk === false ? '' : '<div class="sk" style="height:160px"></div>'}</div>${opts.foot || ''}</div>`;

// Tabela ordenável (preserva as tabelas do painel original)
D.table = function (el, rows, cols, st, opts = {}) {
  if (!el) return;
  if (!rows.length) { el.innerHTML = PJ.emptyHTML('Sem dados nos filtros atuais.', 'table'); return; }
  const g = rows.slice().sort((a, b) => { const x = a[st.k], y = b[st.k]; if (typeof x === 'string' || typeof y === 'string') return st.d * String(x).localeCompare(String(y), 'pt-BR');
    return st.d * (((isFinite(x) ? x : -1) || 0) - ((isFinite(y) ? y : -1) || 0)); });
  const shown = opts.limit && !opts.all ? g.slice(0, opts.limit) : g;
  el.innerHTML = `<div class="tw"><table><thead><tr>${cols.map(c => `<th class="sortable ${st.k === c.k ? 'sorted' + (st.d > 0 ? ' asc' : '') : ''} ${c.l ? 'l' : ''}" tabindex="0" data-k="${c.k}" scope="col">${esc(c.t)}</th>`).join('')}</tr></thead>
    <tbody>${shown.map((r, i) => `<tr class="enter" style="--i:${Math.min(i, 20)}">${cols.map(c => `<td class="${c.l ? 'l' : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}</tbody>
    ${opts.foot ? `<tfoot><tr>${cols.map(c => `<td class="${c.l ? 'l' : ''}">${c.ff ? c.ff(opts.foot) : c.f(opts.foot)}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
  el.querySelectorAll('th').forEach(th => { const go = () => { const k = th.dataset.k; if (st.k === k) st.d *= -1; else { st.k = k; st.d = cols.find(c => c.k === k).l ? 1 : -1; } D.table(el, rows, cols, st, opts); };
    th.onclick = go; th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
};
// Colunas padrão das tabelas originais (Qtd vendas, Valor faturado, Custo frete, % frete, SLA médio, % das entregas)
D.stdCols = (label, A, meta) => [
  { k: 'key', t: label, l: true, f: r => esc(r.key), ff: () => 'Total geral' },
  { k: 'n', t: 'Qtd vendas', f: r => F.int(r.n) },
  { k: 'valor', t: 'Valor faturado', f: r => F.brl(r.valor) },
  { k: 'custo', t: 'Custo frete', f: r => F.brl(r.custo) },
  { k: 'pc', t: '% frete', f: r => D.metaPill(r.pc, meta) },
  { k: 'sla', t: 'SLA médio', f: r => F.hms(r.sla) },
  { k: 'share', t: '% das entregas', f: r => F.pct(r.share), ff: () => F.pct(1) },
];
D.withShare = (rows, A) => rows.map(r => Object.assign(r, { share: A.n ? r.n / A.n : NaN }));
D.metaPill = (pc, meta) => !isFinite(pc) ? '–' : !isFinite(meta) ? F.pct(pc) :
  `<span class="pill ${pc <= meta ? 'ok' : 'no'}">${PJ.icon(pc <= meta ? 'check' : 'arrowUp')}${F.pct(pc)}</span>`;
})();
