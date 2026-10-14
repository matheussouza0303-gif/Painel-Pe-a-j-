/* =====================================================================
   PEÇA JÁ · conversao.js — Dashboard de CONVERSÃO DE VENDAS. [v3.2 · NOVO]
   ---------------------------------------------------------------------
   Reproduz a planilha "CONVERSÃO PEÇA JÁ" (abas Painel - Conversão e
   Painel - Conversão Equipes) com base própria no Supabase:
     • Vendas aptas   = soma de "Qtde Vendas no Critérios"
     • Vendas Peça Já = soma de "Qtde Vendas Peça Já"
     • Conversão      = Vendas Peça Já ÷ Vendas aptas (nunca média de %)
     • Faturamento PJ = Valor Total Negociado das vendas "VENDA PEÇA JÁ"
   Todos os números vêm do banco (RPCs conversao_*), já filtrados.
   Filtros com seleção múltipla: dentro do filtro = OU; entre filtros = E.
   Independente do painel de SLA/custo (não usa PJ.D nem a base de entregas).
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, $ = PJ.$, esc = PJ.esc, F = PJ.fmt;
const CV = PJ.Conversao = {};

// ---------- Filtros (mesmos campos das segmentações da planilha + extras da base) ----------
const FILTROS = [
  { k: 'mes', t: 'Mês', all: 'Todos', lbl: v => F.mesF(v) },
  { k: 'unidade', t: 'Unidade', all: 'Todas' },
  { k: 'regiao', t: 'Região', all: 'Todas' },
  { k: 'tipo', t: 'Tipo de venda', all: 'Todos' },
  { k: 'seg_equipe', t: 'Seg. equipe venda', all: 'Todos', help: 'Segmentação Equipe Venda' },
  { k: 'seg_cliente', t: 'Segmento do cliente', all: 'Todos' },
  { k: 'lideranca', t: 'Liderança', all: 'Todas', help: 'Liderança Equipe Venda' },
  { k: 'equipe', t: 'Equipe de venda', all: 'Todas', help: 'Equipe Venda (Vendedor Titular)' },
  { k: 'vendedor', t: 'Vendedor', all: 'Todos' },
  { k: 'raio', t: 'Raio KM', all: 'Todos' },
  { k: 'status', t: 'Status Same Day', all: 'Todos', help: 'Venda poderia ir no Same Day?' },
];
const FBY = Object.fromEntries(FILTROS.map(f => [f.k, f]));
// Colunas da tabela detalhada
const DIMS = { mes: 'Mês', dia: 'Data', unidade: 'Unidade', regiao: 'Região', tipo: 'Tipo de venda', seg_equipe: 'Seg. equipe venda',
  seg_cliente: 'Segmento cliente', lideranca: 'Liderança', equipe: 'Equipe venda', vendedor: 'Vendedor', raio: 'Raio KM', status: 'Status Same Day', cliente: 'Cliente final', cod_venda: 'Cód. venda' };
const DIMS_PADRAO = ['mes', 'unidade', 'tipo', 'seg_equipe', 'seg_cliente', 'lideranca'];
const DIMS_ESCOLHA = ['mes', 'dia', 'unidade', 'regiao', 'tipo', 'seg_equipe', 'seg_cliente', 'lideranca', 'equipe', 'vendedor', 'raio', 'status', 'cliente'];
const COR = { aptas: 'var(--s1)', pj: 'var(--c-sky)', conv: 'var(--warn-bar)' };

const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const S = CV.S = { opc: null, res: null, cmp: null, f: {}, seq: 0, tseq: 0, loaded: false, erro: null,
  dims: PJ.pref.get('conv.dims', DIMS_PADRAO), detalhe: PJ.pref.get('conv.detalhe', false),
  tab: { busca: '', ordem: 'aptas', desc: true, pag: 0, por: 25, total: 0 }, unidOrd: 'aptas' };
FILTROS.forEach(f => S.f[f.k] = []);
(() => { const saved = PJ.pref.get('conv.filtros', null); if (saved) FILTROS.forEach(f => { if (Array.isArray(saved[f.k])) S.f[f.k] = saved[f.k].map(String); }); })();

const conv = g => g && +g.aptas > 0 ? (+g.pj) / (+g.aptas) : NaN;
const opts = k => ((S.opc && S.opc.opcoes && S.opc.opcoes[k]) || []).map(([v, n]) => ({ v: String(v), n: +n }));
const ativos = () => FILTROS.filter(f => S.f[f.k].length);
const payload = (over = {}) => { const p = {}; FILTROS.forEach(f => { if (S.f[f.k].length) p[f.k] = S.f[f.k]; }); return Object.assign(p, over); };
const salvar = () => { PJ.pref.set('conv.filtros', S.f); };
const lbl = (k, v) => { if (k === 'mes') return F.mesF(v); return v; };
const lidLbl = v => v === '-' ? '— (sem liderança)' : v === '0' ? '0 (sem liderança)' : v;
const dataHora = s => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(',', '') : '–';
const mesAdd = (key, n) => { let [y, m] = key.split('-').map(Number); m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
const mesesTxt = ms => !ms.length ? '' : ms.length === 1 ? F.mes(ms[0]) : `${F.mes(ms[0])} a ${F.mes(ms[ms.length - 1])}`;
const convTxt = g => isFinite(conv(g)) ? F.pct(conv(g), 1) : '–';
const tipConv = (t, g) => PJ.tipHTML(t, [['Vendas aptas', F.int(g.aptas)], ['Vendas Peça Já', F.int(g.pj)], ['Conversão', convTxt(g)], ['Faturamento Peça Já', F.brl(g.fat)], ['Total de vendas', F.int(g.vendas)]]);

// =====================================================================
// LAYOUT
// =====================================================================
const kpi = (id, label, icon, accent) => `<div class="kpi" id="cvk_${id}" style="--accent:${accent}"><div class="top"><span class="l">${esc(label)}</span><span class="ic">${PJ.icon(icon)}</span></div>
  <div class="v num"><span class="sk" style="display:inline-block;width:70%;height:24px"></span></div><div class="s"></div></div>`;
const card = (id, title, desc, cls = 'c6', head = '') => `<div class="card ${cls} lift"><div class="card-h"><div><h3>${esc(title)}</h3>${desc ? `<div class="d" id="${id}_d">${desc}</div>` : ''}</div>${head}</div>
  <div class="chart-body" id="${id}"><div class="sk" style="height:160px"></div></div></div>`;

function html() {
  const podeImp = PJ.can('conversao.importar');
  return `<div class="page-head cv-head"><div><div class="eyebrow">Performance · Indicadores</div><h1>Conversão de Vendas — PEÇA JÁ</h1>
      <p id="cvUpd"><span class="sk" style="display:inline-block;width:280px;height:14px"></span></p></div>
    <div class="fbar">${podeImp ? `<button class="btn btn-primary" type="button" id="cvImp">${PJ.icon('upload')}Atualizar Base de Conversão</button>` : ''}</div></div>
  <div id="cvBanner"></div>
  <section class="cv-filtros" aria-label="Filtros da conversão"><div class="cv-fbar" id="cvF"></div></section>
  <div id="cvBody">
  <section class="section"><div class="kpis cv-kpis stagger">
    ${kpi('conv', 'Conversão Peça Já', 'target', COR.conv)}${kpi('aptas', 'Vendas aptas ao Peça Já', 'checkc', COR.aptas)}
    ${kpi('pj', 'Vendas Peça Já', 'bolt', COR.pj)}${kpi('fat', 'Faturamento vendas Peça Já', 'trend', 'var(--s2)')}
    ${kpi('total', 'Qtde total de vendas', 'cart', 'var(--s4)')}${kpi('nconv', 'Aptas sem Peça Já', 'flag', 'var(--s5)')}
    ${kpi('web', 'Conversão — VENDAS WEB', 'monitor', 'var(--s3)')}${kpi('unid', 'Unidades analisadas', 'grid', 'var(--violet-ink)')}</div></section>
  <section class="section grid stagger">
    ${card('cvMes', 'Evolução mensal da conversão', 'Vendas aptas e Peça Já (barras) e % de conversão (linha). Clique num mês para filtrar.', 'c8')}
    ${card('cvFun', 'Vendas aptas × vendas realizadas', 'Do total de vendas até as vendas Peça Já.', 'c4')}
    ${card('cvDia', 'Acompanhamento diário', 'Vendas aptas, vendas Peça Já e conversão por dia.', 'c12')}
    ${card('cvSegCli', 'Conversão por segmento do cliente', 'Clique numa coluna para filtrar o segmento.', 'c4')}
    ${card('cvSegEq', 'Conversão por segmento da equipe de venda', 'Segmentação Equipe Venda. Clique para filtrar.', 'c4')}
    ${card('cvRaio', 'Conversão por raio (KM)', 'Distância até a unidade Same Day mais próxima.', 'c4')}
    ${card('cvTipo', 'Conversão por tipo de venda', 'Ordenado por volume de vendas aptas. Clique para filtrar.', 'c6 cv-long')}
    ${card('cvLid', 'Conversão por liderança', 'Campo “Liderança - grafico” da planilha (líder e equipe).', 'c6 cv-long')}
    ${card('cvUnid', 'Conversão por unidade', 'As 15 primeiras conforme a ordenação. Clique para filtrar.', 'c6 cv-long',
      `<select class="select" id="cvUnidOrd" aria-label="Ordenar unidades"><option value="aptas">Mais vendas aptas</option><option value="pj">Mais vendas Peça Já</option><option value="maior">Maior conversão</option><option value="menor">Menor conversão</option></select>`)}
    ${card('cvEq', 'Conversão — 20 principais equipes de venda', 'Por volume de vendas aptas.', 'c6 cv-long')}
    ${card('cvVend', 'Ranking — 20 principais vendedores', 'Por volume de vendas aptas.', 'c6 cv-long')}
    ${card('cvCli', 'Ranking — 20 principais clientes', 'Clientes finais com mais vendas aptas.', 'c6 cv-long')}
  </section>
  <section class="section"><div class="card c12" id="cvTabCard">
    <div class="card-h"><div><h3>Tabela detalhada</h3><div class="d">Mesmos filtros do painel. A conversão de cada linha e do total é Peça Já ÷ aptas.</div></div>
      <div class="cv-tab-acts"><div class="input-wrap cv-busca">${PJ.icon('search')}<input class="input" id="cvBusca" type="search" placeholder="Buscar na tabela…" aria-label="Buscar na tabela"></div>
      <button class="btn btn-ghost btn-sm" type="button" id="cvExp">${PJ.icon('download')}Exportar CSV</button></div></div>
    <div class="cv-dims" id="cvDims" role="group" aria-label="Agrupar a tabela por"></div>
    <div id="cvTab"><div class="sk" style="height:200px"></div></div>
    <div class="cv-pag" id="cvPag"></div></div></section>
  </div>`;
}

// =====================================================================
// BARRA DE FILTROS (seleção múltipla)
// =====================================================================
function renderBar() {
  const el = $('#cvF'); if (!el) return;
  const act = ativos();
  const tog = `<button type="button" class="btn btn-ghost btn-sm cv-ftog" aria-expanded="${$('.cv-filtros') && $('.cv-filtros').classList.contains('aberto')}">${PJ.icon('filter')}Filtros${act.length ? ` <span class="fcount">${act.length}</span>` : ''}<span class="muted">${act.length ? act.map(f => f.t).join(', ') : 'nenhum ativo'}</span>${PJ.icon('chevD')}</button>`;
  el.innerHTML = tog + FILTROS.map(f => { const sel = S.f[f.k], n = sel.length;
    const val = !n ? f.all : n === 1 ? (f.k === 'mes' ? F.mes(sel[0]) : sel[0]) : `${n} selecionados`;
    return `<button type="button" class="msel ${n ? 'on' : ''}" data-f="${f.k}" aria-haspopup="dialog" aria-label="${esc(f.t)}: ${esc(val)}" ${n ? `data-tip="${esc(PJ.tipHTML(f.t, sel.slice(0, 12).map(v => [lbl(f.k, v), ''])) + (n > 12 ? `<div class="tr"><span>+ ${n - 12}</span></div>` : ''))}"` : ''}>
      <span class="t">${esc(f.t)}</span><span class="v">${esc(val)}</span>${n ? `<span class="fcount">${n}</span>` : ''}${PJ.icon('chevD')}</button>`; }).join('')
    + `<button type="button" class="btn btn-ghost btn-sm cv-clear" id="cvClr" ${act.length ? '' : 'disabled'}>${PJ.icon('x')}Limpar filtros${act.length ? ` <span class="fcount">${act.length}</span>` : ''}</button>`;
  el.querySelectorAll('.msel').forEach(b => b.onclick = () => abrirMS(b.dataset.f, b));
  el.querySelector('.cv-ftog').onclick = () => { const box = $('.cv-filtros'); box.classList.toggle('aberto'); el.querySelector('.cv-ftog').setAttribute('aria-expanded', box.classList.contains('aberto')); };
  $('#cvClr').onclick = () => { FILTROS.forEach(f => S.f[f.k] = []); salvar(); renderBar(); CV.carregar(); };
}

let POP = null;
function fecharMS() { if (!POP) return; const p = POP; POP = null; p.el.classList.add('out'); p.ov && p.ov.remove(); setTimeout(() => p.el.remove(), 140); document.removeEventListener('mousedown', p.out, true); document.removeEventListener('keydown', p.key); window.removeEventListener('resize', fecharMS); p.btn && p.btn.focus && p.btn.focus(); }
function abrirMS(k, btn) {
  if (POP && POP.k === k) return fecharMS(); fecharMS();
  const f = FBY[k], all = opts(k).sort((a, b) => k === 'mes' ? (a.v < b.v ? 1 : -1) : a.v.localeCompare(b.v, 'pt-BR', { numeric: true }));
  const sel = new Set(S.f[k]); let q = '';
  const el = PJ.h(`<div class="ms-pop" role="dialog" aria-label="Filtro ${esc(f.t)}"><div class="ms-h"><div><b>${esc(f.t)}</b>${f.help ? `<small>${esc(f.help)}</small>` : ''}</div><button class="icon-btn" type="button" data-x aria-label="Fechar">${PJ.icon('x')}</button></div>
    ${all.length > 7 ? `<div class="input-wrap ms-q">${PJ.icon('search')}<input class="input" type="search" placeholder="Pesquisar ${esc(f.t.toLowerCase())}…" aria-label="Pesquisar opções"></div>` : ''}
    <div class="ms-tools"><button type="button" class="linkbtn" data-all>Selecionar todos</button><button type="button" class="linkbtn" data-none>Limpar seleção</button><span class="ms-n"></span></div>
    <div class="ms-sel"></div><div class="ms-list" role="listbox" aria-multiselectable="true"></div>
    <div class="ms-f"><button class="btn btn-primary btn-sm btn-block" type="button" data-ok>Concluir</button></div></div>`);
  const list = el.querySelector('.ms-list'), selBox = el.querySelector('.ms-sel'), nEl = el.querySelector('.ms-n');
  const vis = () => { const nq = norm(q).trim(); return nq ? all.filter(o => norm(lbl(k, o.v) + ' ' + o.v).includes(nq)) : all; };
  const aplicar = PJ.debounce(() => { S.f[k] = sel.size === all.length ? [] : [...sel]; salvar(); renderBar(); CV.carregar(); }, 450);
  const pinta = () => {
    const v = vis();
    list.innerHTML = v.length ? v.map(o => `<label class="ms-opt"><input type="checkbox" value="${esc(o.v)}" ${sel.has(o.v) ? 'checked' : ''}><span class="l">${esc(k === 'lideranca' ? o.v : lbl(k, o.v))}</span><small class="num">${F.int(o.n)}</small></label>`).join('')
      : `<div class="empty" style="padding:18px">${PJ.icon('search')}<span>Nenhuma opção encontrada.</span></div>`;
    nEl.textContent = sel.size ? `${F.int(sel.size)} de ${F.int(all.length)} selecionados` : `${F.int(all.length)} opções · nenhum filtro`;
    selBox.innerHTML = sel.size ? [...sel].slice(0, 30).map(v => `<span class="chip">${esc(k === 'mes' ? F.mes(v) : v)}<button type="button" data-rm="${esc(v)}" aria-label="Remover ${esc(v)}">${PJ.icon('x')}</button></span>`).join('') + (sel.size > 30 ? `<span class="muted">+${sel.size - 30}</span>` : '') : '';
    selBox.hidden = !sel.size;
  };
  list.addEventListener('change', e => { const i = e.target; if (!i.matches('input[type=checkbox]')) return; i.checked ? sel.add(i.value) : sel.delete(i.value); pinta(); aplicar(); });
  selBox.addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; sel.delete(b.dataset.rm); pinta(); aplicar(); });
  el.querySelector('[data-all]').onclick = () => { vis().forEach(o => sel.add(o.v)); pinta(); aplicar(); };
  el.querySelector('[data-none]').onclick = () => { if (q) vis().forEach(o => sel.delete(o.v)); else sel.clear(); pinta(); aplicar(); };
  el.querySelector('[data-x]').onclick = fecharMS; el.querySelector('[data-ok]').onclick = fecharMS;
  const qi = el.querySelector('.ms-q input'); if (qi) qi.oninput = () => { q = qi.value; pinta(); };
  pinta();
  const mobile = innerWidth <= 640, ov = mobile ? PJ.h('<div class="ms-ov"></div>') : null;
  if (ov) { ov.onclick = fecharMS; document.body.appendChild(ov); }
  document.body.appendChild(el);
  if (!mobile) { const r = btn.getBoundingClientRect(), w = Math.min(340, innerWidth - 24);
    el.style.width = w + 'px'; el.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px';
    const top = r.bottom + 6, below = innerHeight - top - 12; el.style.top = (below > 280 ? top : Math.max(12, r.top - Math.min(460, r.top - 24) - 6)) + 'px';
    el.style.maxHeight = (below > 280 ? Math.min(460, below) : Math.min(460, r.top - 24)) + 'px'; }
  const out = e => { if (!el.contains(e.target) && !btn.contains(e.target)) fecharMS(); };
  const key = e => { if (e.key === 'Escape') fecharMS(); };
  POP = { k, el, ov, btn, out, key };
  setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', key); window.addEventListener('resize', fecharMS); }, 0);
  setTimeout(() => (qi || el.querySelector('.ms-opt input') || el).focus && (qi || el.querySelector('.ms-opt input')).focus(), 40);
}
// Clique num gráfico = alterna o valor no filtro correspondente
function alterna(k, v) {
  if (!FBY[k] || v == null) return; const a = S.f[k], i = a.indexOf(v);
  if (i >= 0) a.splice(i, 1); else a.push(v);
  salvar(); renderBar(); CV.carregar();
  PJ.toast(i >= 0 ? `Filtro removido: <b>${esc(lbl(k, v))}</b>` : `Filtro aplicado: <b>${esc(FBY[k].t)} = ${esc(lbl(k, v))}</b>`, 'info', { ms: 2200 });
}

// =====================================================================
// CARGA DE DADOS
// =====================================================================
CV.carregarOpcoes = async () => {
  S.opc = await PJ.rpc('conversao_opcoes');
  // remove dos filtros salvos valores que não existem mais na base
  FILTROS.forEach(f => { const ok = new Set(opts(f.k).map(o => o.v)); S.f[f.k] = S.f[f.k].filter(v => ok.has(v)); });
  salvar();
};
// Período anterior: os N meses imediatamente antes do 1º mês selecionado (N = meses selecionados)
function periodoAnterior() {
  const base = opts('mes').map(o => o.v).sort();
  const sel = S.f.mes.slice().sort();
  if (sel.length) { const prev = []; for (let i = sel.length; i >= 1; i--) prev.push(mesAdd(sel[0], -i));
    return { cur: sel, prev, ok: prev.every(m => base.includes(m)), modo: 'sel' }; }
  if (base.length >= 2) { const last = base[base.length - 1]; return { cur: [last], prev: [mesAdd(last, -1)], ok: base.includes(mesAdd(last, -1)), modo: 'ultimo' }; }
  return null;
}
CV.carregar = async () => {
  const my = ++S.seq; S.erro = null;
  const body = $('#cvBody'); if (!body) return;
  body.classList.add('cv-busy'); PJ.loading(true);
  try {
    if (!S.opc) await CV.carregarOpcoes();
    if (my !== S.seq) return;
    renderHead(); renderBar();
    if (!S.opc.total) { body.classList.remove('cv-busy'); return renderVazioBase(); }
    const per = periodoAnterior(), p = payload();
    const reqs = [PJ.rpc('conversao_resumo', { p_filtros: p, p_bloco: 'tudo' }), Promise.resolve({})]; // [v3.2.1] uma única consulta
    if (per && per.ok) { reqs.push(PJ.rpc('conversao_resumo', { p_filtros: payload({ mes: per.prev }), p_bloco: 'total' }));
      if (per.modo === 'ultimo') reqs.push(PJ.rpc('conversao_resumo', { p_filtros: payload({ mes: per.cur }), p_bloco: 'total' })); }
    const [a, b, prev, cur] = await Promise.all(reqs);
    if (my !== S.seq) return;
    S.res = Object.assign({}, a, b);
    S.cmp = per && per.ok ? { per, prev: prev.total, cur: per.modo === 'ultimo' ? cur.total : S.res.total } : per ? { per, semDados: true } : null;
    S.loaded = true;
    renderTudo();
    S.tab.pag = 0; CV.carregarTabela();
  } catch (e) {
    if (my !== S.seq) return; console.error('Erro na conversão:', e);
    S.erro = PJ.friendly(e); S.erroCod = e && e.code; renderBanner();
  } finally { if (my === S.seq) { body.classList.remove('cv-busy'); } PJ.loading(false); }
};

// =====================================================================
// RENDER
// =====================================================================
function renderHead() {
  const u = S.opc && S.opc.ultima, el = $('#cvUpd'); if (!el) return;
  el.innerHTML = u ? `<b>Última atualização da base:</b> ${esc(dataHora(u.concluida_em))} · ${esc(u.nome_arquivo)}${u.criado_por_nome ? ` · por ${esc(u.criado_por_nome)}` : ''}<br><span class="muted">Dados de ${F.date(S.opc.data_min)} a ${F.date(S.opc.data_max)} · ${F.int(S.opc.total)} vendas na base</span>`
    : 'Base de conversão ainda não carregada.';
}
function renderBanner() {
  const el = $('#cvBanner'); if (!el) return;
  let h = '';
  if (S.erro) h = `<div class="banner err">${PJ.icon('alert')}<div class="grow">${esc(S.erro)}${S.erroCod === '57014' && PJ.can('conversao.importar') ? '<br><small>O banco não respondeu a tempo. Rode o arquivo <b>supabase_conversao.sql</b> no SQL Editor do Supabase: ele limpa envios que falharam, atualiza as estatísticas e mostra um diagnóstico no final.</small>' : ''}</div><button class="btn btn-sm btn-ghost" type="button" id="cvRetry">${PJ.icon('refresh')}Tentar de novo</button></div>`;
  else if (S.loaded && S.res && !+S.res.total.vendas) h = `<div class="banner info">${PJ.icon('filter')}<div class="grow">Nenhum registro para os filtros escolhidos. Ajuste ou limpe os filtros.</div><button class="btn btn-sm btn-ghost" type="button" id="cvClr2">${PJ.icon('x')}Limpar filtros</button></div>`;
  el.innerHTML = h;
  const r = $('#cvRetry'); if (r) r.onclick = () => { S.opc = S.opc && S.opc.total != null ? S.opc : null; CV.carregar(); };
  const c = $('#cvClr2'); if (c) c.onclick = () => { FILTROS.forEach(f => S.f[f.k] = []); salvar(); renderBar(); CV.carregar(); };
}
function renderVazioBase() {
  const b = $('#cvBody'); if (!b) return;
  b.innerHTML = `<div class="grid" style="margin-top:12px"><div class="card c12 soon" style="align-items:center;text-align:center;padding:40px">
    <div class="ic" style="margin:0 auto">${PJ.icon('funnel')}</div><h3 style="margin:8px 0 0;font:700 18px var(--f-display)">A base de conversão ainda não foi carregada</h3>
    <div class="d" style="color:var(--ink-2);max-width:560px">${PJ.can('conversao.importar') ? 'Clique em <b>Atualizar Base de Conversão</b> e envie a planilha “CONVERSÃO PEÇA JÁ” (aba BD_Conversão). A base de SLA e custo não é alterada.' : 'Peça a um administrador para carregar a planilha de conversão.'}</div>
    ${PJ.can('conversao.importar') ? `<button class="btn btn-primary" type="button" id="cvImp2" style="margin-top:10px">${PJ.icon('upload')}Atualizar Base de Conversão</button>` : ''}</div></div>`;
  const i = $('#cvImp2'); if (i) i.onclick = () => PJ.ConversaoImport.abrir();
}
const deltaHTML = (cur, prev, modo, rotulo) => {
  if (!isFinite(cur) || !isFinite(prev)) return '';
  let d, txt; if (modo === 'pp') { d = (cur - prev) * 100; txt = `${d > 0 ? '+' : ''}${F.dec(d, 1)} p.p.`; } else { if (!prev) return ''; d = (cur - prev) / prev; txt = `${d > 0 ? '+' : ''}${F.pct(d, 1)}`; }
  const flat = Math.abs(d) < (modo === 'pp' ? .05 : .001), cls = flat ? 'flat' : d > 0 ? 'up' : 'down';
  return `<span class="delta ${cls}">${PJ.icon(flat ? 'minus' : d > 0 ? 'arrowUp' : 'arrowDown')}${txt}</span> <span>${esc(rotulo)}</span>`;
};
function setK(id, v, fmt, sub) {
  const k = $('#cvk_' + id); if (!k) return; const el = k.querySelector('.v'); if (el.querySelector('.sk')) el.textContent = '';
  PJ.countUp(el, v, fmt); el.title = isFinite(v) ? fmt(v) : ''; k.querySelector('.s').innerHTML = sub || '';
}
function renderKpis() {
  const T = S.res.total, c = conv(T), cm = S.cmp;
  let cmpCur = null, cmpPrev = null, rot = '';
  if (cm && !cm.semDados) { cmpCur = cm.cur; cmpPrev = cm.prev; rot = `vs ${mesesTxt(cm.per.prev)}`; }
  const d = (f, modo) => cmpPrev ? deltaHTML(f(cmpCur), f(cmpPrev), modo, rot) : '';
  const semCmp = cm && cm.semDados ? `<span class="muted">sem ${esc(mesesTxt(cm.per.prev))} na base para comparar</span>` : '';
  let subConv = `${F.int(T.pj)} de ${F.int(T.aptas)} vendas aptas`;
  if (cm && !cm.semDados && cm.per.modo === 'ultimo') subConv = `Último mês (${F.mes(cm.per.cur[0])}): <b>${convTxt(cm.cur)}</b> ${d(conv, 'pp')}`;
  else if (cmpPrev) subConv = d(conv, 'pp') + ` <span class="muted">(${convTxt(cmpPrev)})</span>`;
  else if (semCmp) subConv += '<br>' + semCmp;
  setK('conv', c, v => F.pct(v, 2), subConv);
  const sel = cm && !cm.semDados && cm.per.modo === 'sel';
  setK('aptas', +T.aptas, F.int, sel ? d(g => +g.aptas, 'pct') : `${F.pct(+T.vendas ? T.aptas / T.vendas : NaN, 1)} do total de vendas`);
  setK('pj', +T.pj, F.int, sel ? d(g => +g.pj, 'pct') : 'vendas entregues pelo Peça Já');
  setK('fat', +T.fat_pj, F.brl, sel ? d(g => +g.fat_pj, 'pct') : 'Valor Total Negociado das vendas Peça Já');
  setK('total', +T.vendas, F.int, sel ? d(g => +g.vendas, 'pct') : 'todas as vendas da base filtrada');
  setK('nconv', Math.max(0, T.aptas - T.pj), F.int, `oportunidade: aptas que não foram pelo Peça Já`);
  const web = (S.res.por_tipo || []).find(g => g.key === 'VENDAS WEB');
  setK('web', web ? conv(web) : NaN, v => isFinite(v) ? F.pct(v, 2) : '–', web ? `${F.int(web.pj)} de ${F.int(web.aptas)} aptas · tipo “VENDAS WEB”` : 'sem vendas WEB nos filtros');
  setK('unid', +T.unidades, F.int, `${F.int(T.unidades_aptas)} com vendas aptas`);
}
const sortAptas = arr => arr.slice().sort((a, b) => (b.aptas - a.aptas) || (b.pj - a.pj) || String(a.key).localeCompare(String(b.key), 'pt-BR'));
function hbarsConv(el, rows, o = {}) {
  const T = S.res.total, ref = conv(T);
  const semApt = rows.filter(g => !(+g.aptas > 0)).length, itens = rows.filter(g => +g.aptas > 0);
  PJ.charts.hbars(el, itens.map(g => ({ key: g.key, label: o.label ? o.label(g.key) : g.key, sub: `${F.int(g.aptas)} aptas · ${F.int(g.pj)} PJ`,
      value: conv(g) || 0, display: `${convTxt(g)}`, color: o.color || COR.aptas, tip: tipConv(o.label ? o.label(g.key) : g.key, g) })),
    { max: Math.max(...itens.map(g => conv(g) || 0), ref || 0) * 1.05 || 1, ref: isFinite(ref) ? { value: ref, label: 'geral ' + F.pct(ref, 1) } : null, empty: o.empty || 'Sem vendas aptas nos filtros atuais.' });
  if (o.k && el) { el.dataset.fk = o.k; el.classList.add('cv-click'); }
  const d = el && document.getElementById(el.id + '_d');
  if (d && o.desc != null) d.innerHTML = o.desc + (semApt ? ` · ${F.int(semApt)} sem vendas aptas não exibidos` : '');
}
function comboConv(el, rows, o = {}) {
  const itens = o.todos ? rows : rows.filter(g => +g.aptas > 0 || +g.pj > 0);
  PJ.charts.combo(el, itens.map(g => ({ key: g.key, label: o.label ? o.label(g.key) : g.key, bars: [+g.aptas, +g.pj], line: isFinite(conv(g)) ? conv(g) : null, tip: tipConv(o.full ? o.full(g.key) : (o.label ? o.label(g.key) : g.key), g) })),
    { series: [{ name: 'Vendas aptas', color: COR.aptas }, { name: 'Vendas Peça Já', color: COR.pj }], lineName: 'Conversão', lineColor: COR.conv, onClick: o.k ? v => alterna(o.k, v) : null, aria: o.aria });
}
function renderFunil() {
  const el = $('#cvFun'), T = S.res.total; if (!el) return;
  const tot = +T.vendas || 0, ap = +T.aptas || 0, pj = +T.pj || 0;
  if (!tot) { el.innerHTML = PJ.emptyHTML('Sem vendas nos filtros atuais.', 'funnel'); return; }
  const st = Object.fromEntries((S.res.por_status || []).map(g => [g.key, g]));
  const linha = (lab, v, w, sub, cor) => `<div class="cv-fun-r"><div class="cv-fun-l"><span>${esc(lab)}</span><b class="num">${F.int(v)}</b></div><div class="cv-fun-t"><i style="--v:${Math.max(w, .004)};background:${cor}"></i></div><small>${sub}</small></div>`;
  el.innerHTML = `<div class="cv-fun">${linha('Total de vendas', tot, 1, 'base filtrada', 'var(--s-other)')}
    ${linha('Vendas aptas ao Peça Já', ap, ap / tot, `${F.pct(ap / tot, 1)} do total de vendas`, COR.aptas)}
    ${linha('Vendas Peça Já', pj, pj / tot, `<b style="color:var(--ink)">${convTxt(T)}</b> das vendas aptas (conversão)`, COR.pj)}</div>
    <div class="cv-st">${['VENDA FORA DOS CRITÉRIOS', 'VENDA DENTRO DOS CRITÉRIOS', 'VENDA PEÇA JÁ'].filter(k => st[k]).map(k => `<div><span>${esc(k.replace('VENDA ', '').toLowerCase().replace(/^./, c => c.toUpperCase()))}</span><b class="num">${F.int(st[k].vendas)}</b></div>`).join('')}</div>
    <div class="help">Status = coluna “Venda poderia ir no Same Day?”. Aptas = dentro dos critérios + Peça Já.</div>`;
  PJ.raf2(() => el.querySelectorAll('.cv-fun-t i').forEach(i => i.classList.add('on')));
}
function renderUnid() {
  const el = $('#cvUnid'); if (!el) return;
  let rows = (S.res.por_unidade || []).slice(); const o = S.unidOrd;
  if (o === 'aptas') rows = sortAptas(rows);
  else if (o === 'pj') rows.sort((a, b) => (b.pj - a.pj) || (b.aptas - a.aptas));
  else { rows = rows.filter(g => +g.aptas >= 10); rows.sort((a, b) => o === 'maior' ? (conv(b) - conv(a)) || (b.aptas - a.aptas) : (conv(a) - conv(b)) || (b.aptas - a.aptas)); }
  hbarsConv(el, rows.slice(0, 15), { k: 'unidade', desc: o === 'maior' || o === 'menor' ? 'Unidades com 10 ou mais vendas aptas, para não distorcer a ordem com volumes muito baixos. Clique para filtrar.' : 'As 15 primeiras conforme a ordenação. Clique para filtrar.' });
}
function renderTudo() {
  renderBanner(); renderKpis();
  const R = S.res;
  const meses = (R.por_mes || []).slice().sort((a, b) => a.key < b.key ? -1 : 1);
  comboConv($('#cvMes'), meses, { k: 'mes', label: F.mes, full: F.mesF, todos: true, aria: 'Conversão por mês' });
  const dm = $('#cvMes_d'); if (dm) dm.innerHTML = meses.length < 2 ? 'A base filtrada tem um único mês. Ao carregar novos meses, a evolução aparece aqui.' : 'Vendas aptas e Peça Já (barras) e % de conversão (linha). Clique num mês para filtrar.';
  renderFunil();
  const dias = (R.por_dia || []).slice().sort((a, b) => a.key < b.key ? -1 : 1);
  comboConv($('#cvDia'), dias, { label: k => k.slice(8, 10) + '/' + k.slice(5, 7), full: k => F.date(k), todos: true, aria: 'Conversão por dia' });
  hbarsConv($('#cvTipo'), sortAptas(R.por_tipo || []), { k: 'tipo', desc: 'Ordenado por volume de vendas aptas. Clique para filtrar.' });
  comboConv($('#cvSegCli'), sortAptas(R.por_seg_cliente || []), { k: 'seg_cliente', aria: 'Conversão por segmento do cliente' });
  comboConv($('#cvSegEq'), sortAptas(R.por_seg_equipe || []), { k: 'seg_equipe', aria: 'Conversão por segmento da equipe' });
  hbarsConv($('#cvLid'), sortAptas(R.por_lideranca || []), { label: lidLbl, color: 'var(--s4)', desc: 'Campo “Liderança - grafico” da planilha (líder e equipe)' });
  renderUnid();
  comboConv($('#cvRaio'), (R.por_raio || []).slice().sort((a, b) => String(a.key).localeCompare(String(b.key), 'pt-BR', { numeric: true })), { k: 'raio', aria: 'Conversão por raio' });
  hbarsConv($('#cvEq'), sortAptas(R.por_equipe || []).slice(0, 20), { k: 'equipe', color: 'var(--s2)', desc: 'Por volume de vendas aptas. Clique para filtrar.' });
  hbarsConv($('#cvVend'), R.top_vendedores || [], { k: 'vendedor', color: 'var(--s2)', desc: 'Por volume de vendas aptas. Clique para filtrar.' });
  hbarsConv($('#cvCli'), R.top_clientes || [], { color: 'var(--s3)', desc: 'Clientes finais com mais vendas aptas.' });
}

// =====================================================================
// TABELA DETALHADA (paginada no banco)
// =====================================================================
const dimsAtuais = () => S.detalhe ? [] : (S.dims.length ? S.dims : DIMS_PADRAO);
function renderDims() {
  const el = $('#cvDims'); if (!el) return;
  el.innerHTML = `<span class="label">Agrupar por</span>` + DIMS_ESCOLHA.map(d => `<button type="button" class="tgl ${!S.detalhe && S.dims.includes(d) ? 'on' : ''}" data-d="${d}" ${S.detalhe ? 'disabled' : ''} aria-pressed="${!S.detalhe && S.dims.includes(d)}">${esc(DIMS[d])}</button>`).join('')
    + `<label class="rep-check cv-det"><input type="checkbox" id="cvDet" ${S.detalhe ? 'checked' : ''}> Venda a venda</label>`;
  el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const d = b.dataset.d, i = S.dims.indexOf(d);
    if (i >= 0) { if (S.dims.length === 1) return PJ.toast('Mantenha pelo menos uma coluna de agrupamento.', 'info'); S.dims.splice(i, 1); } else S.dims.push(d);
    S.dims = DIMS_ESCOLHA.filter(x => S.dims.includes(x)); PJ.pref.set('conv.dims', S.dims);
    if (!S.dims.includes(S.tab.ordem) && !['vendas', 'aptas', 'pj', 'conv', 'fat'].includes(S.tab.ordem)) S.tab.ordem = 'aptas';
    S.tab.pag = 0; renderDims(); CV.carregarTabela(); });
  $('#cvDet').onchange = e => { S.detalhe = e.target.checked; PJ.pref.set('conv.detalhe', S.detalhe); S.tab.ordem = S.detalhe ? 'dia' : 'aptas'; S.tab.desc = true; S.tab.pag = 0; renderDims(); CV.carregarTabela(); };
}
const METR = [['vendas', 'Vendas', r => F.int(r.vendas)], ['aptas', 'Vendas aptas', r => F.int(r.aptas)], ['pj', 'Vendas Peça Já', r => F.int(r.pj)],
  ['conv', 'Conversão', r => r.conv == null ? '–' : `<b>${F.pct(+r.conv, 2)}</b>`], ['fat', 'Faturamento PJ', r => F.brl(r.fat)]];
const cellDim = (d, v) => d === 'mes' ? esc(F.mes(v)) : d === 'dia' ? esc(F.date(v)) : esc(v);
CV.carregarTabela = async () => {
  const my = ++S.tseq, el = $('#cvTab'); if (!el || !S.loaded) return;
  el.classList.add('cv-busy');
  try {
    const r = await PJ.rpc('conversao_tabela', { p_filtros: payload(), p_dims: dimsAtuais(), p_busca: S.tab.busca || null, p_ordem: S.tab.ordem, p_desc: S.tab.desc, p_limite: S.tab.por, p_offset: S.tab.pag * S.tab.por });
    if (my !== S.tseq) return;
    S.tab.total = +r.total || 0;
    const dims = r.colunas || dimsAtuais(), T = S.res.total;
    if (!r.linhas.length) { el.innerHTML = PJ.emptyHTML(S.tab.busca ? 'Nenhuma linha encontrada para a busca.' : 'Sem registros nos filtros atuais.', 'table'); renderPag(); return; }
    const th = (k, t, l) => `<th class="sortable ${S.tab.ordem === k ? 'sorted' + (S.tab.desc ? '' : ' asc') : ''} ${l ? 'l' : ''}" tabindex="0" data-k="${k}" scope="col">${esc(t)}</th>`;
    el.innerHTML = `<div class="tw stack"><table><thead><tr>${dims.map(d => th(d, DIMS[d] || d, true)).join('')}${METR.map(([k, t]) => th(k, t)).join('')}</tr></thead>
      <tbody>${r.linhas.map((x, i) => `<tr class="enter" style="--i:${Math.min(i, 20)}">${dims.map(d => `<td class="l" data-label="${esc(DIMS[d] || d)}">${cellDim(d, x[d])}</td>`).join('')}${METR.map(([k, t, f]) => `<td data-label="${esc(t)}">${f(x)}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><td class="l" colspan="${dims.length}" data-label="Total">Total dos filtros (${F.int(S.tab.total)} linhas)</td>${METR.map(([k, t, f]) => `<td data-label="${esc(t)}">${f({ vendas: T.vendas, aptas: T.aptas, pj: T.pj, conv: +T.aptas > 0 ? T.pj / T.aptas : null, fat: T.fat_pj })}</td>`).join('')}</tr></tfoot></table></div>`;
    el.querySelectorAll('th.sortable').forEach(h => { const go = () => { const k = h.dataset.k; if (S.tab.ordem === k) S.tab.desc = !S.tab.desc; else { S.tab.ordem = k; S.tab.desc = !DIMS[k]; } S.tab.pag = 0; CV.carregarTabela(); };
      h.onclick = go; h.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
    renderPag();
  } catch (e) { if (my !== S.tseq) return; console.error(e); el.innerHTML = `<div class="banner err">${PJ.icon('alert')}<div class="grow">${esc(PJ.friendly(e))}</div></div>`; }
  finally { if (my === S.tseq) el.classList.remove('cv-busy'); }
};
function renderPag() {
  const el = $('#cvPag'); if (!el) return; const t = S.tab, pags = Math.max(1, Math.ceil(t.total / t.por));
  if (t.total <= t.por) { el.innerHTML = t.total ? `<span class="muted">${F.int(t.total)} linha${t.total > 1 ? 's' : ''}</span>` : ''; return; }
  const ini = t.pag * t.por + 1, fim = Math.min(t.total, ini + t.por - 1);
  el.innerHTML = `<span class="muted">${F.int(ini)}–${F.int(fim)} de ${F.int(t.total)}</span><div class="grow"></div>
    <select class="select" id="cvPor" aria-label="Linhas por página">${[25, 50, 100].map(n => `<option value="${n}" ${n === t.por ? 'selected' : ''}>${n} por página</option>`).join('')}</select>
    <button class="btn btn-ghost btn-sm" type="button" data-p="-1" ${t.pag ? '' : 'disabled'} aria-label="Página anterior">${PJ.icon('chevL')}</button><span class="num">${t.pag + 1} / ${pags}</span>
    <button class="btn btn-ghost btn-sm" type="button" data-p="1" ${t.pag + 1 < pags ? '' : 'disabled'} aria-label="Próxima página">${PJ.icon('chevR')}</button>`;
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { t.pag = Math.max(0, Math.min(pags - 1, t.pag + +b.dataset.p)); CV.carregarTabela(); $('#cvTabCard').scrollIntoView({ block: 'start', behavior: PJ.reduced() ? 'auto' : 'smooth' }); });
  $('#cvPor').onchange = e => { t.por = +e.target.value; t.pag = 0; CV.carregarTabela(); };
}
// Exporta TODAS as linhas da tabela (com os filtros e o agrupamento atuais) em CSV para o Excel
CV.exportar = async btn => {
  if (!S.loaded) return;
  PJ.btnBusy(btn, true, 'Exportando…');
  try {
    const dims = dimsAtuais(), LOTE = 50000; let linhas = [], off = 0, total = Infinity, cols = null;
    while (off < total && off < 500000) { const r = await PJ.rpc('conversao_tabela', { p_filtros: payload(), p_dims: dims, p_busca: S.tab.busca || null, p_ordem: S.tab.ordem, p_desc: S.tab.desc, p_limite: LOTE, p_offset: off });
      total = +r.total; cols = r.colunas; linhas = linhas.concat(r.linhas); off += LOTE; if (!r.linhas.length) break; }
    const num = (v, d) => v == null || v === '' ? '' : (+v).toFixed(d).replace('.', ',');
    const q = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = cols.map(d => DIMS[d] || d).concat(['Vendas', 'Vendas aptas', 'Vendas Peça Já', 'Conversão (%)', 'Faturamento Peça Já (R$)']);
    const body = linhas.map(x => cols.map(d => q(d === 'dia' ? F.date(x[d]) : x[d])).concat([x.vendas, x.aptas, x.pj, x.conv == null ? '' : num(x.conv * 100, 2), num(x.fat, 2)]).join(';'));
    const T = S.res.total;
    const filtrosTxt = ativos().map(f => `${f.t}: ${S.f[f.k].map(v => lbl(f.k, v)).join(', ')}`).join(' | ') || 'sem filtros';
    const csv = '﻿' + [`Conversão de Vendas — PEÇA JÁ;Filtros: ${q(filtrosTxt)}`, head.join(';'), ...body,
      ['Total dos filtros'].concat(cols.slice(1).map(() => '')).concat([T.vendas, T.aptas, T.pj, +T.aptas ? num(T.pj / T.aptas * 100, 2) : '', num(T.fat_pj, 2)]).join(';')].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `conversao-peca-ja_${PJ.today()}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    PJ.toast(`Exportadas <b>${F.int(linhas.length)}</b> linhas.` + (linhas.length < total ? ' (limite de 500 mil linhas)' : ''), 'ok');
  } catch (e) { console.error(e); PJ.toast('Não consegui exportar. ' + PJ.friendly(e), 'err'); }
  finally { PJ.btnBusy(btn, false); }
};

// =====================================================================
// PÁGINA
// =====================================================================
PJ.pages.conversao = {
  title: 'Conversão',
  async mount(view) {
    view.innerHTML = html();
    S.loaded = false; S.res = null; S.opc = null; S.erro = null;
    const imp = $('#cvImp'); if (imp) imp.onclick = () => PJ.ConversaoImport.abrir();
    $('#cvUnidOrd').onchange = e => { S.unidOrd = e.target.value; if (S.loaded) renderUnid(); };
    const bus = $('#cvBusca'); bus.value = S.tab.busca; bus.oninput = PJ.debounce(() => { S.tab.busca = bus.value.trim(); S.tab.pag = 0; CV.carregarTabela(); }, 400);
    $('#cvExp').onclick = e => CV.exportar(e.currentTarget);
    // clique nas barras horizontais = filtro
    view.addEventListener('click', e => { const box = e.target.closest('.cv-click'); if (!box) return; const row = e.target.closest('.hb-row'); if (row) alterna(box.dataset.fk, row.dataset.k); });
    renderDims();
    CV.carregar();
  },
  update() {},
};
// Redesenha os gráficos quando a largura da tela muda (os gráficos usam a largura real do cartão)
let lastW = innerWidth;
window.addEventListener('resize', PJ.debounce(() => { if (Math.abs(innerWidth - lastW) < 40) return; lastW = innerWidth; if (S.loaded && S.res && $('#cvk_conv')) renderTudo(); }, 300));
// Recarrega tudo (usado após importar uma nova base)
CV.recarregar = () => { S.opc = null; if ($('#cvBody')) { if (!$('#cvk_conv')) { const v = $('#view'); PJ.pages.conversao.mount(v); return; } CV.carregar(); } };
})();
