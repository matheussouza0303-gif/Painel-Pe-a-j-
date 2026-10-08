/* =====================================================================
   PEÇA JÁ · apresentacao-analise.js            [NOVO · v3.1]
   ---------------------------------------------------------------------
   "Inteligência" da apresentação: recebe os dados JÁ FILTRADOS (mesma
   RPC dashboard_resumo e mesmos filtros do painel) e devolve:
     • KPIs com comparação (meta / período anterior)
     • impactos no SLA e no custo por tipo de venda, unidade e transportadora
     • relação SLA × custo
     • ranking de principais ofensores
     • plano de ação e ações finalizadas (com antes × depois)
     • conclusão executiva
   Funções puras, sem acesso a tela ou banco → fáceis de testar e de
   estender. Nenhum texto é inventado: toda frase sai de um número.
   ===================================================================== */
(function (root) {
'use strict';
const A = {};

// ---------- formatação pt-BR (independente da tela) ----------
const nf = (d) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const F = A.fmt = {
  int: v => nf(0).format(Math.round(+v || 0)),
  dec: (v, d = 1) => isFinite(v) ? nf(d).format(v) : '–',
  pct: (v, d = 1) => isFinite(v) ? nf(d).format(v * 100) + '%' : '–',
  pp: (v, d = 1) => isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + nf(d).format(Math.abs(v * 100)) + ' p.p.' : '–',
  brl: v => isFinite(v) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '–',
  brlK: v => { if (!isFinite(v)) return '–'; const a = Math.abs(v), s = v < 0 ? '−' : '';
    return a >= 1e6 ? `${s}R$ ${nf(2).format(a / 1e6)} mi` : a >= 1e3 ? `${s}R$ ${nf(1).format(a / 1e3)} mil` : `${s}R$ ${nf(0).format(a)}`; },
  hms(sec) { if (sec == null || !isFinite(sec)) return '–'; const neg = sec < 0; sec = Math.round(Math.abs(sec)); const p2 = n => String(n).padStart(2, '0');
    const d = Math.floor(sec / 86400), r = sec % 86400, h = Math.floor(r / 3600), m = Math.floor(r % 3600 / 60), s = r % 60;
    return (neg ? '−' : '') + (d > 0 ? `${d}d ${p2(h)}:${p2(m)}` : `${p2(h)}:${p2(m)}:${p2(s)}`); },
  dur(sec) { // variação curta: +0h12 / −1h05
    if (sec == null || !isFinite(sec)) return '–'; const s = sec >= 0 ? '+' : '−'; const a = Math.round(Math.abs(sec) / 60);
    return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`; },
  horas: sec => isFinite(sec) ? nf(1).format(sec / 3600) + ' h' : '–',
  date: s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '–',
  delta: v => isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + nf(1).format(Math.abs(v * 100)) + '%' : '–',
  MES: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  mesCurto: k => { const [y, m] = String(k).split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m - 1] + '/' + y.slice(2); },
};
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

// ---------- agregados (mesmo cálculo do painel: D.G) ----------
A.G = o => { const n = +o.n || 0, v = +o.valor || 0, c = +o.custo || 0, sn = +o.sla_n || 0;
  return { key: o.key, mes: o.mes, n, valor: v, custo: c, pc: v ? c / v : NaN, slaN: sn, sla: sn ? (+o.sla_soma) / sn : null, codigos: +o.codigos || 0 }; };
const groups = (res, name) => ((res && res[name]) || []).map(A.G);

// Impacto de um grupo no SLA consolidado (segundos que ele soma/subtrai da média geral)
const slaImpact = (g, T) => (g.slaN && T.slaN && isFinite(g.sla) && isFinite(T.sla)) ? (g.sla - T.sla) * g.slaN / T.slaN : 0;
// Custo acima (+) / abaixo (−) do que a meta permitiria para o faturamento do grupo
const costExcess = (g, meta) => isFinite(meta) ? g.custo - meta * g.valor : NaN;

function enrich(list, T, meta) {
  return list.map(g => Object.assign(g, {
    volShare: T.codigos ? g.codigos / T.codigos : (T.n ? g.n / T.n : 0),
    entShare: T.n ? g.n / T.n : 0,
    costShare: T.custo ? g.custo / T.custo : 0,
    fatShare: T.valor ? g.valor / T.valor : 0,
    slaImp: slaImpact(g, T),
    exc: costExcess(g, meta),
    slaVsAvg: (isFinite(g.sla) && T.sla) ? g.sla / T.sla - 1 : NaN,
  }));
}
// Grupos com volume relevante (evita "ofensor" com meia dúzia de entregas)
const relevant = (list, minShare = 0.015, minN = 20) => { const r = list.filter(g => g.entShare >= minShare && g.n >= minN); return r.length >= 2 ? r : list; };
const maxBy = (l, f) => l.reduce((b, g) => (b == null || f(g) > f(b) ? g : b), null);
const minBy = (l, f) => l.reduce((b, g) => (b == null || f(g) < f(b) ? g : b), null);

// ---------- período / filtros ----------
A.periodo = (filtros, opc, meses) => {
  const ini = filtros.dIni || '', fim = filtros.dFim || '';
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (ini && fim) {
    const [y1, m1, d1] = ini.split('-').map(Number), [y2, m2, d2] = fim.split('-').map(Number);
    const mesCheio = y1 === y2 && m1 === m2 && d1 === 1 && d2 === lastDay(y2, m2);
    // vários meses completos (ex.: 01/03 a 30/06) → "Mar/26 a jun/26"
    const mesesCheios = !mesCheio && d1 === 1 && d2 === lastDay(y2, m2) && (y2 > y1 || m2 > m1);
    const curto = (y, m) => `${F.MES[m - 1].slice(0, 3)}/${String(y).slice(2)}`;
    return { titulo: mesCheio ? `${cap(F.MES[m1 - 1])}/${y1}` : mesesCheios ? `${cap(curto(y1, m1))} a ${curto(y2, m2)}` : `${F.date(ini)} a ${F.date(fim)}`, linha: `Período: ${F.date(ini)} a ${F.date(fim)}`, ini, fim, filtrado: true };
  }
  const dmin = ini || (meses.length ? meses[0].key + '-01' : opc && opc.data_min) || '', dmax = fim || (opc && opc.data_max) || '';
  if (meses.length === 1) { const [y, m] = meses[0].key.split('-').map(Number); return { titulo: `${cap(F.MES[m - 1])}/${y}`, linha: `Período: ${F.date(dmin)} a ${F.date(dmax)}`, ini: '', fim: '', filtrado: !!(ini || fim) }; }
  const t = meses.length ? `${cap(F.mesCurto(meses[0].key))} a ${F.mesCurto(meses[meses.length - 1].key)}` : 'Base completa';
  return { titulo: t, linha: `Período: ${ini ? F.date(ini) : F.date(opc && opc.data_min)} a ${fim ? F.date(fim) : F.date(opc && opc.data_max)}${ini || fim ? '' : ' (base completa)'}`, ini, fim, filtrado: !!(ini || fim) };
};
A.filtrosTexto = (filtros, labels) => labels.map(([k, lab]) => [lab, filtros[k] || null]).filter(x => x[1]).map(([l, v]) => `${l}: ${v}`);

// Período anterior equivalente (mesma duração, imediatamente antes)
A.periodoAnterior = (ini, fim) => {
  if (!ini || !fim) return null;
  const t = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)), d = s => new Date(s).toISOString().slice(0, 10);
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const [y1, m1, d1] = ini.split('-').map(Number), [y2, m2, d2] = fim.split('-').map(Number);
  if (d1 === 1 && d2 === lastDay(y2, m2)) { // meses cheios → mesmos meses imediatamente antes
    const months = (y2 - y1) * 12 + (m2 - m1) + 1; const s = new Date(Date.UTC(y1, m1 - 1 - months, 1)), e = new Date(Date.UTC(y1, m1 - 1, 0));
    return { ini: d(s), fim: d(e) };
  }
  const len = t(fim) - t(ini) + 864e5; return { ini: d(t(ini) - len), fim: d(t(ini) - 864e5) };
};

// =====================================================================
// ANÁLISE PRINCIPAL
// =====================================================================
A.run = function ({ res, prev, opc, filtros, filtroLabels, acoes, hoje, prevRange }) {
  const meta = opc && opc.config ? (+opc.config.meta_custo_pct) / 100 : NaN;
  const T = A.G(res.total || {}), P = prev ? A.G(prev.total || {}) : null;
  const meses = groups(res, 'por_mes').sort((a, b) => a.key < b.key ? -1 : 1);
  const tipos = enrich(groups(res, 'por_tipo'), T, meta), pars = enrich(groups(res, 'por_transportadora'), T, meta),
    filiais = enrich(groups(res, 'por_filial'), T, meta), segs = enrich(groups(res, 'por_segmento'), T, meta);
  const tipoMes = groups(res, 'tipo_mes');
  const ctx = { T, P, meta, meses, tipos, pars, filiais, segs, tipoMes, hoje, opc, filtros, prevRange };
  ctx.periodo = A.periodo(filtros, opc, meses);
  ctx.filtrosLista = A.filtrosTexto(filtros, filtroLabels);
  ctx.vazio = !T.n;
  if (ctx.vazio) return ctx;

  // ---------------- KPIs ----------------
  const cmp = (cur, old, mode, better) => {
    if (!P || old == null || !isFinite(old) || !isFinite(cur)) return null;
    const diff = mode === 'pp' ? cur - old : (old ? cur / old - 1 : NaN); if (!isFinite(diff)) return null;
    const good = better === 'up' ? diff > 0 : better === 'down' ? diff < 0 : null;
    const flat = Math.abs(diff) < (mode === 'pp' ? 0.0005 : 0.001);
    return { txt: mode === 'pp' ? F.pp(diff) : F.delta(diff), good: flat ? null : good, label: 'vs período anterior' };
  };
  ctx.kpis = [
    { id: 'vendas', label: 'Vendas', valor: F.int(T.codigos), sub: `${F.int(T.n)} entregas`, cmp: cmp(T.codigos, P && P.codigos, '%', 'up') },
    { id: 'fat', label: 'Faturamento', valor: F.brlK(T.valor), sub: F.brl(T.valor), cmp: cmp(T.valor, P && P.valor, '%', 'up') },
    { id: 'custo', label: 'Custo de frete', valor: F.brlK(T.custo), sub: `${F.brl(T.n ? T.custo / T.n : 0)} por entrega`, cmp: cmp(T.custo, P && P.custo, '%', null) },
    { id: 'pc', label: '% custo de frete', valor: F.pct(T.pc, 2), sub: isFinite(meta) ? `meta ${F.pct(meta, 2)} · ${F.pp(T.pc - meta, 2)}` : 'sem meta definida', alerta: isFinite(meta) ? (T.pc > meta ? 'ruim' : 'bom') : null, cmp: cmp(T.pc, P && P.pc, 'pp', 'down') },
    { id: 'sla', label: 'SLA médio de entrega', valor: F.hms(T.sla), sub: `${F.int(T.slaN)} entregas válidas`, cmp: cmp(T.sla, P && P.sla, '%', 'down') },
    { id: 'ticket', label: 'Ticket médio por venda', valor: F.brl(T.codigos ? T.valor / T.codigos : NaN), sub: 'faturamento ÷ vendas', cmp: cmp(T.codigos ? T.valor / T.codigos : NaN, P && P.codigos ? P.valor / P.codigos : NaN, '%', 'up') },
    { id: 'validas', label: 'Entregas com SLA válido', valor: F.pct(T.n ? T.slaN / T.n : NaN, 1), sub: `${F.int(T.n - T.slaN)} recusadas/sem SLA`, cmp: cmp(T.n ? T.slaN / T.n : NaN, P && P.n ? P.slaN / P.n : NaN, 'pp', 'up') },
    { id: 'transp', label: 'Transportadoras ativas', valor: F.int(pars.length), sub: `${F.int(filiais.length)} unidade${filiais.length === 1 ? '' : 's'} com venda`, cmp: null },
  ];
  ctx.indisponiveis = ['Conversão', 'SLA de coleta', 'Raio de entrega'];

  // ---------------- SLA ----------------
  const tiposSla = tipos.filter(g => g.slaN > 0).sort((a, b) => b.sla - a.sla);
  const parsSla = pars.filter(g => g.slaN > 0), filSla = filiais.filter(g => g.slaN > 0);
  const filRel = relevant(filSla), parRel = relevant(parsSla, 0.01, 10);
  const sla = ctx.sla = { tipos: tiposSla, pars: parsSla.slice().sort((a, b) => b.slaImp - a.slaImp), filiais: filSla.slice().sort((a, b) => b.slaImp - a.slaImp), insights: [] };
  sla.lento = tiposSla[0]; sla.rapido = tiposSla[tiposSla.length - 1];
  sla.unid = { maiorSla: maxBy(filRel, g => g.sla), menorSla: minBy(filRel, g => g.sla), maiorVol: maxBy(filiais, g => g.codigos), maiorImp: maxBy(filSla, g => g.slaImp) };
  sla.par = { maiorSla: maxBy(parRel, g => g.sla), menorSla: minBy(parRel, g => g.sla), maiorVol: maxBy(pars, g => g.codigos), maiorImp: maxBy(parsSla, g => g.slaImp), melhorImp: minBy(parsSla, g => g.slaImp) };
  if (tiposSla.length >= 2) sla.insights.push(`O tipo de venda ${sla.lento.key} apresenta o maior SLA entre as modalidades (${F.hms(sla.lento.sla)}, ${F.delta(sla.lento.slaVsAvg)} vs. a média de ${F.hms(T.sla)}).`);
  else if (tiposSla.length === 1) sla.insights.push(`Filtro com um único tipo de venda (${tiposSla[0].key}): SLA médio de ${F.hms(tiposSla[0].sla)}.`);
  const pI = sla.par.maiorImp;
  if (pI && pI.slaImp > 0 && parsSla.length >= 2) sla.insights.push(`A transportadora ${pI.key} representa ${F.pct(pI.volShare, 0)} das vendas e tem SLA médio de ${F.hms(pI.sla)} (${F.delta(pI.slaVsAvg)} vs. média), adicionando ${F.dur(pI.slaImp)} ao SLA consolidado.`);
  const pM = sla.par.melhorImp;
  if (pM && pM.slaImp < 0 && parsSla.length >= 2) sla.insights.push(`${pM.key} puxa o SLA para baixo: ${F.hms(pM.sla)} com ${F.pct(pM.volShare, 0)} das vendas (${F.dur(pM.slaImp)} no consolidado).`);
  const uI = sla.unid.maiorImp;
  if (uI && uI.slaImp > 0 && filSla.length >= 2) sla.insights.push(`A unidade ${uI.key} é a que mais eleva o SLA consolidado (${F.dur(uI.slaImp)}): SLA de ${F.hms(uI.sla)} com ${F.pct(uI.entShare, 1)} das entregas.`);
  // evolução por tipo (se a base tiver mais de um mês)
  const mesesTipo = [...new Set(tipoMes.map(g => g.mes))].sort();
  sla.evolucao = mesesTipo.length >= 2 ? { meses: mesesTipo, series: tiposSla.map(t => ({ key: t.key, valores: mesesTipo.map(m => { const g = tipoMes.find(x => x.key === t.key && x.mes === m); return g && g.slaN ? g.sla : null; }) })) } : null;
  if (sla.evolucao) {
    const first = sla.evolucao.meses[0], last = sla.evolucao.meses[sla.evolucao.meses.length - 1];
    const varTipo = sla.evolucao.series.map(s => { const a = s.valores[0], b = s.valores[s.valores.length - 1]; return { key: s.key, v: a && b ? b / a - 1 : NaN }; }).filter(x => isFinite(x.v));
    const pior = maxBy(varTipo, x => x.v);
    if (pior && Math.abs(pior.v) >= 0.03) sla.insights.push(`Entre ${F.mesCurto(first)} e ${F.mesCurto(last)}, o SLA de ${pior.key} ${pior.v > 0 ? 'subiu' : 'caiu'} ${F.delta(Math.abs(pior.v)).replace('+', '')}.`);
  }

  // ---------------- CUSTO ----------------
  const custo = ctx.custo = { insights: [] };
  custo.diff = T.pc - meta; custo.exc = costExcess(T, meta);
  custo.pars = pars.filter(g => g.valor > 0).sort((a, b) => (b.exc || 0) - (a.exc || 0));
  custo.filiais = filiais.filter(g => g.valor > 0).sort((a, b) => (b.exc || 0) - (a.exc || 0));
  if (isFinite(meta)) custo.insights.push(T.pc > meta
    ? `O custo logístico está ${F.pp(custo.diff, 2).replace('+', '')} acima da meta (${F.pct(T.pc, 2)} vs ${F.pct(meta, 2)}): ${F.brlK(custo.exc)} a mais do que a meta permitiria.`
    : `O custo logístico está ${F.pp(-custo.diff, 2).replace('+', '')} abaixo da meta (${F.pct(T.pc, 2)} vs ${F.pct(meta, 2)}), uma folga de ${F.brlK(-custo.exc)}.`);
  if (P && isFinite(P.pc)) { const d = T.pc - P.pc; if (Math.abs(d) >= 0.0005) custo.insights.push(`${d < 0 ? 'Houve redução' : 'Houve aumento'} do % de custo em relação ao período anterior (${F.pct(P.pc, 2)} → ${F.pct(T.pc, 2)}, ${F.pp(d, 2)}).`); }
  const cP = custo.pars[0];
  if (cP && cP.exc > 0 && pars.length >= 2) custo.insights.push(`A transportadora ${cP.key} gera o maior impacto no custo: ${F.pct(cP.pc, 2)} sobre ${F.brlK(cP.valor)} faturados (${F.brlK(cP.exc)} acima da meta).`);
  else if (pars.length >= 2) { const hi = maxBy(pars.filter(g => g.valor > 0), g => g.pc); if (hi) custo.insights.push(`Nenhuma transportadora está acima da meta; o maior % de custo é de ${hi.key} (${F.pct(hi.pc, 2)}).`); }
  // unidade com maior desproporção custo × volume
  const filRelC = relevant(filiais.filter(g => g.valor > 0));
  const gap = maxBy(filRelC, g => g.costShare - g.entShare);
  if (gap && gap.costShare - gap.entShare >= 0.015 && filiais.length >= 3) custo.insights.push(`A unidade ${gap.key} representa ${F.pct(gap.entShare, 1)} do volume, mas ${F.pct(gap.costShare, 1)} do custo total.`);
  custo.unid = { maiorCusto: maxBy(filiais, g => g.custo), maiorPc: maxBy(filRelC, g => g.pc), maiorVol: maxBy(filiais, g => g.codigos), maiorImp: maxBy(filiais.filter(g => isFinite(g.exc)), g => g.exc) };
  custo.unidAcima = filiais.filter(g => g.exc > 0).length;
  custo.parsAcima = pars.filter(g => g.exc > 0).length;
  // relação SLA × custo: grupos com SLA acima da média têm custo maior?
  const rel = (list, nome) => { const ok = list.filter(g => g.slaN > 0 && g.valor > 0); if (ok.length < 2) return null;
    const sum = l => l.reduce((a, g) => ({ v: a.v + g.valor, c: a.c + g.custo }), { v: 0, c: 0 });
    const hi = sum(ok.filter(g => g.sla > T.sla)), lo = sum(ok.filter(g => !(g.sla > T.sla)));
    if (!hi.v || !lo.v) return null;
    return { nome, acima: hi.c / hi.v, abaixo: lo.c / lo.v, diff: hi.c / hi.v - lo.c / lo.v }; };
  custo.relacao = [rel(pars, 'Transportadoras'), rel(filiais, 'Unidades'), rel(tipos, 'Tipos de venda')].filter(Boolean);
  const relForte = custo.relacao.filter(r => Math.abs(r.diff) >= 0.002).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
  custo.relacaoTxt = !custo.relacao.length ? 'Dados insuficientes para relacionar SLA e custo com os filtros aplicados.'
    : relForte ? `${relForte.nome} com SLA acima da média têm % de custo ${relForte.diff > 0 ? 'MAIOR' : 'MENOR'} (${F.pct(relForte.acima, 2)} vs ${F.pct(relForte.abaixo, 2)}, ${F.pp(relForte.diff, 2)}).`
    : 'Não há relação relevante entre SLA maior e custo maior no período (diferenças menores que 0,2 p.p.).';

  // ---------------- PARTICIPAÇÃO ----------------
  ctx.participacao = pars.slice().sort((a, b) => b.codigos - a.codigos);
  const top = ctx.participacao[0];
  ctx.participacaoTxt = top && ctx.participacao.length === 1 ? `Todas as vendas da visão filtrada são de ${top.key}: SLA de ${F.hms(top.sla)} e custo de ${F.pct(top.pc, 2)}${isFinite(meta) ? (top.pc > meta ? ' — acima da meta' : ' — dentro da meta') : ''}.`
    : top ? `${top.key} movimenta o maior volume (${F.pct(top.volShare, 0)} das vendas), com SLA de ${F.hms(top.sla)} (${isFinite(top.slaVsAvg) ? F.delta(top.slaVsAvg) + ' vs média' : '–'}) e custo de ${F.pct(top.pc, 2)}${isFinite(meta) ? (top.pc > meta ? ' — acima da meta' : ' — dentro da meta') : ''}.` : '';

  // ---------------- OFENSORES (ranking) ----------------
  // Escore comparável: SLA → fração do SLA consolidado que o grupo adiciona; custo → fração do custo total acima da meta.
  const cands = [];
  const addSla = (l, tipo) => l.forEach(g => { if (g.slaImp > 0 && T.sla) cands.push({ tipo, key: g.key, kind: 'sla', score: g.slaImp / T.sla, g,
    titulo: `${tipo} ${g.key} — SLA elevado`, curto: `SLA de ${F.hms(g.sla)}, ${F.delta(g.slaVsAvg)} vs média`, detalhe: `SLA ${F.hms(g.sla)} (${F.delta(g.slaVsAvg)} vs média) · ${F.pct(g.entShare, 1)} das entregas · ${F.dur(g.slaImp)} no consolidado` }); });
  const addCusto = (l, tipo) => l.forEach(g => { if (g.exc > 0 && T.custo) cands.push({ tipo, key: g.key, kind: 'custo', score: g.exc / T.custo, g,
    titulo: `${tipo} ${g.key} — custo acima da meta`, curto: `${F.pct(g.pc, 2)} de custo, ${F.brlK(g.exc)} acima da meta`, detalhe: `${F.pct(g.pc, 2)} de custo (meta ${F.pct(meta, 2)}) · ${F.brlK(g.exc)} acima da meta · ${F.pct(g.entShare, 1)} das entregas` }); });
  if (pars.length >= 2) { addSla(relevant(parsSla, 0.01, 10), 'Transportadora'); addCusto(relevant(pars.filter(g => g.valor > 0), 0.01, 10), 'Transportadora'); }
  if (filiais.length >= 2) { addSla(filRel, 'Unidade'); addCusto(filRelC, 'Unidade'); }
  if (tipos.length >= 2) { addSla(tiposSla, 'Tipo de venda'); addCusto(tipos.filter(g => g.valor > 0), 'Tipo de venda'); }
  const seen = new Set();
  ctx.ofensores = cands.sort((a, b) => b.score - a.score).filter(c => { const k = c.tipo + '|' + c.key; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);

  // ---------------- AÇÕES ----------------
  ctx.acoes = A.acoes(acoes, filtros, hoje);

  // ---------------- CONCLUSÃO ----------------
  ctx.conclusao = A.conclusao(ctx);
  ctx.destaques = [...custo.insights.slice(0, 1), ...sla.insights.slice(0, 1), ctx.participacao.length > 1 ? ctx.participacaoTxt : ''].filter(Boolean);
  return ctx;
};

// ---------- ações: filtradas pelo período e pela unidade/transportadora do painel ----------
A.acoes = function (lista, filtros, hoje) {
  if (!lista) return { disponivel: false, andamento: [], finalizadas: [], nota: '' };
  const ini = filtros.dIni || '', fim = filtros.dFim || '';
  const alvo = [filtros.par, filtros.emp].filter(Boolean).map(v => v.toLowerCase());
  const txt = a => [a.envolvidos, a.titulo, a.problema, a.descricao].filter(Boolean).join(' ').toLowerCase();
  const sel = lista.filter(a => {
    const s = a.data_inicio || a.prazo || String(a.created_at || '').slice(0, 10), e = a.data_conclusao || a.prazo || a.data_inicio || String(a.created_at || '').slice(0, 10);
    if (fim && s && s > fim) return false;
    if (ini && e && e < ini) return false;
    if (alvo.length && a.envolvidos && !alvo.some(v => txt(a).includes(v))) return false; // ação de outra unidade/transportadora
    return true;
  }).map(a => Object.assign({}, a, { atrasada: a.status !== 'concluida' && a.prazo && a.prazo < hoje, geral: !a.envolvidos }));
  const ord = { critica: 0, alta: 1, media: 2, baixa: 3 };
  const andamento = sel.filter(a => a.status !== 'concluida').sort((a, b) => (b.atrasada - a.atrasada) || (ord[a.prioridade] - ord[b.prioridade]) || String(a.prazo || '9').localeCompare(String(b.prazo || '9')));
  const finalizadas = sel.filter(a => a.status === 'concluida').sort((a, b) => String(b.data_conclusao || b.prazo || '').localeCompare(String(a.data_conclusao || a.prazo || ''))).map(a => {
    const ad = [];
    if (a.custo_antes_pct != null && a.custo_depois_pct != null) { const d = (a.custo_depois_pct - a.custo_antes_pct) / 100;
      ad.push({ ind: 'Custo de frete', antes: F.pct(a.custo_antes_pct / 100, 1), depois: F.pct(a.custo_depois_pct / 100, 1), var: F.pp(d, 1), bom: d < 0 }); }
    if (a.sla_antes_horas != null && a.sla_depois_horas != null) { const d = a.sla_antes_horas ? a.sla_depois_horas / a.sla_antes_horas - 1 : NaN;
      ad.push({ ind: 'SLA', antes: F.dec(+a.sla_antes_horas, 1) + ' h', depois: F.dec(+a.sla_depois_horas, 1) + ' h', var: F.delta(d), bom: d < 0 }); }
    return Object.assign(a, { antesDepois: ad });
  });
  const partes = [];
  if (ini || fim) partes.push('ações cujo período cruza o período filtrado');
  if (alvo.length) partes.push(`ações ligadas a ${[filtros.par, filtros.emp].filter(Boolean).join(' / ')} ou gerais (sem unidade/transportadora definida)`);
  return { disponivel: true, andamento, finalizadas, atrasadas: andamento.filter(a => a.atrasada).length, nota: partes.length ? 'Considerando ' + partes.join(' e ') + '.' : 'Todas as ações cadastradas.' };
};

// ---------- conclusão executiva (7 perguntas) ----------
A.conclusao = function (ctx) {
  const { T, P, meta, sla, custo, acoes } = ctx, out = [];
  let o = `${F.int(T.codigos)} vendas (${F.int(T.n)} entregas), faturamento de ${F.brlK(T.valor)} e frete de ${F.brlK(T.custo)} (${F.pct(T.pc, 2)}${isFinite(meta) ? `; meta ${F.pct(meta, 2)}` : ''}). SLA médio de ${F.hms(T.sla)}.`;
  if (P && P.n) o += ` Frente ao período anterior: faturamento ${F.delta(T.valor / P.valor - 1)}, custo ${F.pp(T.pc - P.pc, 2)}, SLA ${F.delta(T.sla / P.sla - 1)}.`;
  out.push(['O que aconteceu?', o]);
  const slaC = [...(sla.pars.length >= 2 ? sla.pars.slice(0, 1).map(g => ['transportadora', g]) : []), ...(sla.filiais.length >= 2 ? sla.filiais.slice(0, 1).map(g => ['unidade', g]) : []), ...(sla.tipos.length >= 2 ? sla.tipos.map(g => ['tipo de venda', g]).sort((a, b) => b[1].slaImp - a[1].slaImp).slice(0, 1) : [])]
    .filter(([, g]) => g.slaImp > 0).sort((a, b) => b[1].slaImp - a[1].slaImp);
  out.push(['Principal impacto no SLA', slaC.length ? `${cap(slaC[0][0])} ${slaC[0][1].key}: SLA de ${F.hms(slaC[0][1].sla)}, somando ${F.dur(slaC[0][1].slaImp)} ao SLA consolidado.` : 'Nenhum grupo relevante eleva o SLA acima da média nos filtros aplicados.']);
  const custC = [...custo.pars.map(g => ['transportadora', g]), ...custo.filiais.map(g => ['unidade', g])].filter(([, g]) => g.exc > 0).sort((a, b) => b[1].exc - a[1].exc);
  out.push(['Principal impacto no custo', !isFinite(meta) ? 'Meta de custo não definida.' : custC.length ? `${cap(custC[0][0])} ${custC[0][1].key}: ${F.pct(custC[0][1].pc, 2)} de custo, ${F.brlK(custC[0][1].exc)} acima da meta.${T.pc <= meta ? ' No consolidado, o custo segue dentro da meta.' : ''}` : 'Custo dentro da meta em todas as transportadoras e unidades.']);
  const of = ctx.ofensores[0];
  out.push(['Quem mais impactou o resultado', of ? `${of.titulo} (${of.curto}).` : 'Sem ofensores relevantes nos filtros aplicados.']);
  if (acoes.disponivel) {
    out.push(['Ações em andamento', acoes.andamento.length ? `${F.int(acoes.andamento.length)} ações abertas${acoes.atrasadas ? `, ${acoes.atrasadas} atrasada${acoes.atrasadas > 1 ? 's' : ''}` : ''}: ${acoes.andamento.slice(0, 2).map(a => a.titulo).join('; ')}.` : 'Nenhuma ação em andamento para os filtros aplicados.']);
    const best = acoes.finalizadas.find(a => a.antesDepois.length);
    out.push(['Ações concluídas', acoes.finalizadas.length ? `${F.int(acoes.finalizadas.length)} concluída${acoes.finalizadas.length > 1 ? 's' : ''}${best ? `; destaque: ${best.titulo} (${best.antesDepois.map(x => `${x.ind === 'SLA' ? 'SLA' : x.ind.toLowerCase()} ${x.antes} → ${x.depois}`).join(', ')})` : ''}.` : 'Nenhuma ação concluída no período.']);
  }
  let at; const atr = n => n === 1 ? 'a 1 ação com prazo vencido' : `as ${n} ações com prazo vencido`;
  if (isFinite(meta) && T.pc > meta) at = `Trazer o custo de ${F.pct(T.pc, 2)} para a meta de ${F.pct(meta, 2)}${custC.length ? `, começando pela ${custC[0][0]} ${custC[0][1].key}` : ''}.`;
  else if (slaC.length) at = `Reduzir o SLA de ${slaC[0][1].key} (${F.hms(slaC[0][1].sla)}), maior pressão sobre o SLA consolidado.`;
  else if (acoes.atrasadas) at = `Recuperar ${atr(acoes.atrasadas)}.`;
  else at = 'Manter o desempenho: custo dentro da meta e SLA sem ofensores relevantes.';
  if (acoes.disponivel && acoes.atrasadas && !/prazo vencido/.test(at)) at += ` Atenção também ${acoes.atrasadas === 1 ? 'à 1 ação atrasada' : `às ${acoes.atrasadas} ações atrasadas`}.`;
  out.push(['Ponto de atenção para o próximo período', at]);
  return out;
};

root.PJ = root.PJ || {}; root.PJ.Analise = A;
if (typeof module !== 'undefined') module.exports = A;
})(typeof window !== 'undefined' ? window : globalThis);
