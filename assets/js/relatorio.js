/* =====================================================================
   PEÇA JÁ · relatorio.js — Relatório PDF das Ações PEÇA JÁ
   ---------------------------------------------------------------------
   Fluxo: Ações PEÇA JÁ → [Gerar Relatório] → filtros → prévia → [Gerar PDF]
   Dados: RPC public.relatorio_acoes (Supabase). Filtros aplicados NO BANCO;
          RLS (acoes.ver) e a permissão acoes.relatorio são validados lá.
   PDF:   gerado no próprio navegador com PJ.PDF (assets/js/pdf.js).
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, $ = PJ.$, esc = PJ.esc, F = PJ.fmt;
const ST = { em_andamento: 'Em andamento', em_validacao: 'Em validação', planejada: 'Planejada', pausada: 'Pausada', concluida: 'Concluída' };
const ST_ORDER = ['concluida', 'em_andamento', 'em_validacao', 'planejada', 'pausada'];
const PRI = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const STP = { em_andamento: 'em andamento', em_validacao: 'em validação', planejada: 'planejadas', pausada: 'pausadas', concluida: 'concluídas' };
const stCount = (k, v) => `${F.int(v)} ${+v === 1 ? ST[k].toLowerCase() : STP[k]}`;
const PRI_ORDER = ['critica', 'alta', 'media', 'baixa'];
// Cores do PDF (identidade PEÇA JÁ, ajustadas para papel)
const C = { navy: '#050A34', blue: '#0A64FF', sky: '#73C6FF', violet: '#2021D4', ink: '#0B1446', ink2: '#3B4770', muted: '#6B7699', line: '#DCE3F0', soft: '#F3F6FC', soft2: '#E8EEF9', white: '#FFFFFF', bad: '#C62F3A', good: '#13967E' };
const ST_C = { planejada: '#7F8CBA', em_andamento: '#0A64FF', em_validacao: '#9461EA', pausada: '#E39A1E', concluida: '#13967E' };
const PRI_C = { baixa: '#9AA5C4', media: '#2F8FD8', alta: '#E39A1E', critica: '#C62F3A' };
const tint = (hex, k) => { const h = hex.replace('#', ''); return '#' + [0, 2, 4].map(i => Math.round(parseInt(h.substr(i, 2), 16) + (255 - parseInt(h.substr(i, 2), 16)) * k).toString(16).padStart(2, '0')).join(''); };
const R = PJ.Relatorio = {};

// ---------- Dados (Supabase) ----------
R.params = f => ({ p_data_ini: f.ini || null, p_data_fim: f.fim || null, p_status: f.status.length ? f.status : null,
  p_responsavel: f.resp || null, p_prioridade: f.pri || null, p_area: f.area || null, p_historico: !!f.hist });
R.fetch = f => PJ.rpc('relatorio_acoes', R.params(f));

// ---------- Janela de configuração ----------
R.open = async () => {
  if (!PJ.can('acoes.relatorio')) return PJ.toast('Seu perfil não tem permissão para gerar o relatório de ações.', 'err');
  const f = { ini: '', fim: '', status: [], resp: '', pri: '', area: '', hist: true };
  let opc = { responsaveis: [], areas: [] };
  try { opc = await PJ.rpc('relatorio_acoes_opcoes') || opc; } catch (e) { return PJ.toast(PJ.friendly(e), 'err'); }
  const today = PJ.today(), y = today.slice(0, 4), m = today.slice(5, 7);
  const firstOf = (yy, mm) => { while (mm < 1) { mm += 12; yy--; } return `${yy}-${String(mm).padStart(2, '0')}-01`; };
  const lastOf = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  const PRE = { all: ['', ''], mes: [firstOf(+y, +m), lastOf(+y, +m)], tri: [firstOf(+y, +m - 2), lastOf(+y, +m)], ano: [`${y}-01-01`, `${y}-12-31`] };
  const opts = (list, all) => `<option value="">${all}</option>` + list.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  const body = PJ.h(`<div class="rep-form">
    <div class="field"><span class="label">Período</span>
      <div class="presets" id="rpPre"><button type="button" data-p="all" class="on">Todas as datas</button><button type="button" data-p="mes">Este mês</button><button type="button" data-p="tri">Últimos 3 meses</button><button type="button" data-p="ano">Este ano</button></div>
      <div class="grid-form" style="margin-top:8px"><div class="field"><label for="rpIni">Data inicial</label><input class="input" type="date" id="rpIni"></div><div class="field"><label for="rpFim">Data final</label><input class="input" type="date" id="rpFim"></div></div>
      <span class="help">Entram as ações cujo período (início → prazo) cruza as datas escolhidas.</span></div>
    <div class="field"><span class="label">Status <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">(nenhum marcado = todos)</span></span>
      <div class="rep-chips" id="rpSt">${ST_ORDER.map(k => `<button type="button" class="rep-chip" data-s="${k}" aria-pressed="false"><i style="background:${ST_C[k]}"></i>${ST[k]}</button>`).join('')}</div></div>
    <div class="grid-form">
      <div class="field"><label for="rpResp">Responsável</label><select class="select" id="rpResp">${opts(opc.responsaveis || [], 'Todos os responsáveis')}</select></div>
      <div class="field"><label for="rpPri">Prioridade</label><select class="select" id="rpPri"><option value="">Todas as prioridades</option>${PRI_ORDER.map(k => `<option value="${k}">${PRI[k]}</option>`).join('')}</select></div>
      <div class="field full"><label for="rpArea">Área</label><select class="select" id="rpArea">${opts(opc.areas || [], 'Todas as áreas')}</select></div>
    </div>
    <label class="rep-check"><input type="checkbox" id="rpHist" checked> Incluir o histórico (linha do tempo) de cada ação</label>
    <div class="rep-preview" id="rpPrev" aria-live="polite"><div class="sk" style="height:58px"></div></div>
    <div class="form-msg err" id="rpErr" hidden></div></div>`);
  let seq = 0, last = null;
  const prev = body.querySelector('#rpPrev');
  const preview = PJ.debounce(async () => {
    const my = ++seq; prev.classList.add('busy');
    try {
      const d = await R.fetch(Object.assign({}, f, { hist: false })); if (my !== seq) return; last = d;
      const s = d.resumo || {}, tot = +s.total || 0, gen = $('#rpGo');
      prev.innerHTML = tot ? `<div class="rep-prev-n"><b class="num">${F.int(tot)}</b><span>${tot === 1 ? 'ação será exportada' : 'ações serão exportadas'}</span></div>
        <div class="rep-prev-st">${ST_ORDER.filter(k => +s[k]).map(k => `<span><i style="background:${ST_C[k]}"></i>${stCount(k, s[k])}</span>`).join('')}</div>
        <div class="help">${F.pct(tot ? s.concluida / tot : 0, 0)} de conclusão · andamento médio ${F.dec(+s.progresso_medio || 0, 0)}%${+s.atrasadas ? ` · <b style="color:var(--bad)">${F.int(s.atrasadas)} com prazo vencido</b>` : ''}</div>`
        : `<div class="rep-prev-n"><b class="num">0</b><span>Nenhuma ação encontrada com esses filtros.</span></div>`;
      if (gen) gen.disabled = !tot;
      body.querySelector('#rpErr').hidden = true;
    } catch (e) { if (my !== seq) return; const er = body.querySelector('#rpErr'); er.hidden = false; er.innerHTML = PJ.icon('alert') + esc(PJ.friendly(e)); prev.innerHTML = ''; const gen = $('#rpGo'); if (gen) gen.disabled = true; }
    finally { if (my === seq) prev.classList.remove('busy'); }
  }, 250);
  const setPre = p => { const r = PRE[p] || ['', '']; f.ini = r[0]; f.fim = r[1]; body.querySelector('#rpIni').value = r[0]; body.querySelector('#rpFim').value = r[1];
    body.querySelectorAll('#rpPre button').forEach(b => b.classList.toggle('on', b.dataset.p === p)); preview(); };
  body.querySelectorAll('#rpPre button').forEach(b => b.onclick = () => setPre(b.dataset.p));
  const onDate = () => { f.ini = body.querySelector('#rpIni').value; f.fim = body.querySelector('#rpFim').value; body.querySelectorAll('#rpPre button').forEach(b => b.classList.toggle('on', b.dataset.p === 'all' && !f.ini && !f.fim)); preview(); };
  body.querySelector('#rpIni').onchange = onDate; body.querySelector('#rpFim').onchange = onDate;
  body.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const k = b.dataset.s, on = !f.status.includes(k);
    f.status = on ? [...f.status, k] : f.status.filter(x => x !== k); b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); preview(); });
  body.querySelector('#rpResp').onchange = e => { f.resp = e.target.value; preview(); };
  body.querySelector('#rpPri').onchange = e => { f.pri = e.target.value; preview(); };
  body.querySelector('#rpArea').onchange = e => { f.area = e.target.value; preview(); };
  body.querySelector('#rpHist').onchange = e => { f.hist = e.target.checked; };
  const mdl = PJ.modal({ title: 'Gerar relatório de ações', wide: true, body, actions: [
    { label: 'Cancelar' },
    { label: 'Gerar PDF', cls: 'btn-primary', icon: 'fileText', onClick: async ({ close, btn }) => {
      if (f.ini && f.fim && f.fim < f.ini) { const er = body.querySelector('#rpErr'); er.hidden = false; er.innerHTML = PJ.icon('alert') + 'A data final é anterior à data inicial.'; return; }
      PJ.btnBusy(btn, true, 'Gerando relatório…');
      try {
        const data = await R.fetch(f);                 // dados frescos do Supabase, com os filtros exatos
        if (!(data.acoes || []).length) throw { code: '22023', message: 'Nenhuma ação encontrada com esses filtros.' };
        await new Promise(r => setTimeout(r, 30));     // deixa o "carregando" aparecer
        const doc = R.build(data, f);
        await R.download(doc, R.fileName(data.gerado_em));
        close(); PJ.toast('Relatório gerado com sucesso.', 'ok');
      } catch (e) { console.error('Erro ao gerar relatório:', e); PJ.btnBusy(btn, false); const er = body.querySelector('#rpErr'); er.hidden = false; er.innerHTML = PJ.icon('alert') + esc(e && e.code === '22023' ? e.message : PJ.friendly(e)); }
    } }] });
  mdl.el.querySelector('.modal-f .btn-primary').id = 'rpGo';
  preview();
};

R.fileName = iso => { const d = new Date(iso || Date.now());
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
  return `PECA-JA_Relatorio-de-Acoes_${p.year}-${p.month}-${p.day}_${p.hour}${p.minute}.pdf`; };
R.download = async (doc, name) => {
  const blob = doc.blob();
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // App instalado no iPhone: abre a folha de compartilhamento (salvar em Arquivos, enviar, imprimir)
  if (ios && PJ.PWA && PJ.PWA.isStandalone() && navigator.canShare) {
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'PEÇA JÁ — Relatório de Ações' }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// =====================================================================
// LAYOUT DO PDF
// =====================================================================
R.build = (data, f) => {
  const acoes = data.acoes || [], evs = data.eventos || [], s = data.resumo || {};
  const doc = new PJ.PDF({ title: 'PEÇA JÁ — Relatório de Ações', author: (PJ.me && PJ.me.nome) || 'PEÇA JÁ', subject: 'Relatório de Ações PEÇA JÁ' });
  const W = doc.W, H = doc.H, M = 40, CW = W - 2 * M, BOTTOM = H - 58;
  const gen = new Date(data.gerado_em || Date.now());
  const genTxt = gen.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const periodo = f.ini || f.fim ? `${f.ini ? F.date(f.ini) : 'início'} a ${f.fim ? F.date(f.fim) : 'hoje em diante'}` : 'Todas as datas';
  const hoje = PJ.today();
  let y = 0, section = '';

  const logo = (x, yy, sz) => {
    doc.rect(x, yy, sz, sz, { fill: C.blue, r: sz * .24 });
    const k = sz / 64, P = (px, py) => [x + px * k, yy + py * k];
    doc.line(...P(9, 27), ...P(18, 27), { color: C.sky, lw: 5 * k, cap: true }); doc.line(...P(9, 38), ...P(18, 38), { color: C.sky, lw: 5 * k, cap: true });
    doc.polygon([P(38, 13), P(55, 22), P(38, 31), P(21, 22)], { fill: '#FFFFFF' });
    doc.polygon([P(21, 22), P(38, 31), P(38, 52), P(21, 43)], { fill: '#D6E7FF' });
    doc.polygon([P(55, 22), P(38, 31), P(38, 52), P(55, 43)], { fill: '#A9CBFF' });
  };
  const header = first => {
    if (first) {
      doc.rect(0, 0, W, 112, { fill: C.navy });
      doc.gradient(0, 108, W, 4, C.violet, C.blue);
      logo(M, 30, 50);
      doc.text('PEÇA JÁ — Relatório de Ações', M + 64, 52, { size: 19, bold: true, color: C.white });
      doc.text('Centro de Evolução · Autoglass', M + 64, 70, { size: 10, color: C.sky });
      const rx = W - M;
      doc.text('GERADO EM', rx, 40, { size: 7.5, bold: true, color: '#8FA5D6', align: 'right' });
      doc.text(genTxt, rx, 54, { size: 10, bold: true, color: C.white, align: 'right' });
      doc.text('PERÍODO ANALISADO', rx, 72, { size: 7.5, bold: true, color: '#8FA5D6', align: 'right' });
      doc.text(periodo, rx, 86, { size: 10, bold: true, color: C.white, align: 'right' });
      y = 136;
    } else {
      doc.rect(0, 0, W, 40, { fill: C.navy }); doc.gradient(0, 38, W, 2, C.violet, C.blue);
      logo(M, 9, 22);
      doc.text('PEÇA JÁ — Relatório de Ações', M + 30, 24.5, { size: 10, bold: true, color: C.white });
      if (section) doc.text(section, W - M, 24.5, { size: 8.5, color: C.sky, align: 'right' });
      y = 62;
    }
  };
  const newPage = () => { doc.addPage(); header(false); };
  const ensure = h => { if (y + h > BOTTOM) { newPage(); return true; } return false; };
  const sectionTitle = (t, sub) => {
    ensure(sub ? 44 : 34);
    doc.rect(M, y - 1, 4, 16, { fill: C.blue, r: 1.5 });
    doc.text(t, M + 12, y + 11, { size: 13, bold: true, color: C.ink });
    if (sub) doc.text(sub, M + 12, y + 26, { size: 8.5, color: C.muted });
    y += sub ? 40 : 28;
  };
  const pill = (txt, x, yy, color, outline) => {
    const w = doc.width(txt, 7.5, true) + 14;
    if (outline) doc.rect(x, yy, w, 14, { stroke: color, lw: .8, r: 7 }); else doc.rect(x, yy, w, 14, { fill: color, r: 7 });
    doc.text(txt, x + 7, yy + 9.8, { size: 7.5, bold: true, color: outline ? color : C.white });
    return w;
  };
  const bar = (x, yy, w, h, pct, color) => { doc.rect(x, yy, w, h, { fill: C.soft2, r: h / 2 }); if (pct > 0) doc.rect(x, yy, Math.max(h, w * Math.min(1, pct)), h, { fill: color, r: h / 2 }); };

  // ---------------- Página 1: resumo gerencial ----------------
  doc.addPage(); header(true);
  // filtros aplicados
  const fl = [['Período', periodo], ['Status', f.status.length ? f.status.map(k => ST[k]).join(', ') : 'Todos'], ['Responsável', f.resp || 'Todos'],
    ['Prioridade', f.pri ? PRI[f.pri] : 'Todas'], ['Área', f.area || 'Todas']];
  // distribui os filtros em linhas que cabem na largura
  const items = fl.map(([k, v]) => { const t = `${k}: `, vv = doc.fit(v, 8.5, true, CW - 40 - doc.width(t, 8.5)); return { t, vv, w: doc.width(t, 8.5) + doc.width(vv, 8.5, true) }; });
  const rows = [[]]; let rw = 0;
  items.forEach(it => { if (rw && rw + it.w > CW - 24) { rows.push([]); rw = 0; } rows[rows.length - 1].push(it); rw += it.w + 16; });
  const boxH = 24 + rows.length * 14;
  doc.rect(M, y, CW, boxH, { fill: C.soft, r: 8 });
  doc.text('FILTROS APLICADOS', M + 12, y + 14, { size: 7, bold: true, color: C.muted });
  rows.forEach((r, i) => { let fx = M + 12; const fy = y + 29 + i * 14;
    r.forEach(it => { doc.text(it.t, fx, fy, { size: 8.5, color: C.muted }); doc.text(it.vv, fx + doc.width(it.t, 8.5), fy, { size: 8.5, bold: true, color: C.ink }); fx += it.w + 16; }); });
  y += boxH + 18;

  // resumo
  const tot = +s.total || 0, conc = +s.concluida || 0, pctC = tot ? conc / tot : 0;
  sectionTitle('Resumo das ações');
  const filtrado = !!(f.ini || f.fim || f.status.length || f.resp || f.pri || f.area);
  doc.text(`${F.int(tot)} ${tot === 1 ? 'ação' : 'ações'} ${filtrado ? 'neste relatório' : (tot === 1 ? 'cadastrada' : 'cadastradas')}`, M, y + 16, { size: 22, bold: true, color: C.ink });
  const resumoTxt = ST_ORDER.filter(k => +s[k]).map(k => stCount(k, s[k])).join('  ·  ');
  doc.text(resumoTxt, M, y + 34, { size: 9.5, color: C.ink2 });
  y += 50;
  const cards = [['Total de ações', F.int(tot), C.navy], ['Concluídas', F.int(conc), ST_C.concluida], ['Em andamento', F.int(s.em_andamento || 0), ST_C.em_andamento],
    ['Planejadas', F.int(s.planejada || 0), ST_C.planejada], ['Pausadas', F.int(s.pausada || 0), ST_C.pausada], ['% de conclusão', F.pct(pctC, 0), C.violet]];
  const cw = (CW - 2 * 10) / 3, ch = 58;
  cards.forEach(([l, v, col], i) => { const cx = M + (i % 3) * (cw + 10), cy = y + Math.floor(i / 3) * (ch + 10);
    doc.rect(cx, cy, cw, ch, { fill: C.white, stroke: C.line, lw: .7, r: 8 }); doc.rect(cx, cy + 10, 3.5, ch - 20, { fill: col, r: 1.5 });
    doc.text(l.toUpperCase(), cx + 14, cy + 19, { size: 7.5, bold: true, color: C.muted }); doc.text(v, cx + 14, cy + 44, { size: 22, bold: true, color: C.ink }); });
  y += 2 * ch + 10 + 8;
  // barra geral de conclusão + extras
  doc.text('Conclusão geral', M, y + 10, { size: 8.5, bold: true, color: C.ink2 });
  bar(M + 82, y + 3, CW - 82 - 46, 9, pctC, ST_C.concluida);
  doc.text(F.pct(pctC, 0), W - M, y + 11, { size: 9, bold: true, color: C.ink, align: 'right' });
  y += 22;
  const extra = [`Em validação: ${F.int(s.em_validacao || 0)}`, `Andamento médio: ${F.dec(+s.progresso_medio || 0, 0)}%`, `Com prazo vencido: ${F.int(s.atrasadas || 0)}`];
  doc.text(extra.join('   ·   '), M, y + 8, { size: 8.5, color: +s.atrasadas ? C.ink2 : C.muted });
  y += 26;

  // distribuições (status e prioridade)
  const distCard = (x, title, keys, labels, colors, counts) => {
    const h = 26 + keys.length * 22 + 6; doc.rect(x, y, (CW - 12) / 2, h, { fill: C.white, stroke: C.line, lw: .7, r: 8 });
    doc.text(title, x + 12, y + 18, { size: 10, bold: true, color: C.ink });
    const mx = Math.max(1, ...keys.map(k => counts[k] || 0)), bw = (CW - 12) / 2 - 12 - 78 - 52;
    keys.forEach((k, i) => { const yy = y + 34 + i * 22, v = counts[k] || 0;
      doc.text(labels[k], x + 12, yy + 7.5, { size: 8.5, color: C.ink2 });
      bar(x + 90, yy, bw, 10, v / mx, colors[k]);
      doc.text(`${F.int(v)}  (${F.pct(tot ? v / tot : 0, 0)})`, x + (CW - 12) / 2 - 12, yy + 8, { size: 8.5, bold: true, color: C.ink, align: 'right' }); });
    return h;
  };
  const priCount = PRI_ORDER.reduce((o, k) => (o[k] = acoes.filter(a => a.prioridade === k).length, o), {});
  sectionTitle('Distribuição', 'Quantidade de ações por status e por prioridade.');
  const h1 = distCard(M, 'Por status', ST_ORDER, ST, ST_C, s);
  distCard(M + (CW - 12) / 2 + 12, 'Por prioridade', PRI_ORDER, PRI, PRI_C, priCount);
  y += h1 + 22;

  // evolução (linha do tempo: início → prazo, parte preenchida = andamento)
  const dated = acoes.filter(a => a.data_inicio || a.prazo).map(a => ({ ...a, ini: a.data_inicio || a.prazo, fim: a.prazo || a.data_inicio }))
    .sort((a, b) => a.ini.localeCompare(b.ini) || a.fim.localeCompare(b.fim));
  if (dated.length) {
    section = 'Evolução das ações';
    // começa em página nova se não couber um bloco legível (título + eixo + até 8 linhas)
    if (y + 40 + 20 + Math.min(dated.length, 8) * 18 > BOTTOM) newPage();
    sectionTitle('Evolução das ações', 'Barra = início → prazo. Parte cheia = andamento. Linha azul = hoje.');
    const t = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    let lo = Math.min(...dated.map(a => t(a.ini)), t(hoje)), hi = Math.max(...dated.map(a => t(a.fim)), t(hoje));
    const lo0 = new Date(lo), hi0 = new Date(hi); lo = Date.UTC(lo0.getUTCFullYear(), lo0.getUTCMonth(), 1); hi = Date.UTC(hi0.getUTCFullYear(), hi0.getUTCMonth() + 1, 1);
    const LX = M + 150, GW = CW - 150 - 40, X = v => LX + (v - lo) / (hi - lo) * GW, RH = 18;
    const axis = () => {
      ensure(20 + RH * 2);
      for (let d = new Date(lo); d.getTime() <= hi; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
        const x = X(d.getTime()); doc.line(x, y + 12, x, y + 14, { color: C.muted, lw: .6 });
        const months = (hi - lo) / (30 * 864e5), step = months > 14 ? 3 : months > 8 ? 2 : 1;
        if (d.getUTCMonth() % step === 0 && x < LX + GW - 10) doc.text(`${F.MES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, x + 2, y + 9, { size: 7, color: C.muted });
      }
      doc.line(LX, y + 14, LX + GW, y + 14, { color: C.line, lw: .8 }); y += 20;
    };
    axis();
    let top = y;
    const todayLine = (a, b) => { const x = X(t(hoje)); doc.line(x, a, x, b, { color: C.blue, lw: 1, dash: [2, 2] }); };
    dated.forEach((a, i) => {
      if (y + RH > BOTTOM) { todayLine(top, y); newPage(); axis(); top = y; }
      if (i % 2 === 0) doc.rect(M, y, CW, RH, { fill: '#F7F9FD' });
      doc.text(doc.fit(a.titulo, 8, false, 142), M + 4, y + 12, { size: 8, color: C.ink });
      const x1 = X(t(a.ini)), x2 = Math.max(X(t(a.fim)), x1 + 4), col = ST_C[a.status] || C.blue;
      doc.rect(x1, y + 4, x2 - x1, 10, { fill: tint(col, .72), r: 3 });
      if (a.progresso > 0) doc.rect(x1, y + 4, Math.max(4, (x2 - x1) * a.progresso / 100), 10, { fill: col, r: 3 });
      doc.text(`${a.progresso}%`, LX + GW + 36, y + 12, { size: 8, bold: true, color: C.ink, align: 'right' });
      y += RH;
    });
    todayLine(top, y);
    // legenda
    y += 8; let lx = M;
    ST_ORDER.forEach(k => { doc.rect(lx, y, 8, 8, { fill: ST_C[k], r: 2 }); doc.text(ST[k], lx + 12, y + 7, { size: 7.5, color: C.ink2 }); lx += doc.width(ST[k], 7.5) + 26; });
    doc.line(lx + 2, y + 4, lx + 14, y + 4, { color: C.blue, lw: 1, dash: [2, 2] }); doc.text('Hoje', lx + 18, y + 7, { size: 7.5, color: C.ink2 });
    y += 24;
  }

  // ---------------- Tabela geral ----------------
  section = 'Visão geral das ações';
  sectionTitle('Visão geral das ações', `${F.int(acoes.length)} ${acoes.length === 1 ? 'ação' : 'ações'}, ordenadas por prioridade e prazo.`);
  const cols = [['Ação', 168], ['Responsável', 82], ['Status', 74], ['Prioridade', 56], ['Prazo', 54], ['Andamento', 81]];
  const thead = () => { ensure(22 + 20); doc.rect(M, y, CW, 20, { fill: C.navy, r: 4 }); let x = M + 8;
    cols.forEach(([t, w]) => { doc.text(t.toUpperCase(), x, y + 13, { size: 7, bold: true, color: C.white }); x += w; }); y += 20; };
  thead();
  acoes.forEach((a, i) => {
    if (y + 20 > BOTTOM) { newPage(); thead(); }
    if (i % 2) doc.rect(M, y, CW, 20, { fill: '#F7F9FD' });
    let x = M + 8; const ty = y + 13; const late = a.prazo && a.status !== 'concluida' && a.prazo < hoje;
    doc.text(doc.fit(a.titulo, 8.5, true, cols[0][1] - 8), x, ty, { size: 8.5, bold: true, color: C.ink }); x += cols[0][1];
    doc.text(doc.fit(a.responsavel || '–', 8, false, cols[1][1] - 6), x, ty, { size: 8, color: C.ink2 }); x += cols[1][1];
    doc.circle(x + 3, ty - 3, 3, { fill: ST_C[a.status] }); doc.text(ST[a.status] || a.status, x + 10, ty, { size: 8, color: C.ink2 }); x += cols[2][1];
    doc.text(PRI[a.prioridade] || a.prioridade, x, ty, { size: 8, bold: a.prioridade === 'critica', color: a.prioridade === 'critica' ? C.bad : C.ink2 }); x += cols[3][1];
    doc.text(a.prazo ? F.date(a.prazo) : '–', x, ty, { size: 8, bold: late, color: late ? C.bad : C.ink2 }); x += cols[4][1];
    bar(x, y + 6.5, 44, 7, a.progresso / 100, ST_C[a.status] || C.blue); doc.text(`${a.progresso}%`, x + 72, ty, { size: 8, bold: true, color: C.ink, align: 'right' });
    doc.line(M, y + 20, M + CW, y + 20, { color: '#EEF2F8', lw: .5 });
    y += 20;
  });
  y += 16;

  // ---------------- Detalhe por ação ----------------
  section = 'Ações em detalhe';
  newPage();
  sectionTitle('Ações em detalhe', 'Ficha completa de cada ação' + (f.hist ? ', com o histórico de evolução registrado no sistema.' : '.'));
  const byAcao = evs.reduce((o, e) => ((o[e.acao_id] = o[e.acao_id] || []).push(e), o), {});
  const field = (label, value, x, w) => { doc.text(label.toUpperCase(), x, y, { size: 7, bold: true, color: C.muted }); return doc.para(value || '–', x, y + 12, w, { size: 9, color: C.ink, lh: 12.5 }); };
  acoes.forEach((a, idx) => {
    const col = ST_C[a.status] || C.blue, late = a.prazo && a.status !== 'concluida' && a.prazo < hoje;
    const titleLines = doc.wrap(a.titulo, 13, true, CW - 24);
    const descH = a.descricao ? doc.wrap(a.descricao, 9, false, CW - 24).length * 12.5 + 18 : 0;
    const esp = doc.wrap(a.resultado_esperado || '–', 9, false, CW / 2 - 24).length, obt = doc.wrap(a.resultado_obtido || '–', 9, false, CW / 2 - 24).length;
    const headH = 18 + titleLines.length * 16 + 22 + 40 + 30 + descH + Math.max(esp, obt) * 12.5 + 26;
    ensure(Math.min(headH, BOTTOM - 62));
    const y0 = y;
    // faixa de título
    doc.rect(M, y, CW, 4, { fill: col, r: 2 }); y += 18;
    titleLines.forEach((l, i) => doc.text(l, M + 12, y + i * 16, { size: 13, bold: true, color: C.ink })); y += (titleLines.length - 1) * 16 + 10;
    let px = M + 12; px += pill(ST[a.status] || a.status, px, y, col) + 6; px += pill('Prioridade ' + (PRI[a.prioridade] || a.prioridade), px, y, PRI_C[a.prioridade] || C.muted, true) + 6;
    if (late) pill('Prazo vencido', px, y, C.bad);
    y += 28;
    // dados principais (4 colunas)
    const q = (CW - 24) / 4; const fy0 = y;
    [['Responsável', a.responsavel], ['Área', a.area], ['Data de início', a.data_inicio ? F.date(a.data_inicio) : '–'], ['Prazo', a.prazo ? F.date(a.prazo) + (late ? ' (vencido)' : '') : '–']]
      .forEach(([l, v], i) => { y = fy0; field(l, v, M + 12 + i * q, q - 10); });
    y = fy0 + 36;
    // andamento
    doc.text('ANDAMENTO', M + 12, y, { size: 7, bold: true, color: C.muted });
    bar(M + 12, y + 6, CW - 24 - 40, 9, a.progresso / 100, col); doc.text(`${a.progresso}%`, M + CW - 12, y + 14, { size: 10, bold: true, color: C.ink, align: 'right' });
    y += 30;
    if (a.descricao) { y = field('Descrição', a.descricao, M + 12, CW - 24) + 8; }
    const ry = y; const e1 = field('Resultado esperado', a.resultado_esperado, M + 12, CW / 2 - 24); y = ry;
    const e2 = field('Resultado obtido', a.resultado_obtido, M + CW / 2 + 6, CW / 2 - 24); y = Math.max(e1, e2) + 6;
    // borda lateral do bloco
    doc.rect(M, y0 + 4, 1.2, y - y0 - 4, { fill: tint(col, .55) });
    // histórico (linha do tempo visual)
    const hist = byAcao[a.id] || [];
    if (f.hist && hist.length) {
      ensure(30);
      doc.text('HISTÓRICO DA AÇÃO', M + 12, y + 8, { size: 7, bold: true, color: C.muted }); y += 18;
      hist.forEach((e, i) => {
        const txt = e.descricao + (e.valor_para ? `: ${e.valor_de ? e.valor_de + ' → ' : ''}${e.valor_para}` : '');
        const lines = doc.wrap(txt, 8.5, false, CW - 140);
        const h = Math.max(18, lines.length * 11.5 + 6);
        if (y + h > BOTTOM) { newPage(); doc.text(`HISTÓRICO — ${doc.fit(a.titulo, 7, true, 360).toUpperCase()} (continuação)`, M + 12, y + 8, { size: 7, bold: true, color: C.muted }); y += 18; }
        const dt = new Date(e.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const ec = { criada: C.sky, status: '#9461EA', progresso: C.blue, prazo: '#E39A1E', resultado: C.good }[e.tipo] || C.blue;
        if (i < hist.length - 1) doc.line(M + 22, y + 6, M + 22, y + h + 4, { color: '#C9D6EE', lw: 1.2 });
        doc.circle(M + 22, y + 5, 4, { fill: C.white, stroke: ec, lw: 1.6 });
        doc.text(dt, M + 34, y + 8, { size: 8, bold: true, color: C.ink2 });
        lines.forEach((l, j) => doc.text(l, M + 100, y + 8 + j * 11.5, { size: 8.5, color: C.ink }));
        y += h;
      });
    } else if (f.hist) { doc.text('Sem histórico registrado para esta ação.', M + 12, y + 8, { size: 8, color: C.muted }); y += 16; }
    y += 14;
    if (idx < acoes.length - 1) { doc.line(M, y, M + CW, y, { color: C.line, lw: .7 }); y += 18; }
  });

  // ---------------- Rodapé + numeração ----------------
  const total = doc.pageCount;
  for (let i = 0; i < total; i++) {
    doc.setPage(i);
    doc.line(M, H - 40, W - M, H - 40, { color: C.line, lw: .7 });
    doc.text(`PEÇA JÁ — Relatório de Ações  ·  Gerado em ${genTxt}`, M, H - 26, { size: 7.5, color: C.muted });
    doc.text(`Página ${i + 1} de ${total}`, W - M, H - 26, { size: 7.5, bold: true, color: C.ink2, align: 'right' });
  }
  return doc;
};
})();
