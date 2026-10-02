/* =====================================================================
   PEÇA JÁ · pages-dados.js — módulos alimentados pela base publicada
   Cada página: mount(view) monta a estrutura (com animação de entrada);
   update() preenche/atualiza com os dados de PJ.D (animando a transição).
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, D = PJ.D, $ = PJ.$, esc = PJ.esc, F = PJ.fmt, CH = () => PJ.charts;
PJ.pages = PJ.pages || {};

// ---------- Renderizadores compartilhados (gráficos do painel original) ----------
const R = PJ.R = {};
const tipStd = g => PJ.tipHTML(g.key, [['Entregas', F.int(g.n)], ['Faturamento', F.brl(g.valor)], ['Custo', F.brl(g.custo)], ['% custo', F.pct(g.pc)], ['SLA médio', F.hms(g.sla)]]);

// Média de SLA por tipo de venda (laranja = acima da média geral)
R.slaTipo = (el, A) => {
  const gt = D.group('por_tipo').filter(g => g.slaN > 0).sort((a, b) => b.sla - a.sla);
  CH().hbars(el, gt.map(g => { const hi = g.sla > A.sla; return { key: g.key, label: g.key, sub: `${F.int(g.slaN)} vendas`, value: g.sla, display: F.hms(g.sla),
    color: hi ? 'var(--warn)' : 'var(--s1)', tip: PJ.tipHTML(g.key, [['SLA médio', F.hms(g.sla)], ['Entregas válidas', F.int(g.slaN)], [hi ? 'Acima da média' : 'Abaixo da média', F.hms(A.sla)]]) }; }),
    { empty: 'Nenhuma entrega com SLA válido nos filtros atuais.' });
};
// Participação por transportadora (quantidade de entregas)
R.donutPar = (el, A) => {
  const gp = D.group('por_transportadora').sort((a, b) => b.n - a.n);
  CH().donut(el, gp.map(g => ({ key: g.key, label: g.key, value: g.n, color: D.parColor(g.key),
    tip: PJ.tipHTML(g.key, [['Entregas', F.int(g.n)], ['Participação', F.pct(A.n ? g.n / A.n : NaN)], ['Custo', F.brl(g.custo)]]) })),
    { center: { value: A.n, label: 'entregas' }, aria: 'Participação por transportadora' });
};
// SLA médio por transportadora com seletor de segmento
R.segSelect = id => { const segs = [...((D.OPC && D.OPC.opcoes && D.OPC.opcoes.seg) || [])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (D.slaSeg == null) { const p = String((D.OPC && D.OPC.config && D.OPC.config.segmento_padrao_sla) || '').trim().toUpperCase(); D.slaSeg = (p && segs.find(s => s.trim().toUpperCase() === p)) || ''; }
  if (D.slaSeg && !segs.includes(D.slaSeg)) D.slaSeg = '';
  return `<select class="select" id="${id}" aria-label="Segmento do gráfico"><option value="">Todos os segmentos</option>${segs.map(s => `<option value="${esc(s)}"${s === D.slaSeg ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>`; };
R.slaPar = (el, descEl) => {
  const sg = D.slaSeg || '';
  if (descEl) descEl.textContent = (sg ? `Somente ${sg.trim().toLowerCase()} · ` : 'Todos os segmentos · ') + 'média dos SLAs válidos.';
  const gs = D.slaBySeg(sg).sort((a, b) => a.sla - b.sla);
  CH().hbars(el, gs.map(g => ({ key: g.key, label: g.key, sub: `${F.int(g.slaN)} entregas`, value: g.sla, display: F.hms(g.sla), color: D.parColor(g.key),
    tip: PJ.tipHTML(g.key, [['SLA médio', F.hms(g.sla)], ['Entregas válidas', F.int(g.slaN)]]) })), { empty: 'Sem entregas desse segmento nos filtros atuais.' });
};
R.bindSeg = (selId, el, descEl) => { const s = $('#' + selId); if (s) s.onchange = () => { D.slaSeg = s.value; R.slaPar(el, descEl); }; };
// Custo logístico por transportadora × meta
R.custoPar = (el, meta) => {
  const gc = D.group('por_transportadora').filter(g => g.valor > 0).sort((a, b) => b.pc - a.pc);
  CH().hbars(el, gc.map(g => { const ok = g.pc <= meta; return { key: g.key, label: g.key, sub: `${F.brlK(g.custo)} de custo`, value: g.pc, color: D.parColor(g.key),
    display: `<span class="pill ${ok ? 'ok' : 'no'}" style="padding:1px 7px">${PJ.icon(ok ? 'check' : 'arrowUp')}${F.pct(g.pc)}</span>`,
    tip: PJ.tipHTML(g.key, [['Custo', F.brl(g.custo)], ['Faturamento', F.brl(g.valor)], ['% custo', F.pct(g.pc)], ['Meta', F.pct(meta)]]) }; }),
    { ref: isFinite(meta) ? { value: meta, label: 'meta ' + F.pct(meta) } : null, max: Math.max(...gc.map(g => g.pc), isFinite(meta) ? meta : 0) * 1.15 || 1 });
};
// Faturamento e custo por mês (% de custo abaixo de cada mês)
R.mes = (el, meta) => {
  const gm = D.months();
  CH().columns(el, gm.map(g => ({ key: g.key, label: F.mes(g.key), values: [g.valor, g.custo],
    tips: [PJ.tipHTML(F.mesF(g.key), [['Faturamento', F.brl(g.valor)], ['Entregas', F.int(g.n)]]), PJ.tipHTML(F.mesF(g.key), [['Custo logístico', F.brl(g.custo)], ['% custo', F.pct(g.pc)]])],
    under: { text: `${g.pc <= meta ? '✓' : '▲'} ${F.pct(g.pc)}`, sub: `${F.int(g.n)} entregas`, color: g.pc <= meta ? 'var(--good)' : 'var(--bad)' } })),
    { series: [{ name: 'Faturamento', color: 'var(--s1)' }, { name: 'Custo logístico', color: 'var(--sky)' }], fmtAxis: v => F.brlK(v).replace('R$ ', ''), aria: 'Faturamento e custo por mês' });
};
// Custo por segmento (maiores segmentos, % sobre faturamento)
R.custoSeg = (el, meta) => {
  const gs = D.group('por_segmento').filter(g => g.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 7);
  CH().hbars(el, gs.map(g => ({ key: g.key, label: g.key.trim(), sub: `${F.int(g.n)} vendas`, value: g.pc, color: 'var(--s1)',
    display: `<span style="color:${g.pc <= meta ? 'var(--good)' : 'var(--bad)'}">${F.pct(g.pc)}</span>`, tip: tipStd(g) })),
    { ref: isFinite(meta) ? { value: meta, label: 'meta' } : null, max: Math.max(...gs.map(g => g.pc), isFinite(meta) ? meta : 0) * 1.15 || 1, cols: 'minmax(90px,140px) minmax(0,1fr) auto' });
};
// Linha de cartões de parceiros (carrossel)
R.partners = (el, A, meta) => {
  if (!el) return;
  const gp = D.group('por_transportadora').sort((a, b) => b.n - a.n);
  if (!gp.length) { el.innerHTML = PJ.emptyHTML('Sem entregas nos filtros atuais.', 'route'); return; }
  const best = gp.filter(g => g.slaN > 0).sort((a, b) => a.sla - b.sla)[0];
  el.innerHTML = `<div class="row-scroll"><button class="row-nav l" type="button" aria-label="Anterior">${PJ.icon('chevL')}</button>
    <div class="row-track stagger">${gp.map((g, i) => { const ok = g.pc <= meta, sh = A.n ? g.n / A.n : 0;
      return `<article class="pcard" style="--c:${D.parColor(g.key)};--i:${i}" tabindex="0" aria-label="${esc(g.key)}">
        <div class="nm"><b>${esc(g.key)}</b>${isFinite(g.pc) && isFinite(meta) ? `<span class="pill ${ok ? 'ok' : 'no'}">${PJ.icon(ok ? 'check' : 'alert')}${ok ? 'Na meta' : 'Acima da meta'}</span>` : ''}</div>
        <div class="share num">${F.pct(sh, 1)}<small>das entregas</small></div>
        <div class="pbar"><i style="--v:0" data-v="${sh}"></i></div>
        <div class="meta"><div><span>SLA médio</span><b>${F.hms(g.sla)}</b>${best && best.key === g.key ? ' <span class="pill info" style="padding:1px 6px;font-size:10px">melhor</span>' : ''}</div><div><span>% custo</span><b>${F.pct(g.pc)}</b></div>
        <div><span>Entregas</span><b>${F.int(g.n)}</b></div><div><span>Custo</span><b>${F.brlK(g.custo)}</b></div></div></article>`; }).join('')}</div>
    <button class="row-nav r" type="button" aria-label="Próximo">${PJ.icon('chevR')}</button></div>`;
  PJ.rowNav(el.firstElementChild);
  PJ.raf2(() => el.querySelectorAll('.pbar i').forEach(i => i.style.setProperty('--v', i.dataset.v)));
};
PJ.rowNav = rs => {
  const tr = rs.querySelector('.row-track'), l = rs.querySelector('.row-nav.l'), r = rs.querySelector('.row-nav.r');
  const upd = () => { l.disabled = tr.scrollLeft < 8; r.disabled = tr.scrollLeft + tr.clientWidth >= tr.scrollWidth - 8; };
  l.onclick = () => tr.scrollBy({ left: -tr.clientWidth * .85 }); r.onclick = () => tr.scrollBy({ left: tr.clientWidth * .85 });
  tr.addEventListener('scroll', upd, { passive: true }); setTimeout(upd, 50);
};
const hbarsBy = (el, rows, metric, opts = {}) => CH().hbars(el, rows.map(g => ({ key: g.key, label: g.key, sub: opts.sub ? opts.sub(g) : '', value: metric.v(g), display: metric.f(metric.v(g)),
  color: opts.color ? opts.color(g) : 'var(--s1)', tip: tipStd(g) })), opts);
const soonCard = (icon, title, text, cls = 'c6') => `<div class="card soon ${cls}"><div class="ic">${PJ.icon(icon)}</div><div><h3 style="margin:0 0 4px;font:600 15px var(--f-display)">${esc(title)}</h3><div class="d" style="color:var(--ink-2);font-size:13px">${text}</div></div></div>`;

// ---------- Página-modelo de dados ----------
function dataPage(def) {
  return {
    title: def.title,
    mount(view) { view.innerHTML = D.pageHead(def.head) + def.html(); D.renderBars(); def.bind && def.bind(); },
    update() { D.renderBars(); if (!D.loaded) return; const A = D.total(), meta = D.meta(); def.update(A, meta); },
  };
}

// =====================================================================
// DASHBOARD
// =====================================================================
PJ.pages.dashboard = dataPage({
  title: 'Dashboard',
  head: { eyebrow: 'Visão geral', title: 'Dashboard', sub: 'Indicadores estratégicos do PEÇA JÁ conforme os filtros.' },
  html: () => `
  <section class="hero" id="hero">
    <svg class="routes" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true"><path d="M-10 250 C 150 200, 250 80, 420 120 S 700 260, 1010 60"/><path d="M-10 120 C 120 160, 300 40, 520 90 S 820 30, 1010 180" style="animation-duration:9s"/>
      </svg>
    <div><div class="eyebrow">Centro de Controle</div><h1>Logística PEÇA JÁ <span>sob controle.</span></h1><p id="heroSub">Carregando a base publicada…</p>
      <div class="ctas"><a class="btn btn-primary" href="#/sla">${PJ.icon('clock')}Ver SLA</a><a class="btn btn-ghost" href="#/parceiros">${PJ.icon('route')}Parceiros</a>${PJ.can('acoes.ver') ? `<a class="btn btn-ghost" href="#/acoes">${PJ.icon('rocket')}Ações PEÇA JÁ</a>` : ''}</div></div>
    <div class="hero-stats stagger" id="heroStats">${[0, 1, 2, 3].map(i => `<div class="hstat" style="--i:${i}"><div class="sk" style="height:62px"></div></div>`).join('')}</div>
  </section>
  <section class="section"><div class="kpis stagger">
    ${D.kpiHTML('vendas', 'Vendas PEÇA JÁ', 'cart', 'var(--blue)')}${D.kpiHTML('entregas', 'Entregas', 'truck', 'var(--sky)')}
    ${D.kpiHTML('fat', 'Faturamento', 'trend', 'var(--s2)')}${D.kpiHTML('custo', 'Custo logístico', 'wallet', 'var(--s4)')}
    ${D.kpiHTML('pc', '% custo logístico', 'target', 'var(--warn)')}${D.kpiHTML('sla', 'SLA médio', 'clock', 'var(--s5)')}</div></section>
  <section class="section"><div class="section-h"><h2>Performance dos parceiros</h2><a class="linkbtn" href="#/parceiros">Ver todos ${PJ.icon('chevR')}</a></div><div id="dPar"></div></section>
  <section class="section grid stagger">
    ${D.card('dMes', 'Faturamento e custo por mês', 'Mesmo eixo em R$; abaixo de cada mês, o % de custo e as entregas.', { cls: 'c8' })}
    ${D.card('dDonut', 'Participação por transportadora', 'Calculada pela quantidade de entregas.', { cls: 'c4' })}
    ${D.card('dSlaTipo', 'Média de SLA por tipo de venda', 'Laranja = SLA acima da média geral do filtro.', { cls: 'c7' })}
    ${D.card('dCustoPar', 'Custo logístico por transportadora × meta', 'Custo ÷ faturamento. Linha tracejada = meta.', { cls: 'c5' })}
  </section>
  ${PJ.can('acoes.ver') ? `<section class="section"><div class="section-h"><h2>Ações PEÇA JÁ em destaque</h2><a class="linkbtn" href="#/acoes">Centro de Evolução ${PJ.icon('chevR')}</a></div><div id="dAcoes"><div class="sk" style="height:200px"></div></div></section>` : ''}`,
  bind() { if (PJ.can('acoes.ver') && PJ.Acoes) PJ.Acoes.destaques($('#dAcoes')); },
  update(A, meta) {
    const o = D.OPC || {}, imp = o.importacao;
    $('#heroSub').innerHTML = imp ? `Base com vendas de <b>${F.date(o.data_min)}</b> a <b>${F.date(o.data_max)}</b> · ${F.int(o.total)} registros · ${imp.status === 'publicada' ? 'publicada ' + F.rel(imp.publicada_em) : 'rascunho'}.` : 'Nenhuma base publicada ainda.';
    const gp = D.group('por_transportadora'), best = gp.filter(g => g.slaN > 0).sort((a, b) => a.sla - b.sla)[0], big = gp.slice().sort((a, b) => b.n - a.n)[0];
    const ok = A.pc <= meta;
    $('#heroStats').innerHTML = [
      ['% custo × meta', F.pct(A.pc), isFinite(meta) && A.n ? `<span class="pill ${ok ? 'ok' : 'no'}">${PJ.icon(ok ? 'check' : 'arrowUp')}${ok ? 'Dentro' : 'Acima'} da meta ${F.pct(meta)}</span>` : ''],
      ['SLA médio', F.hms(A.sla), `${F.int(A.slaN)} entregas válidas`],
      ['Melhor SLA', best ? esc(best.key) : '–', best ? F.hms(best.sla) + ' de média' : ''],
      ['Maior volume', big ? esc(big.key) : '–', big ? F.pct(A.n ? big.n / A.n : NaN, 1) + ' das entregas' : ''],
    ].map((s, i) => `<div class="hstat" style="--i:${i}"><div class="l">${s[0]}</div><div class="v">${s[1]}</div><div class="s">${s[2]}</div></div>`).join('');
    const m = D.months();
    D.setKpi('vendas', A.codigos, F.int, 'códigos de venda', { delta: D.momDelta('codigos', F.int), better: 'up', spark: m.map(x => x.codigos) });
    D.setKpi('entregas', A.n, F.int, '', { delta: D.momDelta('n', F.int), better: 'up', spark: m.map(x => x.n) });
    D.setKpi('fat', A.valor, F.brl, '', { delta: D.momDelta('valor', F.brl), better: 'up', spark: m.map(x => x.valor), sparkColor: 'var(--s2)' });
    D.setKpi('custo', A.custo, F.brl, `média ${F.brl(A.n ? A.custo / A.n : 0)}/entrega`, { spark: m.map(x => x.custo), sparkColor: 'var(--s4)' });
    D.setKpi('pc', A.pc, v => F.pct(v), isFinite(meta) && A.n ? `meta ${F.pct(meta)}` : '', { delta: D.momDelta('pc', v => F.pct(v), 'pp'), better: 'down', spark: m.map(x => x.pc), sparkColor: 'var(--warn)' });
    D.setKpi('sla', A.sla, F.hms, `${F.int(A.slaN)} válidas`, { delta: D.momDelta('sla', F.hms), better: 'down', spark: m.map(x => x.sla), sparkColor: 'var(--s5)' });
    R.partners($('#dPar'), A, meta); R.mes($('#dMes'), meta); R.donutPar($('#dDonut'), A); R.slaTipo($('#dSlaTipo'), A); R.custoPar($('#dCustoPar'), meta);
  },
});

// =====================================================================
// OPERAÇÃO
// =====================================================================
const stTipo = { k: 'valor', d: -1 }, stEmp = { k: 'n', d: -1 }, stPar = { k: 'n', d: -1 }, stSeg = { k: 'valor', d: -1 }, stMes = { k: 'key', d: 1 };
let showAllEmp = false;
PJ.pages.vendas = dataPage({
  title: 'Vendas',
  head: { eyebrow: 'Operação', title: 'Vendas', sub: 'Volume, faturamento e custo por tipo de venda, equipe e filial.' },
  html: () => `<div class="kpis stagger" style="grid-template-columns:repeat(4,minmax(0,1fr))">${D.kpiHTML('vendas', 'Vendas PEÇA JÁ', 'cart')}${D.kpiHTML('fat', 'Faturamento', 'trend', 'var(--s2)')}${D.kpiHTML('ticket', 'Ticket médio por venda', 'target', 'var(--sky)')}${D.kpiHTML('epv', 'Entregas por venda', 'truck', 'var(--s4)')}</div>
    <section class="section grid stagger">${D.card('vTipo', 'Vendas por tipo de venda', 'Códigos de venda distintos.')}${D.card('vEq', 'Vendas por equipe', 'Códigos de venda distintos por equipe.')}
    ${D.card('vTbTipo', 'Custo de frete por tipo de venda', 'Clique no título da coluna para ordenar.', { cls: 'c12' })}
    ${D.card('vTbEmp', 'Custo e SLA por filial', 'Clique no título da coluna para ordenar.', { cls: 'c12', foot: '<button class="btn btn-ghost btn-sm more" type="button" id="vMore" hidden></button>' })}</section>`,
  bind() { $('#vMore').onclick = () => { showAllEmp = !showAllEmp; PJ.pages.vendas.update(); }; },
  update(A, meta) {
    const m = D.months();
    D.setKpi('vendas', A.codigos, F.int, 'códigos de venda', { delta: D.momDelta('codigos', F.int), better: 'up', spark: m.map(x => x.codigos) });
    D.setKpi('fat', A.valor, F.brl, '', { delta: D.momDelta('valor', F.brl), better: 'up', spark: m.map(x => x.valor), sparkColor: 'var(--s2)' });
    D.setKpi('ticket', A.codigos ? A.valor / A.codigos : NaN, F.brl, 'faturamento ÷ vendas', { spark: m.map(x => x.codigos ? x.valor / x.codigos : null) });
    D.setKpi('epv', A.codigos ? A.n / A.codigos : NaN, v => F.dec(v, 2), 'entregas ÷ vendas', { spark: m.map(x => x.codigos ? x.n / x.codigos : null), sparkColor: 'var(--s4)' });
    hbarsBy($('#vTipo'), D.group('por_tipo').sort((a, b) => b.codigos - a.codigos), { v: g => g.codigos, f: F.int }, { sub: g => F.brlK(g.valor) });
    hbarsBy($('#vEq'), D.group('por_equipe').sort((a, b) => b.codigos - a.codigos), { v: g => g.codigos, f: F.int }, { sub: g => F.brlK(g.valor), color: () => 'var(--s2)' });
    D.table($('#vTbTipo'), D.withShare(D.group('por_tipo'), A), D.stdCols('Tipo de venda', A, meta), stTipo, { foot: Object.assign(A, { share: 1 }) });
    const emp = D.withShare(D.group('por_filial'), A);
    D.table($('#vTbEmp'), emp, D.stdCols('Filial', A, meta), stEmp, { foot: A, limit: 15, all: showAllEmp });
    const mb = $('#vMore'); mb.hidden = emp.length <= 15; mb.textContent = showAllEmp ? 'Mostrar só as 15 primeiras' : `Mostrar todas as ${emp.length} filiais`;
  },
});

PJ.pages.entregas = dataPage({
  title: 'Entregas',
  head: { eyebrow: 'Operação', title: 'Entregas', sub: 'Volume de entregas por mês, tipo de expedição, transportadora e filial.' },
  html: () => `<div class="kpis stagger" style="grid-template-columns:repeat(4,minmax(0,1fr))">${D.kpiHTML('n', 'Entregas', 'truck')}${D.kpiHTML('val', 'Com SLA válido', 'checkc', 'var(--good)')}${D.kpiHTML('rec', 'Recusadas / sem SLA', 'alert', 'var(--warn)')}${D.kpiHTML('dia', 'Média por mês', 'calendar', 'var(--sky)')}</div>
    <section class="section grid stagger">${D.card('eMes', 'Entregas por mês', 'Abaixo de cada mês, o número de vendas.', { cls: 'c8' })}${D.card('eDonut', 'Participação por transportadora', 'Calculada pela quantidade de entregas.', { cls: 'c4' })}
    ${D.card('eExp', 'Entregas por tipo de expedição', '')}${D.card('eEmp', 'Filiais com mais entregas', '10 maiores no filtro.')}</section>`,
  update(A) {
    const m = D.months();
    D.setKpi('n', A.n, F.int, '', { delta: D.momDelta('n', F.int), better: 'up', spark: m.map(x => x.n) });
    D.setKpi('val', A.slaN, F.int, A.n ? F.pct(A.slaN / A.n, 1) + ' do total' : '', { spark: m.map(x => x.slaN), sparkColor: 'var(--good)' });
    D.setKpi('rec', A.n - A.slaN, F.int, 'RECUSADA ou sem SLA (fora da média)', { spark: m.map(x => x.n - x.slaN), sparkColor: 'var(--warn)' });
    D.setKpi('dia', m.length ? A.n / m.length : NaN, F.int, m.length ? `${m.length} meses no período` : '');
    CH().columns($('#eMes'), m.map(g => ({ key: g.key, label: F.mes(g.key), values: [g.n], tips: [PJ.tipHTML(F.mesF(g.key), [['Entregas', F.int(g.n)], ['Vendas', F.int(g.codigos)], ['SLA médio', F.hms(g.sla)]])], under: { text: `${F.int(g.codigos)} vendas` } })),
      { series: [{ name: 'Entregas', color: 'var(--s1)' }], fmtAxis: F.int, aria: 'Entregas por mês' });
    R.donutPar($('#eDonut'), A);
    hbarsBy($('#eExp'), D.group('por_expedicao').sort((a, b) => b.n - a.n), { v: g => g.n, f: F.int }, { sub: g => F.pct(A.n ? g.n / A.n : NaN, 1), color: () => 'var(--sky)' });
    hbarsBy($('#eEmp'), D.group('por_filial').sort((a, b) => b.n - a.n).slice(0, 10), { v: g => g.n, f: F.int }, { sub: g => F.hms(g.sla) + ' SLA' });
  },
});

PJ.pages.sla = dataPage({
  title: 'SLA',
  head: { eyebrow: 'Operação', title: 'SLA de entrega', sub: 'Média dos registros válidos. "RECUSADA" e vazios não entram na média.' },
  html: () => `<div class="kpis stagger" style="grid-template-columns:repeat(4,minmax(0,1fr))">${D.kpiHTML('sla', 'SLA médio', 'clock', 'var(--s5)')}${D.kpiHTML('val', 'Entregas válidas', 'checkc', 'var(--good)')}${D.kpiHTML('best', 'Melhor tipo de venda', 'arrowDown', 'var(--good)')}${D.kpiHTML('worst', 'Tipo de venda mais lento', 'arrowUp', 'var(--warn)')}</div>
    <section class="section grid stagger">${D.card('sTipo', 'Média de SLA por tipo de venda', 'Laranja = acima da média geral do filtro. Formato hh:mm:ss ou dias + horas.', { cls: 'c7' })}
    ${D.card('sPar', 'SLA médio por transportadora', '', { cls: 'c5', descId: 'sParD', head: '<div id="sSegWrap"></div>' })}
    ${D.card('sMes', 'Evolução do SLA médio', 'Linha tracejada = média do período.', { cls: 'c8' })}${D.card('sSeg', 'SLA por segmento', '', { cls: 'c4' })}
    ${D.card('sEmp', 'Filiais com SLA mais alto', '10 filiais com maior SLA médio no filtro.', { cls: 'c12' })}</section>`,
  update(A) {
    const m = D.months(), gt = D.group('por_tipo').filter(g => g.slaN > 0).sort((a, b) => a.sla - b.sla);
    D.setKpi('sla', A.sla, F.hms, '', { delta: D.momDelta('sla', F.hms), better: 'down', spark: m.map(x => x.sla), sparkColor: 'var(--s5)' });
    D.setKpi('val', A.slaN, F.int, A.n ? F.pct(A.slaN / A.n, 1) + ' das entregas' : '');
    const kb = $('#k_best .v'), kw = $('#k_worst .v');
    kb.textContent = gt[0] ? gt[0].key : '–'; $('#k_best .s').textContent = gt[0] ? F.hms(gt[0].sla) : '';
    kw.textContent = gt.length ? gt[gt.length - 1].key : '–'; $('#k_worst .s').textContent = gt.length ? F.hms(gt[gt.length - 1].sla) : '';
    R.slaTipo($('#sTipo'), A);
    $('#sSegWrap').innerHTML = R.segSelect('sSegSel'); R.bindSeg('sSegSel', $('#sPar'), $('#sParD')); R.slaPar($('#sPar'), $('#sParD'));
    CH().line($('#sMes'), m.filter(x => x.slaN).map(x => ({ key: x.key, label: F.mes(x.key), value: x.sla, tip: PJ.tipHTML(F.mesF(x.key), [['SLA médio', F.hms(x.sla)], ['Entregas válidas', F.int(x.slaN)]]) })),
      { color: 'var(--s5)', fmt: F.hms, ref: isFinite(A.sla) ? { value: A.sla, label: 'média ' + F.hms(A.sla) } : null, min0: false, aria: 'Evolução do SLA' });
    hbarsBy($('#sSeg'), D.group('por_segmento').filter(g => g.slaN).sort((a, b) => a.sla - b.sla), { v: g => g.sla, f: F.hms }, { sub: g => F.int(g.slaN) + ' válidas', color: g => g.sla > A.sla ? 'var(--warn)' : 'var(--s1)' });
    hbarsBy($('#sEmp'), D.group('por_filial').filter(g => g.slaN).sort((a, b) => b.sla - a.sla).slice(0, 10), { v: g => g.sla, f: F.hms }, { sub: g => F.int(g.slaN) + ' válidas', color: g => g.sla > A.sla ? 'var(--warn)' : 'var(--s1)' });
  },
});

PJ.pages.parceiros = dataPage({
  title: 'Parceiros',
  head: { eyebrow: 'Operação', title: 'Parceiros logísticos', sub: 'Participação, SLA e custo de cada transportadora.' },
  html: () => `<div id="pRow"></div><section class="section grid stagger">
    ${D.card('pCusto', 'Custo logístico por transportadora × meta', 'Custo ÷ faturamento. Linha tracejada = meta.', { cls: 'c7' })}${D.card('pDonut', 'Participação por transportadora', 'Calculada pela quantidade de entregas.', { cls: 'c5' })}
    ${D.card('pSla', 'SLA médio por transportadora', '', { cls: 'c6', descId: 'pSlaD', head: '<div id="pSegWrap"></div>' })}${D.card('pFat', 'Faturamento por transportadora', 'Valor das notas atendidas.', { cls: 'c6' })}
    ${D.card('pTb', 'Comparativo de parceiros', 'Clique no título da coluna para ordenar.', { cls: 'c12' })}</section>`,
  update(A, meta) {
    R.partners($('#pRow'), A, meta); R.custoPar($('#pCusto'), meta); R.donutPar($('#pDonut'), A);
    $('#pSegWrap').innerHTML = R.segSelect('pSegSel'); R.bindSeg('pSegSel', $('#pSla'), $('#pSlaD')); R.slaPar($('#pSla'), $('#pSlaD'));
    hbarsBy($('#pFat'), D.group('por_transportadora').sort((a, b) => b.valor - a.valor), { v: g => g.valor, f: F.brlK }, { sub: g => F.int(g.n) + ' entregas', color: g => D.parColor(g.key) });
    D.table($('#pTb'), D.withShare(D.group('por_transportadora'), A), D.stdCols('Transportadora', A, meta), stPar, { foot: A });
  },
});

// =====================================================================
// PERFORMANCE
// =====================================================================
PJ.pages.faturamento = dataPage({
  title: 'Faturamento',
  head: { eyebrow: 'Performance', title: 'Faturamento', sub: 'Valor das notas fiscais atendidas pelo PEÇA JÁ.' },
  html: () => `<div class="kpis stagger" style="grid-template-columns:repeat(4,minmax(0,1fr))">${D.kpiHTML('fat', 'Faturamento', 'trend', 'var(--s2)')}${D.kpiHTML('ticket', 'Ticket médio por venda', 'target')}${D.kpiHTML('mes', 'Média mensal', 'calendar', 'var(--sky)')}${D.kpiHTML('best', 'Melhor mês', 'sparkle', 'var(--s4)')}</div>
    <section class="section grid stagger">${D.card('fMes', 'Faturamento e custo por mês', 'Mesmo eixo em R$; o % de custo do mês aparece abaixo.', { cls: 'c12' })}
    ${D.card('fSeg', 'Faturamento por segmento', '')}${D.card('fEmp', 'Filiais com maior faturamento', '10 maiores no filtro.')}</section>`,
  update(A, meta) {
    const m = D.months(), bm = m.slice().sort((a, b) => b.valor - a.valor)[0];
    D.setKpi('fat', A.valor, F.brl, '', { delta: D.momDelta('valor', F.brl), better: 'up', spark: m.map(x => x.valor), sparkColor: 'var(--s2)' });
    D.setKpi('ticket', A.codigos ? A.valor / A.codigos : NaN, F.brl, `${F.int(A.codigos)} vendas`);
    D.setKpi('mes', m.length ? A.valor / m.length : NaN, F.brl, m.length ? `${m.length} meses` : '');
    $('#k_best .v').textContent = bm ? F.mes(bm.key) : '–'; $('#k_best .s').textContent = bm ? F.brl(bm.valor) : '';
    R.mes($('#fMes'), meta);
    hbarsBy($('#fSeg'), D.group('por_segmento').sort((a, b) => b.valor - a.valor), { v: g => g.valor, f: F.brlK }, { sub: g => F.pct(A.valor ? g.valor / A.valor : NaN, 1), color: () => 'var(--s2)' });
    hbarsBy($('#fEmp'), D.group('por_filial').sort((a, b) => b.valor - a.valor).slice(0, 10), { v: g => g.valor, f: F.brlK }, { sub: g => F.int(g.codigos) + ' vendas' });
  },
});

PJ.pages.custos = dataPage({
  title: 'Custo logístico',
  head: { eyebrow: 'Performance', title: 'Custo logístico', sub: '% de custo = custo de frete ÷ valor da nota fiscal.' },
  html: () => `<div class="kpis stagger" style="grid-template-columns:repeat(4,minmax(0,1fr))">${D.kpiHTML('custo', 'Custo logístico', 'wallet', 'var(--s4)')}${D.kpiHTML('pc', '% custo logístico', 'target', 'var(--warn)')}${D.kpiHTML('meta', 'Meta de custo', 'flag', 'var(--bad)')}${D.kpiHTML('med', 'Custo médio por entrega', 'truck', 'var(--sky)')}</div>
    <section class="section grid stagger">${D.card('cMes', '% de custo por mês × meta', 'Linha tracejada vermelha = meta definida para o painel.', { cls: 'c7' })}${D.card('cPar', 'Custo logístico por transportadora × meta', 'Custo ÷ faturamento.', { cls: 'c5' })}
    ${D.card('cSeg', 'Custo por segmento', '% de custo sobre faturamento, maiores segmentos.', { cls: 'c5' })}${D.card('cTipo', 'Custo de frete por tipo de venda', 'Clique no título da coluna para ordenar.', { cls: 'c7' })}</section>`,
  update(A, meta) {
    const m = D.months(), ok = A.pc <= meta;
    D.setKpi('custo', A.custo, F.brl, '', { spark: m.map(x => x.custo), sparkColor: 'var(--s4)' });
    D.setKpi('pc', A.pc, v => F.pct(v), isFinite(meta) && A.n ? `<span class="pill ${ok ? 'ok' : 'no'}">${ok ? 'Dentro' : 'Acima'} da meta</span>` : '', { delta: D.momDelta('pc', v => F.pct(v), 'pp'), better: 'down', spark: m.map(x => x.pc), sparkColor: 'var(--warn)' });
    D.setKpi('meta', meta, v => F.pct(v), 'definida em Configurações');
    D.setKpi('med', A.n ? A.custo / A.n : NaN, F.brl, '', { spark: m.map(x => x.n ? x.custo / x.n : null) });
    CH().line($('#cMes'), m.filter(x => x.valor).map(x => ({ key: x.key, label: F.mes(x.key), value: x.pc, tip: PJ.tipHTML(F.mesF(x.key), [['% custo', F.pct(x.pc)], ['Custo', F.brl(x.custo)], ['Faturamento', F.brl(x.valor)]]) })),
      { color: 'var(--warn)', fmt: v => F.pct(v, 1), ref: isFinite(meta) ? { value: meta, label: 'meta ' + F.pct(meta) } : null, min0: false, aria: '% de custo por mês' });
    R.custoPar($('#cPar'), meta); R.custoSeg($('#cSeg'), meta);
    D.table($('#cTipo'), D.withShare(D.group('por_tipo'), A), D.stdCols('Tipo de venda', A, meta), stTipo, { foot: A });
  },
});

PJ.pages.indicadores = dataPage({
  title: 'Indicadores',
  head: { eyebrow: 'Performance', title: 'Indicadores', sub: 'Scorecard mensal consolidado da base publicada.' },
  html: () => `<section class="grid stagger">${D.card('iTb', 'Scorecard mensal', 'Clique no título da coluna para ordenar.', { cls: 'c12' })}</section>
    <section class="section"><div class="section-h"><h2>Indicadores aguardando fonte de dados</h2></div><div class="grid stagger">
    ${soonCard('funnel', 'Conversão', 'A base atual traz apenas vendas faturadas. Para medir conversão é preciso a base de orçamentos/cotações (com status ganho/perdido).', 'c4')}
    ${soonCard('box', 'Pedidos em andamento e pendentes', 'A planilha não traz o status do pedido. Inclua uma coluna de status (ex.: em rota, pendente, entregue) para habilitar estes indicadores.', 'c4')}
    ${soonCard('usercheck', 'Clientes aptos', 'Requer o cadastro de clientes com o critério de aptidão ao PEÇA JÁ.', 'c4')}</div></section>`,
  update(A, meta) {
    const rows = D.months();
    D.table($('#iTb'), rows, [
      { k: 'key', t: 'Mês', l: true, f: r => esc(F.mesF(r.key)), ff: () => 'Total do período' },
      { k: 'codigos', t: 'Vendas', f: r => F.int(r.codigos) }, { k: 'n', t: 'Entregas', f: r => F.int(r.n) },
      { k: 'valor', t: 'Faturamento', f: r => F.brl(r.valor) }, { k: 'custo', t: 'Custo', f: r => F.brl(r.custo) },
      { k: 'pc', t: '% custo', f: r => D.metaPill(r.pc, meta) }, { k: 'sla', t: 'SLA médio', f: r => F.hms(r.sla) },
    ], stMes, { foot: A });
  },
});

PJ.pages.conversao = {
  title: 'Conversão',
  mount(view) { view.innerHTML = D.pageHead({ eyebrow: 'Performance', title: 'Conversão', filters: false }) + `<div class="grid stagger">
    ${soonCard('funnel', 'Módulo preparado — aguardando a base de orçamentos', 'A conversão (orçamentos → vendas) não pode ser calculada com a base atual, que contém apenas vendas faturadas e entregas. Quando a base de orçamentos/cotações estiver disponível, ela poderá ser importada para uma nova tabela e este módulo passa a exibir taxa de conversão por filial, equipe e segmento. Nenhum número é exibido aqui para não mostrar dados inventados.', 'c12')}
    <div class="card c12"><div class="card-h"><div><h3>Enquanto isso</h3><div class="d">Indicadores de volume disponíveis hoje.</div></div></div><div class="ctas" style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-ghost" href="#/vendas">${PJ.icon('cart')}Vendas</a><a class="btn btn-ghost" href="#/indicadores">${PJ.icon('gauge')}Scorecard mensal</a></div></div></div>`; },
  update() {},
};

// =====================================================================
// CLIENTES
// =====================================================================
PJ.pages.clientes = dataPage({
  title: 'Clientes PEÇA JÁ',
  head: { eyebrow: 'Clientes', title: 'Clientes PEÇA JÁ', sub: 'Visão por segmento de cliente (a base não identifica o cliente individual).' },
  html: () => `<div class="kpis stagger" style="grid-template-columns:repeat(4,minmax(0,1fr))">${D.kpiHTML('nseg', 'Segmentos atendidos', 'layers')}${D.kpiHTML('top', 'Maior segmento', 'sparkle', 'var(--s2)')}${D.kpiHTML('topsh', 'Participação do maior', 'pie', 'var(--sky)')}${D.kpiHTML('pc', '% custo logístico', 'target', 'var(--warn)')}</div>
    <section class="section grid stagger">${D.card('clFat', 'Faturamento por segmento', '')}${D.card('clCusto', 'Custo por segmento', '% de custo sobre faturamento. Linha tracejada = meta.')}
    ${D.card('clSla', 'SLA por segmento', 'Laranja = acima da média geral.')}${D.card('clDonut', 'Vendas por segmento', 'Participação em códigos de venda.')}
    ${D.card('clTb', 'Segmentos de clientes', 'Clique no título da coluna para ordenar.', { cls: 'c12' })}</section>`,
  update(A, meta) {
    const gs = D.group('por_segmento'), top = gs.slice().sort((a, b) => b.valor - a.valor)[0];
    D.setKpi('nseg', gs.length, F.int, 'no filtro atual');
    $('#k_top .v').textContent = top ? top.key : '–'; $('#k_top .s').textContent = top ? F.brl(top.valor) : '';
    D.setKpi('topsh', top && A.valor ? top.valor / A.valor : NaN, v => F.pct(v, 1), 'do faturamento');
    D.setKpi('pc', A.pc, v => F.pct(v), isFinite(meta) ? 'meta ' + F.pct(meta) : '');
    hbarsBy($('#clFat'), gs.slice().sort((a, b) => b.valor - a.valor), { v: g => g.valor, f: F.brlK }, { sub: g => F.int(g.codigos) + ' vendas', color: () => 'var(--s2)' });
    R.custoSeg($('#clCusto'), meta);
    hbarsBy($('#clSla'), gs.filter(g => g.slaN).sort((a, b) => a.sla - b.sla), { v: g => g.sla, f: F.hms }, { sub: g => F.int(g.slaN) + ' válidas', color: g => g.sla > A.sla ? 'var(--warn)' : 'var(--s1)' });
    const tot = gs.reduce((s, g) => s + g.codigos, 0), cols = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
    const ord = gs.slice().sort((a, b) => a.key.localeCompare(b.key, 'pt-BR')), main = ord.slice().sort((a, b) => b.codigos - a.codigos);
    const head = main.slice(0, 5), rest = main.slice(5);
    const items = head.map(g => ({ key: g.key, label: g.key, value: g.codigos, color: cols[ord.indexOf(g) % 5], tip: PJ.tipHTML(g.key, [['Vendas', F.int(g.codigos)], ['Participação', F.pct(tot ? g.codigos / tot : NaN, 1)]]) }));
    if (rest.length) { const v = rest.reduce((s, g) => s + g.codigos, 0); items.push({ key: '__outros', label: `Outros (${rest.length})`, value: v, color: 'var(--s-other)', tip: PJ.tipHTML('Outros segmentos', [['Vendas', F.int(v)]]) }); }
    CH().donut($('#clDonut'), items, { center: { value: tot, label: 'vendas' }, aria: 'Vendas por segmento' });
    D.table($('#clTb'), D.withShare(gs, A), D.stdCols('Segmento', A, meta), stSeg, { foot: A });
  },
});
PJ.pages.aptos = {
  title: 'Clientes aptos',
  mount(view) { view.innerHTML = D.pageHead({ eyebrow: 'Clientes', title: 'Clientes aptos', filters: false }) + `<div class="grid stagger">
    ${soonCard('usercheck', 'Módulo preparado — aguardando o cadastro de clientes', 'Para listar os clientes aptos ao PEÇA JÁ é necessário importar o cadastro de clientes com o critério de aptidão (ex.: região atendida, segmento, volume mínimo). A base atual tem apenas o segmento de cada venda — veja a análise em Clientes PEÇA JÁ.', 'c12')}
    <div class="card c12"><a class="btn btn-ghost" href="#/clientes" style="align-self:flex-start">${PJ.icon('users')}Ver segmentos de clientes</a></div></div>`; },
  update() {},
};
})();
