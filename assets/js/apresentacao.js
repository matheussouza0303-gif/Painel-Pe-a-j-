/* =====================================================================
   PEÇA JÁ · apresentacao.js                     [NOVO · v3.1]
   ---------------------------------------------------------------------
   Botão "Gerar Apresentação" → PowerPoint (.pptx) da visão FILTRADA.

   Fluxo:
     1. captura os filtros atuais do painel (PJ.D.F / PJ.D.params())
     2. recalcula tudo no banco com a MESMA RPC do painel (dashboard_resumo)
        + período anterior equivalente (quando há período filtrado)
     3. busca as ações (tabela acoes, respeitando RLS)
     4. interpreta os dados (PJ.Analise — apresentacao-analise.js)
     5. monta os slides registrados em SLIDES (gráficos nativos do PowerPoint)
     6. gera o .pptx no navegador e faz o download

   Para adicionar um slide no futuro:
     PJ.Apresentacao.registrar({ id: 'meu_slide', depois: 'custo', quando: ctx => true,
                                 montar: (pres, ctx, h) => { const s = h.novo('Título', 'mensagem'); ... } });
   Biblioteca: PptxGenJS 4.0.1 (MIT) em assets/vendor/pptxgenjs — carregada só ao gerar.
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, D = PJ.D, $ = PJ.$, esc = PJ.esc;
const AP = PJ.Apresentacao = {};
const W = 13.333, H = 7.5, M = 0.6, CW = W - 2 * M;
// Cores da identidade PEÇA JÁ (hex sem #, exigência do formato)
const C = { navy: '050A34', navy2: '0B1446', navy3: '16236A', blue: '0A64FF', sky: '73C6FF', violet: '2021D4', ink: '0B1446', ink2: '3B4770', muted: '6B7699',
  line: 'DCE3F0', soft: 'F3F6FC', soft2: 'E8EEF9', white: 'FFFFFF', good: '13967E', bad: 'C62F3A', warn: 'E39A1E', goodBg: 'E2F4EE', badBg: 'FBE6E8', warnBg: 'FDF0DC', tip: 'EAF2FF' };
const PAR_FIXA = { Shippify: '3D7EF5', Uber: '13967E', Lalamove: 'BC7B1E', Outros: '6E7AA6', '(sem parceiro)': '6E7AA6', '(vazio)': '6E7AA6' };
const SERIES = ['3D7EF5', '13967E', 'BC7B1E', '9461EA', 'C2557F', '6E7AA6', '2F8FD8', 'E39A1E'];
const FONT = 'Calibri';
const cut = (s, n) => { s = String(s ?? '').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

// ---------------------------------------------------------------------
// Helpers de desenho (compartilhados por todos os slides)
// ---------------------------------------------------------------------
function helpers(pres, ctx) {
  const F = PJ.Analise.fmt;
  const parColor = (() => { const others = ctx.pars.map(g => g.key).filter(k => !PAR_FIXA[k]).sort(); const pool = ['9461EA', 'C2557F', '2F8FD8', 'E39A1E', '3D7EF5'];
    return k => PAR_FIXA[k] || pool[others.indexOf(k) % pool.length] || '6E7AA6'; })();
  const h = { F, C, parColor };
  h.text = (s, txt, o) => s.addText(txt, Object.assign({ isTextBox: true, fontFace: FONT, margin: 0, color: C.ink, fontSize: 14, valign: 'top' }, o));
  h.box = (s, x, y, w, hh, o = {}) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: hh, rectRadius: o.r ?? 0.12, fill: { color: o.fill || C.soft }, line: o.line ? { color: o.line, width: o.lw || 0.75 } : { type: 'none' },
    shadow: o.shadow ? { type: 'outer', color: '0B1446', opacity: 0.08, blur: 6, offset: 1.5, angle: 90 } : undefined, objectName: o.name });
  h.circle = (s, x, y, d, fill) => s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: 'none' } });
  // novo slide de conteúdo com título + mensagem principal (uma ideia por slide)
  h.novo = (titulo, mensagem, secao) => {
    const s = pres.addSlide({ masterName: 'PJ_CONTEUDO', sectionTitle: secao || h.secao });
    s.addText(titulo, { placeholder: 'title' });
    if (mensagem) h.text(s, mensagem, { x: M, y: 1.12, w: CW - 2.2, h: 0.5, fontSize: 15, color: C.ink2, valign: 'middle' });
    return s;
  };
  // caixa de análise automática (ícone "i" + frases)
  h.analise = (s, x, y, w, hh, frases, titulo = 'Análise automática') => {
    frases = (frases || []).filter(Boolean); if (!frases.length) return;
    h.box(s, x, y, w, hh, { fill: C.tip });
    // caixa baixa (< 1,5"): ícone à esquerda e frases ocupando toda a altura; caixa alta: ícone + título em cima
    const compacta = hh < 1.5, iy = compacta ? y + hh / 2 - 0.17 : y + 0.2;
    h.circle(s, x + 0.22, iy, 0.34, C.blue); h.text(s, 'i', { x: x + 0.22, y: iy, w: 0.34, h: 0.34, fontSize: 15, bold: true, color: C.white, align: 'center', valign: 'middle', fontFace: 'Cambria' });
    if (!compacta) h.text(s, titulo, { x: x + 0.7, y: y + 0.2, w: w - 0.9, h: 0.34, fontSize: 13, bold: true, color: C.blue, valign: 'middle' });
    const tx = compacta ? x + 0.75 : x + 0.25, ty = compacta ? y + 0.1 : y + 0.62, tw = x + w - 0.2 - tx, th = compacta ? hh - 0.2 : hh - 0.78;
    // tamanho de fonte automático: o maior (14→10,5 pt) em que todas as frases cabem na caixa
    const cabe = fs => frases.reduce((a, t) => a + Math.ceil(t.length / Math.max(10, (tw - 0.25) * 72 / (fs * 0.5))) * fs * 1.2 / 72 + 4 / 72, 0) <= th;
    let fs = 14; while (fs > 10.5 && !cabe(fs)) fs -= 0.5;
    h.text(s, frases.map((t, i) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: i < frases.length - 1, paraSpaceAfter: 4 } })), { x: tx, y: ty, w: tw, h: th, fontSize: fs, color: C.ink, valign: compacta ? 'middle' : 'top' });
  };
  // cartões de destaque (número grande + rótulo)
  h.stats = (s, itens, y, hh = 1.3) => {
    const gap = 0.3, w = (CW - gap * (itens.length - 1)) / itens.length;
    itens.forEach((it, i) => { const x = M + i * (w + gap);
      h.box(s, x, y, w, hh, { fill: it.fill || C.soft, line: it.line });
      h.text(s, it.label, { x: x + 0.22, y: y + 0.16, w: w - 0.44, h: 0.3, fontSize: 12, color: C.muted, bold: true });
      h.text(s, it.big, { x: x + 0.22, y: y + 0.44, w: w - 0.44, h: 0.48, fontSize: it.bigSize || 24, bold: true, color: it.color || C.ink, fit: 'shrink' });
      if (it.sub) h.text(s, it.sub, { x: x + 0.22, y: y + hh - 0.42, w: w - 0.44, h: 0.3, fontSize: 12, color: C.ink2 }); });
  };
  // opções padrão de gráfico (objeto novo a cada chamada — a biblioteca altera o objeto)
  h.chart = (extra) => Object.assign({
    catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, dataLabelFontFace: FONT, legendFontFace: FONT, titleFontFace: FONT,
    catAxisLabelFontSize: 12, valAxisLabelFontSize: 10, dataLabelFontSize: 11, legendFontSize: 11, titleFontSize: 13,
    catAxisLabelColor: C.ink2, valAxisLabelColor: C.muted, dataLabelColor: C.ink, titleColor: C.ink, legendColor: C.ink2,
    valGridLine: { color: 'E6EBF5', size: 0.75 }, catGridLine: { style: 'none' }, catAxisLineShow: false, valAxisLineShow: false,
    showLegend: false, showValue: true,
  }, extra);
  h.tabela = (s, linhas, o) => s.addTable(linhas, Object.assign({ x: M, fontFace: FONT, fontSize: 11, color: C.ink, valign: 'middle', margin: [3, 6, 3, 6],
    border: { type: 'solid', pt: 0.5, color: C.line } }, o));
  h.th = t => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.navy2 }, fontSize: 11 } });
  h.badge = (txt, cor) => ({ text: [{ text: '● ', options: { color: cor } }, { text: txt }] });
  return h;
}

// ---------------------------------------------------------------------
// SLIDES (registro modular — ordem = ordem da apresentação)
// ---------------------------------------------------------------------
const SLIDES = [];
AP.registrar = def => { const i = def.depois ? SLIDES.findIndex(s => s.id === def.depois) : -1; if (i >= 0) SLIDES.splice(i + 1, 0, def); else SLIDES.push(def); };
const reg = (id, secao, quando, montar) => AP.registrar({ id, secao, quando, montar });

// 1. CAPA ---------------------------------------------------------------
reg('capa', 'Abertura', null, (pres, ctx, h) => {
  const { F, C: c } = h, T = ctx.T, s = pres.addSlide({ masterName: 'PJ_ESCURO', sectionTitle: 'Abertura' });
  s.addImage({ data: ctx.logo, x: M, y: 0.6, w: 0.62, h: 0.62 });
  h.text(s, [{ text: 'PEÇA JÁ', options: { bold: true, color: c.white } }, { text: '  ·  Centro de Controle', options: { color: c.sky } }], { x: M + 0.8, y: 0.6, w: 6, h: 0.62, fontSize: 16, valign: 'middle' });
  if (ctx.rascunho) { h.box(s, W - M - 2.6, 0.7, 2.6, 0.42, { fill: c.warn, r: 0.2 }); h.text(s, 'BASE EM RASCUNHO', { x: W - M - 2.6, y: 0.7, w: 2.6, h: 0.42, fontSize: 12, bold: true, color: c.navy, align: 'center', valign: 'middle' }); }
  h.text(s, 'Resultado Logístico', { x: M, y: 1.75, w: 7.6, h: 1.0, fontSize: 48, bold: true, color: c.white, fontFace: 'Cambria' });
  h.text(s, ctx.periodo.titulo, { x: M, y: 2.75, w: 7.6, h: 0.65, fontSize: 28, color: c.sky });
  h.text(s, ctx.periodo.linha, { x: M, y: 3.45, w: 7.6, h: 0.45, fontSize: 16, color: c.white });
  // filtros aplicados
  h.text(s, 'FILTROS APLICADOS', { x: M, y: 4.2, w: 7.6, h: 0.3, fontSize: 11, bold: true, color: '8FA5D6', charSpacing: 2 });
  const fl = ctx.filtrosLista.length ? ctx.filtrosLista : ['Nenhum filtro além do período: visão completa da operação'];
  h.text(s, fl.map((t, i) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: i < fl.length - 1, paraSpaceAfter: 3 } })), { x: M, y: 4.55, w: 7.6, h: 1.55, fontSize: 14, color: c.white });
  h.text(s, `Gerado em ${ctx.geradoEm}${ctx.autor ? ' por ' + ctx.autor : ''}  ·  Base: ${cut(ctx.baseNome, 60)}`, { x: M, y: H - 0.75, w: 9.5, h: 0.32, fontSize: 11, color: '8FA5D6' });
  // painel lateral com 3 números
  const px = 8.75, pw = W - M - px;
  h.box(s, px, 1.75, pw, 4.4, { fill: c.navy3 });
  [['Vendas', F.int(T.codigos), `${F.int(T.n)} entregas`], ['% custo de frete', F.pct(T.pc, 2), isFinite(ctx.meta) ? `meta ${F.pct(ctx.meta, 2)}` : ''], ['SLA médio', F.hms(T.sla), 'entrega']]
    .forEach(([l, v, sub], i) => { const y = 1.95 + i * 1.4;
      h.text(s, l.toUpperCase(), { x: px + 0.35, y, w: pw - 0.7, h: 0.3, fontSize: 11, bold: true, color: '8FA5D6', charSpacing: 1 });
      h.text(s, v, { x: px + 0.35, y: y + 0.3, w: pw - 0.7, h: 0.62, fontSize: 32, bold: true, color: i === 1 && isFinite(ctx.meta) ? (T.pc > ctx.meta ? 'FF8A8F' : '6EE2B0') : c.white });
      h.text(s, sub, { x: px + 0.35, y: y + 0.92, w: pw - 0.7, h: 0.28, fontSize: 12, color: c.sky }); });
  s.addNotes(`Resultado Logístico — ${ctx.periodo.titulo}. ${ctx.periodo.linha}. Filtros: ${fl.join('; ')}.`);
});

// 2. VISÃO GERAL --------------------------------------------------------
reg('visao', 'Visão geral', null, (pres, ctx, h) => {
  const { F, C: c } = h; h.secao = 'Visão geral';
  const s = h.novo('Visão geral do período', ctx.destaques[0]);
  const cols = 4, gap = 0.3, w = (CW - gap * (cols - 1)) / cols, hh = 1.55;
  ctx.kpis.forEach((k, i) => { const x = M + (i % cols) * (w + gap), y = 1.8 + Math.floor(i / cols) * (hh + 0.25);
    const destaque = k.alerta === 'ruim' ? c.badBg : k.alerta === 'bom' ? c.goodBg : c.soft;
    h.box(s, x, y, w, hh, { fill: destaque, name: 'kpi_' + k.id });
    h.text(s, k.label, { x: x + 0.22, y: y + 0.16, w: w - 0.44, h: 0.3, fontSize: 12, bold: true, color: c.muted });
    h.text(s, k.valor, { x: x + 0.22, y: y + 0.45, w: w - 0.44, h: 0.5, fontSize: 26, bold: true, color: k.alerta === 'ruim' ? c.bad : c.ink, fit: 'shrink' });
    h.text(s, k.sub, { x: x + 0.22, y: y + 0.95, w: w - 0.44, h: 0.26, fontSize: 11, color: c.ink2 });
    if (k.cmp) { const col = k.cmp.good === true ? c.good : k.cmp.good === false ? c.bad : c.muted;
      h.text(s, [{ text: (k.cmp.txt.startsWith('−') ? '▼ ' : k.cmp.txt.startsWith('+') ? '▲ ' : '■ ') + k.cmp.txt, options: { bold: true, color: col } }, { text: '  ' + k.cmp.label, options: { color: c.muted } }],
        { x: x + 0.22, y: y + 1.2, w: w - 0.44, h: 0.26, fontSize: 11 }); } });
  const frases = ctx.destaques.slice(1).concat(ctx.P ? [] : ['Sem período anterior para comparação: filtre um período (datas) no painel para ver a evolução.']);
  h.analise(s, M, 5.45, CW * 0.66, 1.45, frases.slice(0, 2), 'Destaques');
  h.box(s, M + CW * 0.66 + 0.3, 5.45, CW * 0.34 - 0.3, 1.45, { fill: C.soft });
  h.text(s, 'Sem fonte na base atual', { x: M + CW * 0.66 + 0.5, y: 5.62, w: CW * 0.34 - 0.7, h: 0.3, fontSize: 12, bold: true, color: c.muted });
  h.text(s, ctx.indisponiveis.join(' · '), { x: M + CW * 0.66 + 0.5, y: 5.95, w: CW * 0.34 - 0.7, h: 0.75, fontSize: 13, color: c.ink2 });
  s.addNotes(ctx.destaques.join(' '));
});

// 3. SLA POR TIPO DE VENDA ---------------------------------------------
reg('sla_tipo', 'SLA', ctx => ctx.sla.tipos.length > 0, (pres, ctx, h) => {
  const { F, C: c } = h, T = ctx.T, tipos = ctx.sla.tipos.slice(0, 10); h.secao = 'SLA';
  const s = h.novo('SLA por tipo de venda', ctx.sla.insights[0]);
  h.text(s, `SLA médio por tipo (horas) · média geral ${F.hms(T.sla)}`, { x: M, y: 1.78, w: 6.4, h: 0.3, fontSize: 12, bold: true, color: c.ink2 });
  s.addChart(pres.charts.BAR, [{ name: 'SLA médio (h)', labels: tipos.map(g => g.key), values: tipos.map(g => +(g.sla / 3600).toFixed(1)) }], h.chart({
    x: M, y: 2.1, w: 6.4, h: 3.4, barDir: 'bar', catAxisOrientation: 'maxMin', valAxisHidden: true, valGridLine: { style: 'none' }, barGapWidthPct: 45,
    chartColors: tipos.map(g => g.sla > T.sla ? c.warn : '3D7EF5'), dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.0" h"', valAxisMinVal: 0 }));
  h.text(s, [{ text: '■ ', options: { color: c.warn } }, { text: 'acima da média   ' }, { text: '■ ', options: { color: '3D7EF5' } }, { text: 'na média ou abaixo' }], { x: M, y: 5.5, w: 6.4, h: 0.28, fontSize: 11, color: c.ink2 });
  const tv = tipos.reduce((a, g) => a + g.codigos, 0) || 1;
  const rows = [[h.th('Tipo de venda'), h.th('Vendas'), h.th('Participação'), h.th('SLA médio'), h.th('vs média')]]
    .concat(tipos.map(g => [g.key, F.int(g.codigos), F.pct(g.codigos / tv, 1), F.hms(g.sla), { text: F.delta(g.slaVsAvg), options: { color: g.slaVsAvg > 0 ? c.bad : c.good, bold: true } }]));
  h.tabela(s, rows, { x: 7.3, y: 1.8, w: W - M - 7.3, colW: [1.7, 0.85, 1.1, 1.0, 0.78], rowH: 0.34 });
  h.analise(s, M, 5.95, CW, 1.0, ctx.sla.insights.filter(t => /tipo de venda|Entre /.test(t)).slice(0, 2).concat(ctx.sla.tipos.length >= 2 ? [`Participação: ${tipos.slice(0, 3).map(g => `${g.key} ${F.pct(g.codigos / tv, 0)}`).join(' · ')}.`] : []).slice(0, 2));
  s.addNotes(ctx.sla.insights.join(' '));
});

// 3b. EVOLUÇÃO DO SLA POR TIPO -----------------------------------------
reg('sla_evolucao', 'SLA', ctx => !!ctx.sla.evolucao, (pres, ctx, h) => {
  const { F, C: c } = h, ev = ctx.sla.evolucao, ser = ev.series.slice(0, 6);
  const s = h.novo('Evolução do SLA por tipo de venda', ctx.sla.insights.find(t => /^Entre /.test(t)) || `SLA mensal por tipo de venda entre ${F.mesCurto(ev.meses[0])} e ${F.mesCurto(ev.meses[ev.meses.length - 1])}.`);
  s.addChart(pres.charts.LINE, ser.map(x => ({ name: x.key, labels: ev.meses.map(F.mesCurto), values: x.valores.map(v => v == null ? null : +(v / 3600).toFixed(1)) })), h.chart({
    x: M, y: 1.8, w: CW, h: 4.75, showValue: false, showLegend: true, legendPos: 'b', lineSize: 2.5, lineDataSymbol: 'circle', lineDataSymbolSize: 7,
    chartColors: SERIES.slice(0, ser.length), valAxisLabelFormatCode: '0" h"', valAxisTitle: 'SLA médio (horas)', showValAxisTitle: true, valAxisTitleFontSize: 11, valAxisTitleColor: c.muted, valAxisTitleFontFace: FONT }));
  h.text(s, 'Valores mensais calculados com os mesmos filtros do painel.', { x: M, y: 6.62, w: CW, h: 0.28, fontSize: 11, color: c.muted });
});

// 4. IMPACTO NO SLA — UNIDADES -----------------------------------------
reg('sla_unidades', 'SLA', ctx => ctx.sla.filiais.length >= 2, (pres, ctx, h) => {
  const { F, C: c } = h, u = ctx.sla.unid;
  const s = h.novo('Impacto no SLA por unidade', ctx.sla.insights.find(t => /unidade/.test(t)) || 'Unidades que mais influenciam o SLA consolidado.');
  h.stats(s, [
    { label: 'Maior SLA', big: u.maiorSla ? u.maiorSla.key : '–', sub: u.maiorSla ? F.hms(u.maiorSla.sla) : '', color: c.bad },
    { label: 'Menor SLA', big: u.menorSla ? u.menorSla.key : '–', sub: u.menorSla ? F.hms(u.menorSla.sla) : '', color: c.good },
    { label: 'Maior volume', big: u.maiorVol ? u.maiorVol.key : '–', sub: u.maiorVol ? `${F.int(u.maiorVol.codigos)} vendas · ${F.pct(u.maiorVol.volShare, 1)}` : '' },
    { label: 'Maior impacto no consolidado', big: u.maiorImp ? u.maiorImp.key : '–', sub: u.maiorImp ? `${F.dur(u.maiorImp.slaImp)} no SLA geral` : '', color: c.bad }], 1.8);
  const top = ctx.sla.filiais.slice().sort((a, b) => Math.abs(b.slaImp) - Math.abs(a.slaImp)).slice(0, 8).sort((a, b) => b.slaImp - a.slaImp);
  h.text(s, 'Impacto de cada unidade no SLA consolidado (minutos) — positivo = puxa o SLA para cima', { x: M, y: 3.35, w: 7.4, h: 0.3, fontSize: 12, bold: true, color: c.ink2 });
  s.addChart(pres.charts.BAR, [{ name: 'Impacto (min)', labels: top.map(g => g.key), values: top.map(g => +(g.slaImp / 60).toFixed(1)) }], h.chart({
    x: M, y: 3.65, w: 7.4, h: 3.25, barDir: 'bar', catAxisOrientation: 'maxMin', valAxisHidden: true, valGridLine: { style: 'none' }, barGapWidthPct: 40,
    chartColors: top.map(g => g.slaImp > 0 ? c.bad : c.good), dataLabelPosition: 'outEnd', dataLabelFormatCode: '+0.0" min";-0.0" min";0', catAxisLabelPos: 'low' }));
  h.analise(s, 8.3, 3.4, W - M - 8.3, 3.5, [
    u.maiorImp && u.maiorImp.slaImp > 0 ? `${u.maiorImp.key} adiciona ${F.dur(u.maiorImp.slaImp)} ao SLA consolidado (SLA de ${F.hms(u.maiorImp.sla)}, ${F.pct(u.maiorImp.entShare, 1)} das entregas).` : null,
    u.maiorSla && u.menorSla ? `Diferença entre a unidade mais lenta (${u.maiorSla.key}) e a mais rápida (${u.menorSla.key}): ${F.dur(u.maiorSla.sla - u.menorSla.sla).replace('+', '')}.` : null,
    u.maiorVol ? `${u.maiorVol.key} tem o maior volume (${F.pct(u.maiorVol.volShare, 1)} das vendas) com SLA de ${F.hms(u.maiorVol.sla)} (${F.delta(u.maiorVol.slaVsAvg)} vs média).` : null]);
  s.addNotes('Impacto no consolidado = (SLA da unidade − SLA médio) × participação da unidade nas entregas com SLA válido. A soma dos impactos de todas as unidades é zero.');
});

// 5. IMPACTO NO SLA — TRANSPORTADORAS ----------------------------------
reg('sla_transportadoras', 'SLA', ctx => ctx.sla.pars.length >= 1, (pres, ctx, h) => {
  const { F, C: c } = h, T = ctx.T, pars = ctx.sla.pars.slice().sort((a, b) => b.codigos - a.codigos);
  const s = h.novo('Impacto no SLA por transportadora', ctx.sla.insights.find(t => /transportadora/.test(t)) || `SLA médio geral de ${F.hms(T.sla)}.`);
  h.text(s, `SLA médio por transportadora (horas) · média geral ${F.hms(T.sla)}`, { x: M, y: 1.78, w: 5.6, h: 0.3, fontSize: 12, bold: true, color: c.ink2 });
  s.addChart(pres.charts.BAR, [{ name: 'SLA (h)', labels: pars.map(g => g.key), values: pars.map(g => +(g.sla / 3600).toFixed(1)) }], h.chart({
    x: M, y: 2.1, w: 5.6, h: 3.5, barDir: 'bar', catAxisOrientation: 'maxMin', valAxisHidden: true, valGridLine: { style: 'none' }, barGapWidthPct: 45,
    chartColors: pars.map(g => h.parColor(g.key)), dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.0" h"', valAxisMinVal: 0 }));
  const rows = [[h.th('Transportadora'), h.th('Vendas'), h.th('Particip.'), h.th('SLA médio'), h.th('Efeito no SLA geral')]]
    .concat(pars.map(g => [h.badge(g.key, h.parColor(g.key)), F.int(g.codigos), F.pct(g.volShare, 1), F.hms(g.sla),
      { text: g.slaImp > 60 ? `▲ puxa para cima (${F.dur(g.slaImp)})` : g.slaImp < -60 ? `▼ puxa para baixo (${F.dur(g.slaImp)})` : '■ neutro', options: { color: g.slaImp > 60 ? c.bad : g.slaImp < -60 ? c.good : c.muted, bold: true } }]));
  h.tabela(s, rows, { x: 6.5, y: 1.8, w: W - M - 6.5, colW: [1.55, 0.8, 0.85, 1.05, 1.98], rowH: 0.36 });
  h.analise(s, M, 5.85, CW, 1.1, ctx.sla.insights.filter(t => /transportadora|puxa o SLA/.test(t)).slice(0, 2));
});

// 6. ANÁLISE DE CUSTO ---------------------------------------------------
reg('custo', 'Custo', null, (pres, ctx, h) => {
  const { F, C: c } = h, T = ctx.T, meta = ctx.meta, cu = ctx.custo; h.secao = 'Custo';
  const s = h.novo('Análise do custo logístico', cu.insights[0]);
  const ac = isFinite(meta) && T.pc > meta;
  h.stats(s, [
    { label: 'Faturamento', big: F.brlK(T.valor), sub: `${F.int(T.codigos)} vendas` },
    { label: 'Frete', big: F.brlK(T.custo), sub: `${F.brl(T.n ? T.custo / T.n : 0)} por entrega` },
    { label: '% custo de frete', big: F.pct(T.pc, 2), sub: ctx.P ? `${F.pp(T.pc - ctx.P.pc, 2)} vs período anterior` : 'custo ÷ faturamento', color: ac ? c.bad : c.ink, fill: ac ? c.badBg : c.goodBg },
    { label: 'Meta de custo', big: isFinite(meta) ? F.pct(meta, 2) : '–', sub: 'definida no painel' },
    { label: 'Realizado − meta', big: isFinite(meta) ? F.pp(cu.diff, 2) : '–', sub: isFinite(meta) ? `${cu.exc > 0 ? '' : 'folga de '}${F.brlK(Math.abs(cu.exc))}${cu.exc > 0 ? ' acima da meta' : ''}` : '', color: ac ? c.bad : c.good }], 1.8);
  // % custo por mês × meta
  const ms = ctx.meses.filter(m => m.valor > 0);
  if (ms.length >= 2) {
    h.text(s, '% de custo por mês × meta', { x: M, y: 3.35, w: 6.6, h: 0.3, fontSize: 12, bold: true, color: c.ink2 });
    const labels = ms.map(m => F.mesCurto(m.key));
    s.addChart([
      { type: pres.charts.BAR, data: [{ name: '% custo', labels, values: ms.map(m => +m.pc.toFixed(4)) }], options: { barDir: 'col', chartColors: ms.map(m => isFinite(meta) && m.pc > meta ? c.bad : '3D7EF5'), barGapWidthPct: 60 } },
      ...(isFinite(meta) ? [{ type: pres.charts.LINE, data: [{ name: 'Meta', labels, values: ms.map(() => +meta.toFixed(4)) }], options: { chartColors: [c.ink2], lineSize: 2, lineDash: 'dash', lineDataSymbol: 'none', showValue: false } }] : []),
    ], h.chart({ x: M, y: 3.65, w: 6.6, h: 3.25, valAxisLabelFormatCode: '0.0%', dataLabelFormatCode: '0.0%', dataLabelPosition: 'outEnd', showLegend: true, legendPos: 'b', valAxisMinVal: 0 }));
  } else h.analise(s, M, 3.4, 6.6, 3.5, cu.insights.slice(1, 3), 'Leitura do custo');
  // relação SLA × custo
  h.text(s, 'Existe relação entre SLA maior e custo maior?', { x: 7.5, y: 3.35, w: W - M - 7.5, h: 0.3, fontSize: 12, bold: true, color: c.ink2 });
  if (cu.relacao.length) {
    s.addChart(pres.charts.BAR, [
      { name: 'Grupos com SLA acima da média', labels: cu.relacao.map(r => r.nome), values: cu.relacao.map(r => +r.acima.toFixed(4)) },
      { name: 'Demais grupos', labels: cu.relacao.map(r => r.nome), values: cu.relacao.map(r => +r.abaixo.toFixed(4)) }],
      h.chart({ x: 7.5, y: 3.65, w: W - M - 7.5, h: 2.35, barDir: 'col', chartColors: [c.warn, '3D7EF5'], valAxisLabelFormatCode: '0.0%', dataLabelFormatCode: '0.00%', dataLabelPosition: 'outEnd', showLegend: true, legendPos: 'b', valAxisMinVal: 0, dataLabelFontSize: 10 }));
  }
  h.text(s, cu.relacaoTxt, { x: 7.5, y: 6.1, w: W - M - 7.5, h: 0.8, fontSize: 13, color: c.ink, bold: true });
  s.addNotes(cu.insights.join(' ') + ' ' + cu.relacaoTxt);
});

// 7. IMPACTO NO CUSTO — TRANSPORTADORAS --------------------------------
reg('custo_transportadoras', 'Custo', ctx => ctx.custo.pars.length >= 1, (pres, ctx, h) => {
  const { F, C: c } = h, meta = ctx.meta, pars = ctx.custo.pars;
  const top = pars[0];
  const s = h.novo('Impacto no custo por transportadora', ctx.custo.insights.find(t => /transportadora/i.test(t)) || (top ? `${top.key}: ${F.pct(top.pc, 2)} de custo.` : ''));
  h.text(s, '% de custo por transportadora × meta', { x: M, y: 1.78, w: 5.4, h: 0.3, fontSize: 12, bold: true, color: c.ink2 });
  const ord = pars.slice().sort((a, b) => b.pc - a.pc), labels = ord.map(g => g.key);
  s.addChart([
    { type: pres.charts.BAR, data: [{ name: '% custo', labels, values: ord.map(g => +g.pc.toFixed(4)) }], options: { barDir: 'col', chartColors: ord.map(g => h.parColor(g.key)), barGapWidthPct: 55 } },
    ...(isFinite(meta) ? [{ type: pres.charts.LINE, data: [{ name: 'Meta', labels, values: ord.map(() => +meta.toFixed(4)) }], options: { chartColors: [c.bad], lineSize: 2, lineDash: 'dash', lineDataSymbol: 'none', showValue: false } }] : []),
  ], h.chart({ x: M, y: 2.1, w: 5.4, h: 3.55, valAxisLabelFormatCode: '0.0%', dataLabelFormatCode: '0.00%', dataLabelPosition: 'outEnd', showLegend: true, legendPos: 'b', valAxisMinVal: 0, dataLabelFontSize: 10 }));
  const rows = [[h.th('Transportadora'), h.th('Frete'), h.th('% custo'), h.th('Faturamento'), h.th('Vendas'), h.th('SLA'), h.th('vs meta')]]
    .concat(pars.map(g => [h.badge(g.key, h.parColor(g.key)), F.brlK(g.custo), { text: F.pct(g.pc, 2), options: { bold: true, color: isFinite(meta) && g.pc > meta ? c.bad : c.ink } }, F.brlK(g.valor), F.int(g.codigos), F.hms(g.sla),
      { text: isFinite(g.exc) ? (g.exc > 0 ? `▲ ${F.brlK(g.exc)}` : `▼ ${F.brlK(-g.exc)}`) : '–', options: { bold: true, color: g.exc > 0 ? c.bad : c.good } }]));
  h.tabela(s, rows, { x: 6.3, y: 1.8, w: W - M - 6.3, colW: [1.2, 0.9, 0.72, 1.0, 0.66, 0.8, 1.15], rowH: 0.36, fontSize: 10.5 });
  const frases = [];
  if (top && top.exc > 0) frases.push(`Maior impacto: ${top.key}, ${F.brlK(top.exc)} acima do que a meta permitiria sobre ${F.brlK(top.valor)} faturados.`);
  const acima = pars.filter(g => g.exc > 0);
  frases.push(acima.length ? `${acima.length} de ${pars.length} transportadoras estão acima da meta: ${acima.map(g => g.key).join(', ')}.` : 'Todas as transportadoras estão dentro da meta de custo.');
  h.analise(s, M, 5.95, CW, 1.0, frases);
  s.addNotes('"vs meta" = custo de frete − (meta × faturamento atendido). ▲ = valor acima do que a meta permitiria.');
});

// 8. IMPACTO NO CUSTO — UNIDADES ----------------------------------------
reg('custo_unidades', 'Custo', ctx => ctx.custo.filiais.length >= 2, (pres, ctx, h) => {
  const { F, C: c } = h, u = ctx.custo.unid, meta = ctx.meta;
  const s = h.novo('Impacto no custo por unidade', ctx.custo.insights.find(t => /unidade/.test(t)) || (() => { const n = ctx.custo.unidAcima, t = ctx.custo.filiais.length, mi = ctx.custo.unid.maiorImp;
    return n ? `${n} de ${t} unidade${t > 1 ? 's' : ''} acima da meta de custo${mi && mi.exc > 0 ? `; ${mi.key} concentra o maior excedente (${h.F.brlK(mi.exc)}).` : '.'}` : `Todas as ${t} unidades estão dentro da meta de custo.`; })());
  h.stats(s, [
    { label: 'Maior custo (R$)', big: u.maiorCusto ? u.maiorCusto.key : '–', sub: u.maiorCusto ? `${F.brlK(u.maiorCusto.custo)} · ${F.pct(u.maiorCusto.costShare, 1)} do total` : '' },
    { label: 'Maior % de custo', big: u.maiorPc ? u.maiorPc.key : '–', sub: u.maiorPc ? `${F.pct(u.maiorPc.pc, 2)}${isFinite(meta) ? ' · meta ' + F.pct(meta, 2) : ''}` : '', color: u.maiorPc && u.maiorPc.pc > meta ? c.bad : c.ink },
    { label: 'Maior volume', big: u.maiorVol ? u.maiorVol.key : '–', sub: u.maiorVol ? `${F.int(u.maiorVol.codigos)} vendas · ${F.pct(u.maiorVol.volShare, 1)}` : '' },
    { label: 'Maior impacto no resultado', big: u.maiorImp ? u.maiorImp.key : '–', sub: u.maiorImp ? `${u.maiorImp.exc > 0 ? F.brlK(u.maiorImp.exc) + ' acima da meta' : 'dentro da meta'}` : '', color: u.maiorImp && u.maiorImp.exc > 0 ? c.bad : c.ink }], 1.8);
  const top = ctx.custo.filiais.filter(g => isFinite(g.exc)).sort((a, b) => Math.abs(b.exc) - Math.abs(a.exc)).slice(0, 8).sort((a, b) => b.exc - a.exc);
  h.text(s, 'Custo acima (+) / abaixo (−) do que a meta permitiria, por unidade (R$ mil)', { x: M, y: 3.35, w: 7.4, h: 0.3, fontSize: 12, bold: true, color: c.ink2 });
  if (top.length) s.addChart(pres.charts.BAR, [{ name: 'vs meta (R$ mil)', labels: top.map(g => g.key), values: top.map(g => +(g.exc / 1000).toFixed(2)) }], h.chart({
    x: M, y: 3.65, w: 7.4, h: 3.25, barDir: 'bar', catAxisOrientation: 'maxMin', valAxisHidden: true, valGridLine: { style: 'none' }, barGapWidthPct: 40,
    chartColors: top.map(g => g.exc > 0 ? c.bad : c.good), dataLabelPosition: 'outEnd', dataLabelFormatCode: '+0.0" mil";-0.0" mil";0', catAxisLabelPos: 'low' }));
  const frases = ctx.custo.insights.filter(t => /unidade/.test(t));
  frases.push(isFinite(meta) ? (ctx.custo.unidAcima ? `${ctx.custo.unidAcima} de ${ctx.custo.filiais.length} unidades estão com custo acima da meta.` : 'Todas as unidades estão dentro da meta de custo.') : null);
  if (u.maiorImp && u.maiorImp.exc > 0) frases.push(`${u.maiorImp.key} concentra a maior parte do custo excedente (${F.brlK(u.maiorImp.exc)}).`);
  h.analise(s, 8.3, 3.4, W - M - 8.3, 3.5, frases.slice(0, 3));
});

// 9. PARTICIPAÇÃO DAS TRANSPORTADORAS ----------------------------------
reg('participacao', 'Transportadoras', ctx => ctx.participacao.length >= 1, (pres, ctx, h) => {
  const { F, C: c } = h, meta = ctx.meta, pars = ctx.participacao; h.secao = 'Transportadoras';
  const s = h.novo('Participação das transportadoras nas vendas', ctx.participacaoTxt);
  s.addChart(pres.charts.DOUGHNUT, [{ name: 'Vendas', labels: pars.map(g => g.key), values: pars.map(g => +g.volShare.toFixed(4)) }], h.chart({
    x: M, y: 1.75, w: 5.2, h: 4.9, holeSize: 58, showPercent: false, showValue: true, dataLabelFormatCode: '0%', showLegend: false, dataLabelColor: C.white, dataLabelFontSize: 12, dataLabelFontBold: true,
    chartColors: pars.map(g => h.parColor(g.key)) }));
  h.text(s, [{ text: F.int(ctx.T.codigos), options: { fontSize: 28, bold: true, breakLine: true } }, { text: 'vendas', options: { fontSize: 12, color: c.muted } }],
    { x: M + 1.6, y: 3.65, w: 2.0, h: 0.9, align: 'center', valign: 'middle' });
  // lista lateral: volume + SLA + custo
  const x0 = 6.3, rowH = Math.min(0.92, 4.9 / Math.max(pars.length, 1));
  h.text(s, 'Transportadora', { x: x0 + 0.45, y: 1.75, w: 1.8, h: 0.3, fontSize: 11, bold: true, color: c.muted });
  [['Vendas', 2.3], ['Participação', 3.25], ['SLA médio', 4.4], ['% custo', 5.5]].forEach(([t, dx]) => h.text(s, t, { x: x0 + dx, y: 1.75, w: 1.1, h: 0.3, fontSize: 11, bold: true, color: c.muted }));
  pars.slice(0, 7).forEach((g, i) => { const y = 2.1 + i * rowH;
    h.box(s, x0, y, W - M - x0, rowH - 0.1, { fill: i % 2 ? C.white : C.soft, r: 0.08 });
    h.circle(s, x0 + 0.15, y + (rowH - 0.1) / 2 - 0.1, 0.2, h.parColor(g.key));
    const mid = { y, h: rowH - 0.1, valign: 'middle' };
    h.text(s, g.key, Object.assign({ x: x0 + 0.45, w: 1.8, fontSize: 14, bold: true }, mid));
    h.text(s, F.int(g.codigos), Object.assign({ x: x0 + 2.3, w: 0.9, fontSize: 14 }, mid));
    h.text(s, F.pct(g.volShare, 1), Object.assign({ x: x0 + 3.25, w: 1.1, fontSize: 14, bold: true, color: c.blue }, mid));
    h.text(s, F.hms(g.sla), Object.assign({ x: x0 + 4.4, w: 1.05, fontSize: 13, color: g.sla > ctx.T.sla ? c.bad : c.ink }, mid));
    h.text(s, F.pct(g.pc, 2), Object.assign({ x: x0 + 5.5, w: 0.85, fontSize: 13, color: isFinite(meta) && g.pc > meta ? c.bad : c.good, bold: true }, mid)); });
  h.text(s, `SLA em vermelho = acima da média geral (${F.hms(ctx.T.sla)}). % custo em vermelho = acima da meta${isFinite(meta) ? ' (' + F.pct(meta, 2) + ')' : ''}.${pars.reduce((a, g) => a + g.volShare, 0) > 1.001 ? ' Uma venda pode ter mais de uma transportadora, por isso a soma passa de 100%.' : ''}`, { x: x0, y: 6.6, w: W - M - x0, h: 0.4, fontSize: 10, color: c.muted });
});

// 10. PRINCIPAIS OFENSORES ---------------------------------------------
reg('ofensores', 'Ofensores', null, (pres, ctx, h) => {
  const { F, C: c } = h, of = ctx.ofensores; h.secao = 'Ofensores';
  const s = h.novo('Principais ofensores', of.length ? `Top ${of.length} impactos no resultado, ordenados pelo peso no SLA e no custo consolidados.` : 'Nenhum ofensor relevante identificado com os filtros aplicados.');
  if (!of.length) { h.analise(s, M, 2.0, CW, 1.4, ['Todas as transportadoras, unidades e tipos de venda estão dentro da meta de custo e sem impacto relevante no SLA.']); return; }
  const maxS = Math.max(...of.map(o => o.score)), rowH = 0.92;
  of.forEach((o, i) => { const y = 1.85 + i * (rowH + 0.08), cor = o.kind === 'sla' ? c.warn : c.bad;
    h.box(s, M, y, CW, rowH, { fill: i === 0 ? C.badBg : C.soft, r: 0.1 });
    h.circle(s, M + 0.2, y + 0.18, 0.56, i === 0 ? c.bad : C.navy2); h.text(s, String(i + 1), { x: M + 0.2, y: y + 0.18, w: 0.56, h: 0.56, fontSize: 20, bold: true, color: C.white, align: 'center', valign: 'middle' });
    h.text(s, o.titulo, { x: M + 1.0, y: y + 0.12, w: 7.2, h: 0.38, fontSize: 17, bold: true });
    h.text(s, o.detalhe, { x: M + 1.0, y: y + 0.5, w: 7.4, h: 0.32, fontSize: 12, color: c.ink2 });
    h.box(s, M + 8.6, y + 0.3, 0.95, 0.32, { fill: cor, r: 0.16 }); h.text(s, o.kind === 'sla' ? 'SLA' : 'CUSTO', { x: M + 8.6, y: y + 0.3, w: 0.95, h: 0.32, fontSize: 11, bold: true, color: C.white, align: 'center', valign: 'middle' });
    const bw = 1.9 * o.score / maxS;
    h.box(s, M + 9.8, y + 0.36, 1.9, 0.2, { fill: C.soft2, r: 0.1 }); h.box(s, M + 9.8, y + 0.36, Math.max(0.08, bw), 0.2, { fill: cor, r: 0.1 });
    h.text(s, o.kind === 'sla' ? `${F.dur(o.g.slaImp)} no SLA` : `${F.brlK(o.g.exc)} acima`, { x: M + 9.8, y: y + 0.6, w: 2.3, h: 0.26, fontSize: 11, color: c.ink2 }); });
  h.text(s, 'Peso no resultado: SLA = horas que o grupo soma ao SLA consolidado; Custo = valor acima do que a meta permitiria. Regiões/raios: sem essa informação na base.', { x: M, y: 6.85, w: CW, h: 0.26, fontSize: 10, color: c.muted });
  s.addNotes(of.map((o, i) => `${i + 1}. ${o.titulo}: ${o.detalhe}`).join('\n'));
});

// 11. PLANO DE AÇÃO (em andamento / planejadas / atrasadas) -------------
const STATUS = { em_andamento: ['Em andamento', 'E3B008'], planejada: ['Planejada', '2F8FD8'], concluida: ['Finalizada', '13967E'], em_validacao: ['Em validação', 'E3B008'], pausada: ['Pausada', '7F8CBA'] };
const stBadge = (h, a) => a.atrasada ? h.badge('Atrasada', 'C62F3A') : h.badge(...STATUS[a.status] || [a.status, '7F8CBA']);
reg('plano', 'Plano de Ação', ctx => ctx.acoes.disponivel, (pres, ctx, h) => {
  const { F, C: c } = h, ac = ctx.acoes, lista = ac.andamento; h.secao = 'Plano de Ação';
  const POR = 5, pags = Math.max(1, Math.ceil(lista.length / POR));
  for (let p = 0; p < pags; p++) {
    const parte = lista.slice(p * POR, p * POR + POR);
    const resumo = lista.length ? `${F.int(lista.length)} ações em aberto${ac.atrasadas ? ` · ${ac.atrasadas} atrasada${ac.atrasadas > 1 ? 's' : ''}` : ''} · ${F.int(lista.filter(a => a.status === 'em_andamento').length)} em andamento · ${F.int(lista.filter(a => a.status === 'planejada').length)} planejadas` : 'Nenhuma ação em aberto para os filtros aplicados.';
    const s = h.novo(pags > 1 ? `Plano de Ação (${p + 1}/${pags})` : 'Plano de Ação', resumo);
    if (!parte.length) { h.analise(s, M, 2.0, CW, 1.2, ['Cadastre ações em Ações PEÇA JÁ para que apareçam aqui.'], 'Sem ações'); }
    else {
      const rows = [[h.th('Ação / problema tratado'), h.th('Envolvidos'), h.th('Responsável'), h.th('Status'), h.th('Início'), h.th('Prazo'), h.th('Resultado esperado'), h.th('Atual')]]
        .concat(parte.map(a => [
          { text: [{ text: cut(a.titulo, 60), options: { bold: true, breakLine: true } }, { text: cut(a.problema || a.descricao || '—', 70), options: { color: c.ink2, fontSize: 10 } }] },
          cut(a.envolvidos || 'Geral', 40), cut(a.responsavel || '—', 28), stBadge(h, a), F.date(a.data_inicio),
          { text: F.date(a.prazo), options: { color: a.atrasada ? c.bad : c.ink, bold: a.atrasada } },
          cut(a.resultado_esperado || '—', 80),
          { text: [{ text: `${a.progresso}%`, options: { bold: true, breakLine: !!a.resultado_obtido } }, ...(a.resultado_obtido ? [{ text: cut(a.resultado_obtido, 50), options: { fontSize: 9.5, color: c.ink2 } }] : [])] }]));
      h.tabela(s, rows, { y: 1.8, w: CW, colW: [2.75, 1.4, 1.3, 1.35, 1.05, 1.05, 2.08, 1.15], fontSize: 11, valign: 'top', rowH: [0.36, ...parte.map(() => 0.88)] });
    }
    // legenda de status com as cores (🟡 em andamento · 🔵 planejada · 🟢 finalizada · 🔴 atrasada)
    h.text(s, [['Em andamento', 'E3B008'], ['Planejada', '2F8FD8'], ['Finalizada', '13967E'], ['Atrasada', 'C62F3A']].flatMap(([t, cor]) => [{ text: '● ', options: { color: cor, fontSize: 12 } }, { text: t + '     ' }])
      .concat([{ text: '·  ' + ac.nota }]), { x: M, y: 6.83, w: CW, h: 0.28, fontSize: 10, color: c.muted, valign: 'middle' });
  }
});

// 12. AÇÕES FINALIZADAS (antes × depois) -------------------------------
reg('finalizadas', 'Plano de Ação', ctx => ctx.acoes.disponivel, (pres, ctx, h) => {
  const { F, C: c } = h, lista = ctx.acoes.finalizadas, POR = 3, pags = Math.max(1, Math.ceil(lista.length / POR));
  for (let p = 0; p < pags; p++) {
    const parte = lista.slice(p * POR, p * POR + POR);
    const comAD = lista.filter(a => a.antesDepois.length).length;
    const s = h.novo(pags > 1 ? `Ações finalizadas (${p + 1}/${pags})` : 'Ações finalizadas', lista.length ? `${F.int(lista.length)} ações concluídas${comAD ? ` · ${comAD} com resultado medido (antes × depois)` : ''}.` : 'Nenhuma ação concluída para os filtros aplicados.');
    if (!parte.length) { h.analise(s, M, 2.0, CW, 1.2, ['Ao concluir uma ação, preencha "solução", "resultado obtido" e os valores de antes × depois para que o impacto apareça aqui.'], 'Sem ações finalizadas'); continue; }
    const rowH = 1.6;
    parte.forEach((a, i) => { const y = 1.8 + i * (rowH + 0.12);
      h.box(s, M, y, CW, rowH, { fill: C.soft, r: 0.1 });
      h.circle(s, M + 0.2, y + 0.22, 0.26, c.good);
      h.text(s, cut(a.titulo, 70), { x: M + 0.6, y: y + 0.14, w: 6.4, h: 0.4, fontSize: 16, bold: true });
      h.text(s, `Concluída em ${F.date(a.data_conclusao || a.prazo)}${a.envolvidos ? ' · ' + cut(a.envolvidos, 40) : ''}`, { x: M + 0.6, y: y + 0.52, w: 6.4, h: 0.28, fontSize: 11, color: c.muted });
      const lin = [['Problema', a.problema || a.descricao], ['Solução', a.solucao], ['Resultado', a.resultado_obtido], ['Operação', a.impacto_operacao]].filter(x => x[1]).slice(0, 3);
      h.text(s, lin.length ? lin.map(([k, v], j) => ({ text: `${k}: `, options: { bold: true, color: c.ink2 } })).flatMap((r, j) => [r, { text: cut(lin[j][1], 95), options: { breakLine: j < lin.length - 1 } }]) : [{ text: 'Detalhes não informados.', options: { color: c.muted } }],
        { x: M + 0.6, y: y + 0.82, w: 6.6, h: 0.74, fontSize: 11.5 });
      // antes × depois: SLA e custo
      const blocos = [['Impacto no custo', a.antesDepois.find(x => x.ind !== 'SLA')], ['Impacto no SLA', a.antesDepois.find(x => x.ind === 'SLA')]];
      blocos.forEach(([lab, ad], j) => { const x = M + 7.5 + j * 2.35, w = 2.2;
        h.box(s, x, y + 0.15, w, rowH - 0.3, { fill: ad ? (ad.bom ? C.goodBg : C.badBg) : C.white, r: 0.08 });
        h.text(s, lab, { x: x + 0.15, y: y + 0.25, w: w - 0.3, h: 0.26, fontSize: 11, bold: true, color: c.muted });
        if (ad) { h.text(s, `${ad.antes} → ${ad.depois}`, { x: x + 0.15, y: y + 0.55, w: w - 0.3, h: 0.4, fontSize: 16, bold: true, fit: 'shrink' });
          h.text(s, `${ad.bom ? '▼' : '▲'} ${ad.var}`, { x: x + 0.15, y: y + 0.98, w: w - 0.3, h: 0.3, fontSize: 13, bold: true, color: ad.bom ? c.good : c.bad }); }
        else h.text(s, 'Antes × depois não informado', { x: x + 0.15, y: y + 0.6, w: w - 0.3, h: 0.5, fontSize: 11, color: c.muted }); });
    });
  }
});

// 13. CONCLUSÃO EXECUTIVA ----------------------------------------------
reg('conclusao', 'Conclusão', null, (pres, ctx, h) => {
  const { C: c } = h, s = pres.addSlide({ masterName: 'PJ_ESCURO', sectionTitle: 'Conclusão' });
  h.text(s, 'Conclusão executiva', { x: M, y: 0.45, w: 9, h: 0.75, fontSize: 32, bold: true, color: C.white, fontFace: 'Cambria' });
  h.text(s, `Resultado Logístico — ${ctx.periodo.titulo}`, { x: M, y: 1.15, w: 9, h: 0.4, fontSize: 15, color: c.sky });
  s.addImage({ data: ctx.logo, x: W - M - 0.55, y: 0.55, w: 0.55, h: 0.55 });
  const itens = ctx.conclusao, colN = Math.ceil(itens.length / 2), gap = 0.18, top = 1.8, avail = H - top - 0.45;
  const bh = (avail - gap * (colN - 1)) / colN, cw = (CW - 0.3) / 2;
  itens.forEach(([q, a], i) => { const col = i < colN ? 0 : 1, row = col ? i - colN : i, x = M + col * (cw + 0.3), y = top + row * (bh + gap);
    h.box(s, x, y, cw, bh, { fill: c.navy3, r: 0.1 });
    h.text(s, q, { x: x + 0.25, y: y + 0.12, w: cw - 0.5, h: 0.3, fontSize: 13, bold: true, color: c.sky });
    h.text(s, a, { x: x + 0.25, y: y + 0.42, w: cw - 0.5, h: bh - 0.5, fontSize: 12.5, color: C.white, fit: 'shrink' }); });
  s.addNotes(itens.map(([q, a]) => `${q} ${a}`).join('\n'));
});

// ---------------------------------------------------------------------
// GERAÇÃO
// ---------------------------------------------------------------------
let LIB = null;
AP.carregarBiblioteca = () => {
  if (window.PptxGenJS) return Promise.resolve();
  if (LIB) return LIB;
  LIB = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'assets/vendor/pptxgenjs/pptxgen.bundle.js?v=' + (PJ.VERSION || '');
    s.onload = () => window.PptxGenJS ? ok() : ko(new Error('PptxGenJS')); s.onerror = () => { LIB = null; ko(new Error('Falha ao carregar a biblioteca de PowerPoint')); }; document.head.appendChild(s); });
  return LIB;
};
const toDataUrl = async url => { const b = await (await fetch(url)).blob(); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); };
const ACOES_COLS = 'id,titulo,descricao,responsavel,area,data_inicio,prazo,status,prioridade,resultado_esperado,resultado_obtido,progresso,created_at,updated_at';
const ACOES_EXTRA = ',problema,envolvidos,solucao,data_conclusao,sla_antes_horas,sla_depois_horas,custo_antes_pct,custo_depois_pct,impacto_operacao';

// 1–4: coleta os dados exatamente com os filtros atuais e roda a análise
AP.coletar = async (incluirAcoes, passo = () => {}) => {
  const filtros = Object.assign({}, D.F), params = D.params();
  passo('Recalculando indicadores com os filtros do painel…');
  const prevRange = PJ.Analise.periodoAnterior(filtros.dIni, filtros.dFim);
  const [res, opc, prev] = await Promise.all([
    PJ.rpc('dashboard_resumo', params),
    PJ.rpc('dashboard_opcoes', { p_importacao_id: D.CUR_IMP }),
    prevRange ? PJ.rpc('dashboard_resumo', Object.assign({}, params, { p_data_ini: prevRange.ini, p_data_fim: prevRange.fim })) : Promise.resolve(null),
  ]);
  let acoes = null;
  if (incluirAcoes && PJ.can('acoes.ver')) {
    passo('Buscando ações em andamento e finalizadas…');
    let r = await PJ.sb.from('acoes').select(ACOES_COLS + ACOES_EXTRA);
    if (r.error && /column|does not exist/i.test(r.error.message || '')) { console.warn('Campos novos das ações ausentes — rode o supabase_schema.sql atualizado.'); r = await PJ.sb.from('acoes').select(ACOES_COLS); }
    if (r.error) throw r.error; acoes = r.data || [];
  }
  passo('Analisando impactos…');
  const labels = D.FILTERS.map(([k, lab]) => [k, k === 'emp' ? 'Unidade' : lab]);
  const ctx = PJ.Analise.run({ res, prev: prev && prev.total && +prev.total.n ? prev : null, opc, filtros, filtroLabels: labels, acoes, hoje: PJ.today(), prevRange });
  ctx.rascunho = !!(opc.importacao && opc.importacao.status !== 'publicada');
  ctx.baseNome = opc.importacao ? `${opc.importacao.nome_arquivo} (${PJ.fmt.int(opc.total)} registros)` : '–';
  ctx.geradoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  ctx.autor = PJ.me && PJ.me.nome;
  if (!acoes) ctx.acoes = { disponivel: false, andamento: [], finalizadas: [], nota: '' };
  return ctx;
};

// 5–8: monta os slides e gera o arquivo
AP.montar = async (ctx, passo = () => {}) => {
  passo('Montando os slides…');
  await AP.carregarBiblioteca();
  ctx.logo = (await toDataUrl('assets/icons/icon-192.png')).replace(/^data:/, '');
  const pres = new window.PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = `Resultado Logístico — ${ctx.periodo.titulo}`; pres.subject = 'PEÇA JÁ · Resultado Logístico'; pres.author = ctx.autor || 'PEÇA JÁ'; pres.company = 'Autoglass · PEÇA JÁ';
  pres.theme = { headFontFace: 'Cambria', bodyFontFace: FONT };
  const rodape = `PEÇA JÁ · Resultado Logístico · ${ctx.periodo.titulo}${ctx.filtrosLista.length ? ' · ' + ctx.filtrosLista.join(' · ') : ''}`;
  pres.defineSlideMaster({ title: 'PJ_CONTEUDO', background: { color: C.white }, margin: [0.4, 0.6, 0.6, 0.6],
    objects: [
      { image: { x: W - M - 0.4, y: 0.47, w: 0.4, h: 0.4, data: ctx.logo } },
      { text: { text: 'PEÇA JÁ', options: { x: W - M - 1.75, y: 0.47, w: 1.25, h: 0.4, fontFace: FONT, fontSize: 13, bold: true, color: C.ink, align: 'right', valign: 'middle', margin: 0 } } },
      { text: { text: cut(rodape, 150), options: { x: M, y: H - 0.42, w: CW - 1.0, h: 0.26, fontFace: FONT, fontSize: 9, color: C.muted, margin: 0 } } },
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.4, w: CW - 2.3, h: 0.7, fontFace: 'Cambria', fontSize: 28, bold: true, color: C.ink, align: 'left', valign: 'middle', margin: 0 }, text: '' } },
    ],
    slideNumber: { x: W - M - 0.8, y: H - 0.42, w: 0.8, h: 0.26, fontFace: FONT, fontSize: 9, color: C.muted, align: 'right' } });
  pres.defineSlideMaster({ title: 'PJ_ESCURO', background: { color: C.navy }, objects: [] });
  const h = helpers(pres, ctx);
  let secao = null;
  for (const def of SLIDES) {
    if (def.quando && !def.quando(ctx)) continue;
    if (def.secao !== secao) { pres.addSection({ title: def.secao }); secao = def.secao; }
    h.secao = def.secao;
    try { def.montar(pres, ctx, h); } catch (e) { console.error(`Slide "${def.id}" não gerado:`, e); }
  }
  passo('Gerando o arquivo PowerPoint…');
  return await pres.write({ outputType: 'blob' });
};
AP.nomeArquivo = ctx => `PECA-JA_Resultado-Logistico_${ctx.periodo.titulo.replace(/[^\w\d]+/g, '-').replace(/^-|-$/g, '')}_${new Date().toISOString().slice(0, 10)}.pptx`;
AP.baixar = async (blob, nome) => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && PJ.PWA && PJ.PWA.isStandalone() && navigator.canShare) {
    const file = new File([blob], nome, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    if (navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Resultado Logístico' }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// ---------------------------------------------------------------------
// BOTÃO + JANELA DE CONFIRMAÇÃO
// ---------------------------------------------------------------------
AP.botaoHTML = () => (PJ.can('dados.ver') && D.OPC && D.OPC.importacao)
  ? `<button class="btn btn-primary btn-sm" type="button" data-gerar-apresentacao title="Gerar PowerPoint com a visão filtrada">${PJ.icon('present')}Gerar Apresentação</button>` : '';
AP.abrir = () => {
  if (!PJ.can('dados.ver')) return PJ.toast('Seu perfil não pode gerar apresentações.', 'err');
  if (!D.loaded || !D.RES) return PJ.toast('Aguarde os indicadores carregarem.', 'info');
  const T = D.total(), lista = PJ.Analise.filtrosTexto(D.F, D.FILTERS.map(([k, lab]) => [k, k === 'emp' ? 'Unidade' : lab]));
  const per = D.F.dIni || D.F.dFim ? `${PJ.fmt.date(D.F.dIni) || 'início'} a ${PJ.fmt.date(D.F.dFim) || 'fim'}` : 'Base completa';
  const prev = PJ.Analise.periodoAnterior(D.F.dIni, D.F.dFim);
  const body = PJ.h(`<div class="rep-form">
    <div class="rep-preview"><div class="rep-prev-n"><b class="num">${PJ.fmt.int(T.codigos)}</b><span>vendas · ${PJ.fmt.int(T.n)} entregas na visão atual</span></div>
      <div class="help">A apresentação usa exatamente os filtros abaixo — os mesmos do painel. Para mudar, feche, ajuste os filtros e gere de novo.</div></div>
    <div class="kv"><span>Período</span><b>${esc(per)}</b>${lista.map(t => { const [k, ...v] = t.split(': '); return `<span>${esc(k)}</span><b>${esc(v.join(': '))}</b>`; }).join('')}
      <span>Comparação</span><b>${prev ? `período anterior (${PJ.fmt.date(prev.ini)} a ${PJ.fmt.date(prev.fim)})` : 'sem período anterior (filtre datas para comparar)'}</b>
      <span>Meta de custo</span><b>${isFinite(D.meta()) ? PJ.fmt.pct(D.meta()) : '–'}</b></div>
    ${PJ.can('acoes.ver') ? '<label class="rep-check"><input type="checkbox" id="apAcoes" checked> Incluir Plano de Ação e ações finalizadas</label>' : ''}
    ${D.CUR_IMP ? `<div class="form-msg info">${PJ.icon('alert')}<span>Você está vendo uma base em <b>rascunho</b>; a apresentação será marcada como rascunho.</span></div>` : ''}
    <div class="form-msg info" id="apStep" hidden></div><div class="form-msg err" id="apErr" hidden></div></div>`);
  PJ.modal({ title: 'Gerar apresentação (PowerPoint)', wide: true, body, actions: [{ label: 'Cancelar' }, { label: 'Gerar PowerPoint', cls: 'btn-primary', icon: 'present', onClick: async ({ close, btn }) => {
    const step = body.querySelector('#apStep'), err = body.querySelector('#apErr'); err.hidden = true;
    const passo = t => { step.hidden = false; step.innerHTML = `<span class="spin" style="border-color:rgba(10,100,255,.3);border-top-color:var(--blue)"></span><span>${esc(t)}</span>`; };
    PJ.btnBusy(btn, true, 'Gerando…');
    try {
      const ctx = await AP.coletar(!body.querySelector('#apAcoes') || body.querySelector('#apAcoes').checked, passo);
      if (ctx.vazio) throw { code: '22023', message: 'Não há dados para os filtros atuais.' };
      const blob = await AP.montar(ctx, passo);
      await AP.baixar(blob, AP.nomeArquivo(ctx));
      close(); PJ.toast('Apresentação gerada com sucesso.', 'ok');
    } catch (e) { console.error('Erro ao gerar apresentação:', e); PJ.btnBusy(btn, false); step.hidden = true; err.hidden = false;
      err.innerHTML = PJ.icon('alert') + esc(e && e.code === '22023' ? e.message : /biblioteca/i.test(e && e.message || '') ? 'Não foi possível carregar o gerador de PowerPoint. Verifique a conexão e tente de novo.' : PJ.friendly(e)); }
  } }] });
};
document.addEventListener('click', e => { if (e.target.closest('[data-gerar-apresentacao]')) { e.preventDefault(); AP.abrir(); } });
})();
