/* =====================================================================
   PEÇA JÁ · acoes.js — Centro de Evolução (Ações PEÇA JÁ)
   Tabelas: acoes (CRUD com RLS acoes.ver / acoes.editar)
            acoes_eventos (histórico gerado por trigger → timeline)
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, $ = PJ.$, esc = PJ.esc, F = PJ.fmt;
const ST = { em_andamento: 'Em andamento', em_validacao: 'Em validação', planejada: 'Planejada', pausada: 'Pausada', concluida: 'Concluída' };
const PRI = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const PRI_ORD = { critica: 0, alta: 1, media: 2, baixa: 3 };
const COLS = 'id,titulo,descricao,responsavel,area,data_inicio,prazo,status,prioridade,resultado_esperado,resultado_obtido,progresso,created_at,updated_at';
const A = PJ.Acoes = { list: [], events: [], tab: 'todas', mode: 'cards', pri: '', q: '' };

A.fetch = async () => {
  const [l, e] = await Promise.all([
    PJ.q(PJ.sb.from('acoes').select(COLS).order('prazo', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }), 'listar ações'),
    PJ.q(PJ.sb.from('acoes_eventos').select('id,acao_id,tipo,descricao,valor_de,valor_para,created_at').order('created_at', { ascending: false }).limit(60), 'listar eventos'),
  ]);
  A.list = l || []; A.events = e || [];
};
const late = a => a.prazo && a.status !== 'concluida' && a.prazo < PJ.today();
const stBadge = s => `<span class="st ${s}">${ST[s] || s}</span>`;
const priBadge = p => `<span class="pri ${p}">${PRI[p] || p}</span>`;
const card = (a, i) => `<button type="button" class="acard" data-id="${a.id}" style="--i:${i}">
  <div class="tags">${stBadge(a.status)}${priBadge(a.prioridade)}${late(a) ? `<span class="pill no">${PJ.icon('alert')}Atrasada</span>` : ''}</div>
  <h4>${esc(a.titulo)}</h4>${a.descricao ? `<p>${esc(a.descricao)}</p>` : '<p class="muted">Sem descrição.</p>'}
  <div class="foot"><div class="fl"><span>${esc(a.responsavel || a.area || 'Sem responsável')}</span><span class="${late(a) ? 'late' : ''}">Prazo <b>${a.prazo ? F.date(a.prazo) : '–'}</b></span></div>
  <div class="fl"><span>Andamento</span><b>${a.progresso}%</b></div><div class="prog ${a.status === 'concluida' ? 'done' : ''}"><i style="--v:0" data-v="${a.progresso / 100}"></i></div></div></button>`;
const animateProg = root => PJ.raf2(() => root.querySelectorAll('.prog i[data-v]').forEach(i => i.style.setProperty('--v', i.dataset.v)));
const rowHTML = (items) => `<div class="row-scroll"><button class="row-nav l" type="button" aria-label="Anterior">${PJ.icon('chevL')}</button><div class="row-track stagger">${items.map(card).join('')}</div><button class="row-nav r" type="button" aria-label="Próximo">${PJ.icon('chevR')}</button></div>`;

// Destaques no Dashboard
A.destaques = async el => {
  if (!el) return;
  try {
    const l = await PJ.q(PJ.sb.from('acoes').select(COLS).neq('status', 'concluida').order('prazo', { ascending: true, nullsFirst: false }).limit(30), 'ações em destaque');
    const top = (l || []).sort((a, b) => (PRI_ORD[a.prioridade] - PRI_ORD[b.prioridade]) || String(a.prazo || '9').localeCompare(String(b.prazo || '9'))).slice(0, 10);
    if (!top.length) { el.innerHTML = PJ.emptyHTML('Nenhuma ação em aberto. ' + (PJ.can('acoes.editar') ? '<a href="#/acoes">Cadastre a primeira ação</a>.' : ''), 'rocket'); return; }
    el.innerHTML = rowHTML(top); PJ.rowNav(el.firstElementChild); animateProg(el);
    el.querySelectorAll('.acard').forEach(b => b.onclick = () => { A.list = top; A.detail(b.dataset.id, true); });
  } catch (e) { el.innerHTML = PJ.emptyHTML(esc(PJ.friendly(e)), 'alert'); }
};

// ---------- Página ----------
PJ.pages.acoes = {
  title: 'Ações PEÇA JÁ',
  async mount(view) {
    view.innerHTML = PJ.D.pageHead({ eyebrow: 'Evolução', title: 'Ações PEÇA JÁ', sub: 'Centro de Evolução: iniciativas em curso para melhorar o PEÇA JÁ.', filters: false,
      extra: PJ.can('acoes.editar') ? `<button class="btn btn-primary" type="button" id="aNew">${PJ.icon('plus')}Nova ação</button>` : '' }) + `
      <section class="hero evo-hero"><svg class="routes" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true"><path d="M-10 230 C 200 220, 300 120, 500 140 S 800 60, 1010 40"/></svg>
        <div><div class="eyebrow">Centro de Evolução do PEÇA JÁ</div><h1>Cada ação, <span>um passo à frente.</span></h1><p id="aSub">Carregando iniciativas…</p></div>
        <div class="hero-stats stagger" id="aStats">${[0, 1, 2, 3].map(i => `<div class="hstat" style="--i:${i}"><div class="sk" style="height:62px"></div></div>`).join('')}</div></section>
      <section class="section"><div class="section-h" style="flex-wrap:wrap">
        <div class="seg-tabs" id="aTabs" role="tablist">${[['todas', 'Todas'], ...Object.entries(ST)].map(([k, v]) => `<button type="button" role="tab" data-t="${k}">${v}</button>`).join('')}</div>
        <div class="acts" style="flex-wrap:wrap"><input class="input" id="aQ" placeholder="Buscar ação, área ou responsável" style="width:240px;padding:8px 12px" aria-label="Buscar">
          <select class="select" id="aPri" style="width:auto;padding:8px 34px 8px 12px" aria-label="Prioridade"><option value="">Todas as prioridades</option>${Object.entries(PRI).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <div class="seg-tabs" id="aMode"><button type="button" data-m="cards">${PJ.icon('grid', '')} Cards</button><button type="button" data-m="timeline">Timeline</button></div></div></div>
        <div id="aBody"><div class="sk" style="height:240px"></div></div></section>`;
    const nb = $('#aNew'); if (nb) nb.onclick = () => A.edit(null);
    view.querySelectorAll('#aTabs [data-t]').forEach(b => b.onclick = () => { A.tab = b.dataset.t; A.render(); });
    view.querySelectorAll('#aMode [data-m]').forEach(b => b.onclick = () => { A.mode = b.dataset.m; A.render(); });
    $('#aPri').value = A.pri; $('#aPri').onchange = e => { A.pri = e.target.value; A.render(); };
    $('#aQ').value = A.q; $('#aQ').oninput = PJ.debounce(e => { A.q = e.target.value; A.render(); }, 200);
    await A.reload();
  },
  update() {},
};
A.reload = async () => {
  PJ.loading(true);
  try { await A.fetch(); A.render(); }
  catch (e) { const b = $('#aBody'); if (b) b.innerHTML = `<div class="banner err">${PJ.icon('alert')}<div class="grow">${esc(PJ.friendly(e))}</div></div>`; }
  finally { PJ.loading(false); }
};
A.filtered = () => { const q = A.q.trim().toLowerCase();
  return A.list.filter(a => (A.tab === 'todas' || a.status === A.tab) && (!A.pri || a.prioridade === A.pri) &&
    (!q || [a.titulo, a.descricao, a.area, a.responsavel].some(x => String(x || '').toLowerCase().includes(q)))); };
A.render = () => {
  const body = $('#aBody'); if (!body) return;
  $('#aTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === A.tab));
  $('#aMode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === A.mode));
  // estatísticas (sobre todas as ações)
  const L = A.list, tot = L.length, and = L.filter(a => a.status === 'em_andamento').length, con = L.filter(a => a.status === 'concluida').length;
  const avg = tot ? L.reduce((s, a) => s + a.progresso, 0) / tot : NaN, atr = L.filter(late).length;
  $('#aSub').textContent = tot ? `${tot} iniciativas cadastradas · ${atr ? atr + ' com prazo vencido' : 'nenhuma atrasada'}.` : 'Nenhuma ação cadastrada ainda.';
  $('#aStats').innerHTML = [['Em andamento', F.int(and), `de ${F.int(tot)} ações`], ['Concluídas', F.int(con), tot ? F.pct(con / tot, 0) + ' do total' : ''],
    ['Andamento médio', isFinite(avg) ? F.int(avg) + '%' : '–', 'progresso das iniciativas'], ['Atrasadas', F.int(atr), atr ? 'prazo vencido' : 'tudo no prazo']]
    .map((s, i) => `<div class="hstat" style="--i:${i}"><div class="l">${s[0]}</div><div class="v ${s[0] === 'Atrasadas' && atr ? 'late' : ''}">${s[1]}</div><div class="s">${s[2]}</div></div>`).join('');
  const list = A.filtered();
  if (!list.length) { body.innerHTML = PJ.emptyHTML(tot ? 'Nenhuma ação com esses filtros.' : (PJ.can('acoes.editar') ? 'Cadastre a primeira ação no botão “Nova ação”.' : 'Nenhuma ação cadastrada ainda.'), 'rocket'); return; }
  if (A.mode === 'timeline') return A.timeline(body, list);
  if (A.tab === 'todas') {
    body.innerHTML = Object.keys(ST).map(s => { const it = list.filter(a => a.status === s); return it.length ? `<div class="section" style="margin-top:18px"><div class="section-h"><h2>${stBadge(s)} <span class="muted" style="font:500 13px var(--f-body);margin-left:6px">${it.length}</span></h2></div>${rowHTML(it)}</div>` : ''; }).join('');
    body.querySelectorAll('.row-scroll').forEach(PJ.rowNav);
  } else body.innerHTML = `<div class="stagger" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-top:6px">${list.map(card).join('')}</div>`;
  animateProg(body);
  body.querySelectorAll('.acard').forEach(b => b.onclick = () => A.detail(b.dataset.id));
};
A.timeline = (body, list) => {
  const dated = list.filter(a => a.data_inicio || a.prazo).map(a => ({ ...a, ini: a.data_inicio || a.prazo, fim: a.prazo || a.data_inicio })).sort((a, b) => a.ini.localeCompare(b.ini));
  const t = s => new Date(s + 'T12:00:00Z').getTime();
  let g = '';
  if (dated.length) {
    const lo = Math.min(...dated.map(a => t(a.ini)), t(PJ.today())), hi = Math.max(...dated.map(a => t(a.fim)), t(PJ.today())), rg = (hi - lo) || 864e5;
    const pos = s => (t(s) - lo) / rg * 100, today = pos(PJ.today());
    g = `<div class="gantt">${dated.map((a, i) => { const l = pos(a.ini), w = Math.max(pos(a.fim) - l, 1.2);
      return `<div class="gl" title="${esc(a.titulo)}">${esc(a.titulo)}</div><div class="gt"><div class="today" style="left:${today}%"></div><div class="gb ${a.status}" style="left:${l}%;width:${w}%;--i:${i};--p:${a.progresso / 100}" data-tip="${esc(PJ.tipHTML(a.titulo, [['Status', ST[a.status]], ['Início', F.date(a.data_inicio)], ['Prazo', F.date(a.prazo)], ['Andamento', a.progresso + '%']]))}"><i></i></div></div>`; }).join('')}
      <div></div><div class="gantt-axis"><span>${F.date(new Date(lo).toISOString())}</span><span style="color:var(--c-sky)">hoje</span><span>${F.date(new Date(hi).toISOString())}</span></div></div>`;
  } else g = PJ.emptyHTML('Defina início e prazo nas ações para vê-las na linha do tempo.', 'calendar');
  const ids = new Set(list.map(a => a.id)), names = new Map(A.list.map(a => [a.id, a.titulo]));
  const ev = A.events.filter(e => ids.has(e.acao_id)).slice(0, 25);
  const evc = { criada: 'var(--c-sky)', status: 'var(--s4)', progresso: 'var(--blue)', prazo: 'var(--warn-bar)', resultado: 'var(--good)' };
  body.innerHTML = `<div class="grid stagger" style="margin-top:6px"><div class="card c8"><div class="card-h"><div><h3>Linha do tempo das iniciativas</h3><div class="d">Barra = início → prazo. Parte clara = andamento. Linha azul = hoje.</div></div></div><div class="tw">${g}</div></div>
    <div class="card c4"><div class="card-h"><div><h3>Evolução recente</h3><div class="d">Mudanças registradas automaticamente.</div></div></div>
    ${ev.length ? `<div class="tl">${ev.map(e => `<div class="tl-i" style="--c:${evc[e.tipo]}"><b>${esc(names.get(e.acao_id) || 'Ação')}</b><p>${esc(e.descricao)}${e.valor_para ? `: ${e.valor_de ? esc(e.valor_de) + ' → ' : ''}<b>${esc(e.valor_para)}</b>` : ''}</p><small>${F.rel(e.created_at)}</small></div>`).join('')}</div>` : PJ.emptyHTML('Sem eventos ainda.', 'list')}</div></div>`;
};

// ---------- Detalhe ----------
A.detail = async (id, fromDash) => {
  const a = A.list.find(x => x.id === id); if (!a) return;
  let ev = A.events.filter(e => e.acao_id === id);
  if (fromDash || !ev.length) { try { ev = await PJ.q(PJ.sb.from('acoes_eventos').select('id,tipo,descricao,valor_de,valor_para,created_at').eq('acao_id', id).order('created_at', { ascending: false }).limit(20), 'eventos'); } catch (e) { ev = []; } }
  const kv = [['Responsável', a.responsavel], ['Área', a.area], ['Início', F.date(a.data_inicio)], ['Prazo', a.prazo ? `<span class="${late(a) ? 'late' : ''}">${F.date(a.prazo)}${late(a) ? ' · atrasada' : ''}</span>` : '–'], ['Atualizada', F.dateTime(a.updated_at)]];
  const can = PJ.can('acoes.editar');
  const m = PJ.modal({ title: a.titulo, wide: true, body: `<div style="display:flex;flex-direction:column;gap:16px">
    <div class="tags" style="display:flex;gap:6px;flex-wrap:wrap">${stBadge(a.status)}${priBadge(a.prioridade)}</div>
    ${a.descricao ? `<p style="margin:0;color:var(--ink-2)">${esc(a.descricao)}</p>` : ''}
    <div><div class="fl" style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);margin-bottom:6px"><span>Andamento</span><b class="num" style="color:var(--ink)">${a.progresso}%</b></div><div class="prog ${a.status === 'concluida' ? 'done' : ''}"><i style="--v:0" data-v="${a.progresso / 100}"></i></div></div>
    <div class="grid-form"><div class="kv">${kv.map(([k, v]) => `<span>${k}</span><b style="font-weight:600">${v && !/^<span/.test(v) ? esc(v) : (v || '–')}</b>`).join('')}</div>
      <div style="display:flex;flex-direction:column;gap:10px"><div><div class="label">Resultado esperado</div><p style="margin:4px 0 0">${esc(a.resultado_esperado || '–')}</p></div><div><div class="label">Resultado obtido</div><p style="margin:4px 0 0">${esc(a.resultado_obtido || '–')}</p></div></div></div>
    <div><div class="label" style="margin-bottom:8px">Histórico</div>${ev.length ? `<div class="tl">${ev.map(e => `<div class="tl-i"><b>${esc(e.descricao)}</b>${e.valor_para ? `<p>${e.valor_de ? esc(e.valor_de) + ' → ' : ''}${esc(e.valor_para)}</p>` : ''}<small>${F.dateTime(e.created_at)}</small></div>`).join('')}</div>` : '<span class="muted">Sem eventos.</span>'}</div></div>`,
    actions: can ? [{ label: 'Excluir', cls: 'btn-danger', icon: 'trash', onClick: async ({ close }) => { if (await A.remove(a)) close(); } }, { label: 'Editar', cls: 'btn-primary', icon: 'edit', onClick: ({ close }) => { close(); A.edit(a); } }] : [{ label: 'Fechar' }] });
  animateProg(m.body);
};

// ---------- Cadastro / edição ----------
A.edit = a => {
  if (!PJ.can('acoes.editar')) return PJ.toast('Você não tem permissão para editar ações.', 'err');
  const v = a || { status: 'planejada', prioridade: 'media', progresso: 0, data_inicio: PJ.today() };
  const opt = (o, sel) => Object.entries(o).map(([k, l]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${l}</option>`).join('');
  const body = PJ.h(`<form class="grid-form" novalidate>
    <div class="field full"><label for="acT">Ação *</label><input class="input" id="acT" maxlength="160" required value="${esc(v.titulo || '')}" placeholder="Ex.: Expansão do Shippify"></div>
    <div class="field full"><label for="acD">Descrição</label><textarea class="input" id="acD" maxlength="4000">${esc(v.descricao || '')}</textarea></div>
    <div class="field"><label for="acR">Responsável</label><input class="input" id="acR" maxlength="120" value="${esc(v.responsavel || '')}"></div>
    <div class="field"><label for="acA">Área</label><input class="input" id="acA" maxlength="80" value="${esc(v.area || '')}" placeholder="Ex.: Logística"></div>
    <div class="field"><label for="acI">Data de início</label><input class="input" type="date" id="acI" value="${v.data_inicio || ''}"></div>
    <div class="field"><label for="acP">Prazo</label><input class="input" type="date" id="acP" value="${v.prazo || ''}"></div>
    <div class="field"><label for="acS">Status</label><select class="select" id="acS">${opt(ST, v.status)}</select></div>
    <div class="field"><label for="acPr">Prioridade</label><select class="select" id="acPr">${opt(PRI, v.prioridade)}</select></div>
    <div class="field full"><label for="acG">Percentual de andamento: <b id="acGv" class="num" style="color:var(--ink)">${v.progresso}%</b></label><input type="range" id="acG" min="0" max="100" step="5" value="${v.progresso}"></div>
    <div class="field full"><label for="acE">Resultado esperado</label><textarea class="input" id="acE" maxlength="2000">${esc(v.resultado_esperado || '')}</textarea></div>
    <div class="field full"><label for="acO">Resultado obtido</label><textarea class="input" id="acO" maxlength="2000">${esc(v.resultado_obtido || '')}</textarea></div>
    <div class="form-msg err full" id="acErr" hidden></div></form>`);
  const g = body.querySelector('#acG'), gv = body.querySelector('#acGv');
  g.oninput = () => gv.textContent = g.value + '%';
  body.querySelector('#acS').onchange = e => { if (e.target.value === 'concluida' && +g.value < 100) { g.value = 100; gv.textContent = '100%'; } };
  PJ.modal({ title: a ? 'Editar ação' : 'Nova ação', wide: true, body, actions: [{ label: 'Cancelar' }, { label: a ? 'Salvar alterações' : 'Cadastrar ação', cls: 'btn-primary', icon: 'check', onClick: async ({ close, btn }) => {
    const val = id => body.querySelector(id).value.trim(), err = body.querySelector('#acErr');
    const rec = { titulo: val('#acT'), descricao: val('#acD') || null, responsavel: val('#acR') || null, area: val('#acA') || null, data_inicio: val('#acI') || null, prazo: val('#acP') || null,
      status: val('#acS'), prioridade: val('#acPr'), progresso: +g.value, resultado_esperado: val('#acE') || null, resultado_obtido: val('#acO') || null };
    body.querySelectorAll('.input').forEach(i => i.classList.remove('err'));
    const fail = (sel, msg) => { err.hidden = false; err.innerHTML = PJ.icon('alert') + esc(msg); if (sel) body.querySelector(sel).classList.add('err'); };
    if (rec.titulo.length < 2) return fail('#acT', 'Informe o nome da ação.');
    if (rec.data_inicio && rec.prazo && rec.prazo < rec.data_inicio) return fail('#acP', 'O prazo não pode ser anterior à data de início.');
    PJ.btnBusy(btn, true, 'Salvando…');
    try {
      const r = a ? await PJ.q(PJ.sb.from('acoes').update(rec).eq('id', a.id).select('id'), 'atualizar ação')
                  : await PJ.q(PJ.sb.from('acoes').insert(rec).select('id'), 'cadastrar ação');
      if (!r || !r.length) throw { code: '42501', message: 'Sem permissão' };
      close(); PJ.toast(a ? 'Ação atualizada.' : 'Ação cadastrada. A equipe foi notificada.', 'ok');
      if ($('#aBody')) A.reload(); PJ.Notif && PJ.Notif.refresh();
    } catch (e) { fail(null, PJ.friendly(e)); PJ.btnBusy(btn, false); }
  } }] });
};
A.remove = async a => {
  if (!await PJ.confirm({ title: 'Excluir ação', text: `Tem certeza que deseja excluir <b>${esc(a.titulo)}</b>? O histórico da ação também será removido.`, ok: 'Excluir', danger: true })) return false;
  try { const r = await PJ.q(PJ.sb.from('acoes').delete().eq('id', a.id).select('id'), 'excluir ação');
    if (!r || !r.length) throw { code: '42501', message: 'Sem permissão' }; PJ.toast('Ação excluída.', 'ok'); if ($('#aBody')) A.reload(); return true; }
  catch (e) { PJ.toast(PJ.friendly(e), 'err'); return false; }
};
})();
