/* =====================================================================
   PEÇA JÁ · admin.js — Gestão de Acessos, Permissões, Configurações e Bases
   Toda alteração passa por RPCs SECURITY DEFINER que revalidam a
   permissão no banco (admin_*, definir_permissao_perfil, publicar_importacao).
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, D = PJ.D, $ = PJ.$, esc = PJ.esc, F = PJ.fmt;
const STL = { ativo: 'Ativo', bloqueado: 'Bloqueado', pendente: 'Pendente' };
const stPill = u => !u.tem_conta && u.status === 'ativo' ? `<span class="pill info">${PJ.icon('mail')}Aguardando 1º acesso</span>`
  : `<span class="pill ${u.status === 'ativo' ? 'ok' : u.status === 'bloqueado' ? 'no' : 'warn'}">${PJ.icon(u.status === 'ativo' ? 'check' : u.status === 'bloqueado' ? 'lock' : 'clock')}${STL[u.status]}</span>`;

// =====================================================================
// GESTÃO DE ACESSOS
// =====================================================================
const U = PJ.Users = { list: [], q: '', perfil: '', status: '', st: { k: 'nivel', d: 1 } };
PJ.pages.usuarios = {
  title: 'Gestão de Acessos',
  async mount(view) {
    const can = PJ.can('usuarios.gerenciar');
    view.innerHTML = D.pageHead({ eyebrow: 'Administração', title: 'Gestão de Acessos', sub: 'Usuários, perfis e liberação de acesso ao PEÇA JÁ.', filters: false,
      extra: can ? `<button class="btn btn-primary" type="button" id="uNew">${PJ.icon('plus')}Novo usuário</button>` : '' }) + `
      <div class="kpis stagger" style="grid-template-columns:repeat(4,minmax(0,1fr))" id="uStats">${['Usuários', 'Ativos', 'Pendentes', 'Bloqueados'].map((l, i) => D.kpiHTML('u' + i, l, ['users', 'checkc', 'clock', 'lock'][i], ['var(--blue)', 'var(--good)', 'var(--warn-bar)', 'var(--bad)'][i])).join('')}</div>
      <section class="section"><div class="card"><div class="card-h"><div><h3>Usuários do sistema</h3><div class="d">${can ? 'Clique nos ícones para editar, alterar perfil, ativar, bloquear ou excluir.' : 'Somente leitura para o seu perfil.'}</div></div>
        <div class="fbar"><input class="input" id="uQ" placeholder="Buscar nome ou e-mail" style="width:220px;padding:8px 12px" aria-label="Buscar usuário">
        <select class="select" id="uP" style="width:auto;padding:8px 34px 8px 12px" aria-label="Perfil"><option value="">Todos os perfis</option>${Object.entries(PJ.PERFIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <select class="select" id="uS" style="width:auto;padding:8px 34px 8px 12px" aria-label="Status"><option value="">Todos os status</option>${Object.entries(STL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div></div>
        <div id="uTb"><div class="sk" style="height:220px"></div></div></div></section>`;
    if (can) $('#uNew').onclick = () => U.edit(null);
    $('#uQ').oninput = PJ.debounce(e => { U.q = e.target.value; U.render(); }, 180);
    $('#uP').onchange = e => { U.perfil = e.target.value; U.render(); };
    $('#uS').onchange = e => { U.status = e.target.value; U.render(); };
    await U.reload();
  },
  update() {},
};
U.reload = async () => {
  PJ.loading(true);
  try { U.list = await PJ.rpc('admin_listar_usuarios') || []; U.render(); }
  catch (e) { const t = $('#uTb'); if (t) t.innerHTML = `<div class="banner err">${PJ.icon('alert')}<div class="grow">${esc(PJ.friendly(e))}</div></div>`; }
  finally { PJ.loading(false); }
};
// O que o usuário logado pode fazer com cada linha (o banco valida de novo)
U.allowed = u => { const g = PJ.can('usuarios.gerenciar'); const masterLock = u.perfil === 'master' && !PJ.isMaster();
  return { edit: g && !masterLock, perfil: g && !masterLock && !u.eu, status: g && !masterLock && !u.eu, del: g && !masterLock && !u.eu }; };
U.render = () => {
  const el = $('#uTb'); if (!el) return; const L = U.list;
  [L.length, L.filter(u => u.status === 'ativo').length, L.filter(u => u.status === 'pendente').length, L.filter(u => u.status === 'bloqueado').length]
    .forEach((v, i) => D.setKpi('u' + i, v, F.int, i === 2 && v ? 'aguardando liberação' : ''));
  const q = U.q.trim().toLowerCase();
  const rows = L.filter(u => (!U.perfil || u.perfil === U.perfil) && (!U.status || u.status === U.status) && (!q || (u.nome + ' ' + u.email).toLowerCase().includes(q)));
  if (!rows.length) { el.innerHTML = PJ.emptyHTML('Nenhum usuário encontrado.', 'users'); return; }
  const ib = (act, icon, label, dis, cls = '') => `<button type="button" class="icon-btn ${cls}" data-act="${act}" aria-label="${label}" data-tip="${esc(label)}" ${dis ? 'disabled style="opacity:.3;cursor:not-allowed"' : ''}>${PJ.icon(icon)}</button>`;
  D.table(el, rows.map(u => Object.assign(u, { _ua: u.ultimo_acesso || '' })), [
    { k: 'nome', t: 'Nome', l: true, f: u => `<div class="cell-user"><span class="avatar">${esc(F.initials(u.nome))}</span><div><b>${esc(u.nome)}</b>${u.eu ? ' <span class="pill info" style="padding:1px 7px">você</span>' : ''}</div></div>` },
    { k: 'email', t: 'E-mail', l: true, f: u => esc(u.email) },
    { k: 'nivel', t: 'Perfil', l: true, f: u => `<span class="role ${u.perfil}">${esc(u.perfil_nome)}</span>` },
    { k: 'status', t: 'Status', l: true, f: stPill },
    { k: '_ua', t: 'Último acesso', f: u => u.ultimo_acesso ? `<span data-tip="${esc(F.dateTime(u.ultimo_acesso))}">${F.rel(u.ultimo_acesso)}</span>` : '<span class="muted">nunca</span>' },
    { k: 'created_at', t: 'Criado em', f: u => F.date(u.created_at) },
    { k: 'id', t: 'Ações', sort: false, cls: 'acts-cell', f: u => { const a = U.allowed(u); return `<span class="row-acts" data-id="${u.id}">${ib('edit', 'edit', 'Editar', !a.edit)}${ib('perfil', 'key', 'Alterar perfil', !a.perfil)}${u.status === 'ativo' ? ib('block', 'lock', 'Bloquear', !a.status) : ib('activate', 'unlock', 'Ativar / liberar acesso', !a.status)}${ib('del', 'trash', 'Excluir', !a.del, 'danger')}</span>`; } },
  ], U.st);
  el.querySelectorAll('.row-acts').forEach(box => box.onclick = e => { const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const u = U.list.find(x => x.id === box.dataset.id); ({ edit: U.edit, perfil: U.perfil_, block: x => U.status_(x, 'bloqueado'), activate: x => U.status_(x, 'ativo'), del: U.del })[b.dataset.act](u); });
};
const perfisOpts = sel => Object.entries(PJ.PERFIS).filter(([k]) => k !== 'master' || PJ.isMaster() || sel === 'master').map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v}</option>`).join('');
U.edit = u => {
  const v = u || { nome: '', email: '', perfil: 'visualizacao', status: 'ativo' };
  const body = PJ.h(`<form class="grid-form" novalidate>
    <div class="field full"><label for="uNm">Nome *</label><input class="input" id="uNm" maxlength="120" value="${esc(v.nome)}" required></div>
    <div class="field full"><label for="uEm">E-mail *</label><input class="input" type="email" id="uEm" value="${esc(v.email)}" ${u && u.tem_conta ? 'readonly title="E-mail de conta já criada não pode ser alterado"' : ''} required></div>
    <div class="field"><label for="uPf">Perfil</label><select class="select" id="uPf" ${u && u.eu ? 'disabled' : ''}>${perfisOpts(v.perfil)}</select></div>
    <div class="field"><label for="uSt">Status</label><select class="select" id="uSt" ${u && u.eu ? 'disabled' : ''}>${Object.entries(STL).map(([k, l]) => `<option value="${k}"${k === v.status ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="form-msg info full">${PJ.icon('info')}<span>${u && u.tem_conta ? 'Esta pessoa já tem conta. Mudanças de perfil e status valem imediatamente.' : 'Após salvar, a pessoa entra na tela de login em <b>Primeiro acesso</b>, com este e-mail, e cria a própria senha. Nenhuma senha é definida ou vista pelo administrador.'}</span></div>
    <div class="form-msg err full" id="uErr" hidden></div></form>`);
  PJ.modal({ title: u ? 'Editar usuário' : 'Novo usuário', body, actions: [{ label: 'Cancelar' }, { label: u ? 'Salvar' : 'Cadastrar usuário', cls: 'btn-primary', icon: 'check', onClick: async ({ close, btn }) => {
    const nm = body.querySelector('#uNm').value.trim(), em = body.querySelector('#uEm').value.trim().toLowerCase(), pf = body.querySelector('#uPf').value, st = body.querySelector('#uSt').value, err = body.querySelector('#uErr');
    const fail = m => { err.hidden = false; err.innerHTML = PJ.icon('alert') + esc(m); };
    if (!nm) return fail('Informe o nome.'); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return fail('Informe um e-mail válido.');
    if (pf === 'master' && (!u || u.perfil !== 'master') && !await PJ.confirm({ title: 'Conceder perfil Master', text: `O perfil Master tem <b>controle completo</b> do sistema, inclusive sobre permissões. Confirmar para <b>${esc(nm)}</b>?`, ok: 'Conceder Master', danger: true })) return;
    PJ.btnBusy(btn, true, 'Salvando…');
    try { await PJ.rpc('admin_salvar_usuario', { p_id: u ? u.id : null, p_nome: nm, p_email: em, p_perfil: pf, p_status: st }); close(); PJ.toast(u ? 'Usuário atualizado.' : `Usuário cadastrado. Peça para ${esc(nm)} usar “Primeiro acesso” na tela de login.`, 'ok'); U.reload(); PJ.Notif && PJ.Notif.refresh(); }
    catch (e) { fail(PJ.friendly(e)); PJ.btnBusy(btn, false); }
  } }] });
};
U.perfil_ = u => {
  const body = PJ.h(`<div class="field"><label for="upPf">Novo perfil para ${esc(u.nome)}</label><select class="select" id="upPf">${perfisOpts(u.perfil)}</select><span class="help">Perfil atual: ${esc(u.perfil_nome)}.</span></div>`);
  PJ.modal({ title: 'Alterar perfil', body, actions: [{ label: 'Cancelar' }, { label: 'Alterar perfil', cls: 'btn-primary', onClick: async ({ close, btn }) => {
    const pf = body.querySelector('#upPf').value; if (pf === u.perfil) return close();
    if (!await PJ.confirm({ title: 'Confirmar alteração de perfil', text: `Alterar <b>${esc(u.nome)}</b> de <b>${esc(u.perfil_nome)}</b> para <b>${PJ.PERFIS[pf]}</b>? As permissões mudam imediatamente.`, ok: 'Alterar', danger: pf === 'master' })) return;
    PJ.btnBusy(btn, true);
    try { await PJ.rpc('admin_salvar_usuario', { p_id: u.id, p_nome: u.nome, p_email: u.email, p_perfil: pf, p_status: u.status }); close(); PJ.toast('Perfil alterado.', 'ok'); U.reload(); }
    catch (e) { PJ.toast(PJ.friendly(e), 'err'); PJ.btnBusy(btn, false); }
  } }] });
};
U.status_ = async (u, st) => {
  const block = st === 'bloqueado';
  if (!await PJ.confirm({ title: block ? 'Bloquear usuário' : 'Liberar acesso', text: block ? `Tem certeza que deseja bloquear <b>${esc(u.nome)}</b>? O acesso é cortado imediatamente.` : `Liberar o acesso de <b>${esc(u.nome)}</b> com o perfil <b>${esc(u.perfil_nome)}</b>?`, ok: block ? 'Bloquear' : 'Liberar acesso', danger: block, icon: block ? 'lock' : 'unlock' })) return;
  try { await PJ.rpc('admin_definir_status', { p_id: u.id, p_status: st }); PJ.toast(block ? 'Usuário bloqueado.' : 'Acesso liberado.', 'ok'); U.reload(); PJ.Notif && PJ.Notif.refresh(); }
  catch (e) { PJ.toast(PJ.friendly(e), 'err'); }
};
U.del = async u => {
  if (!await PJ.confirm({ title: 'Excluir usuário', text: `Tem certeza que deseja excluir <b>${esc(u.nome)}</b> (${esc(u.email)})? A conta de acesso também será removida. Esta ação não pode ser desfeita.`, ok: 'Excluir definitivamente', danger: true, icon: 'trash' })) return;
  try { await PJ.rpc('admin_excluir_usuario', { p_id: u.id }); PJ.toast('Usuário excluído.', 'ok'); U.reload(); }
  catch (e) { PJ.toast(PJ.friendly(e), 'err'); }
};

// =====================================================================
// PERMISSÕES
// =====================================================================
PJ.pages.permissoes = {
  title: 'Permissões',
  async mount(view) {
    view.innerHTML = D.pageHead({ eyebrow: 'Administração', title: 'Permissões', sub: 'O que cada perfil pode ver e fazer. Validado no banco de dados (RLS).', filters: false }) + `<div id="pmBody"><div class="sk" style="height:300px"></div></div>`;
    PJ.loading(true);
    try { const m = await PJ.rpc('permissoes_matriz'); PJ.pages.permissoes.render(m); }
    catch (e) { $('#pmBody').innerHTML = `<div class="banner err">${PJ.icon('alert')}<div class="grow">${esc(PJ.friendly(e))}</div></div>`; }
    finally { PJ.loading(false); }
  },
  render(m) {
    const has = new Set((m.concedidas || []).map(c => c.perfil + '|' + c.permissao)), P = m.perfis || [], ed = m.pode_editar;
    let grp = '';
    $('#pmBody').innerHTML = `${ed ? '' : `<div class="banner info">${PJ.icon('lock')}<div class="grow">Somente o <b>Master</b> pode alterar permissões. Você está vendo em modo leitura.</div></div>`}
      <div class="grid stagger" style="margin-bottom:18px">${P.map((p, i) => `<div class="card c3 lift" style="--i:${i}"><span class="role ${p.codigo}" style="align-self:flex-start">${esc(p.nome)}</span><div class="d" style="color:var(--ink-2);font-size:13px">${esc(p.descricao || '')}</div></div>`).join('')}</div>
      <div class="card"><div class="tw"><table class="perm-grid"><thead><tr><th scope="col">Permissão</th>${P.map(p => `<th scope="col">${esc(p.nome)}</th>`).join('')}</tr></thead><tbody>
      ${(m.permissoes || []).map(x => { const g = x.grupo !== grp ? (grp = x.grupo, `<tr class="grp"><td colspan="${P.length + 1}">${esc(x.grupo)}</td></tr>`) : '';
        return g + `<tr><td><b>${esc(x.nome)}</b><small>${esc(x.descricao || '')}</small></td>${P.map(p => p.codigo === 'master' ? `<td><span class="pill ok" data-tip="O Master sempre tem todas as permissões">${PJ.icon('check')}sempre</span></td>`
          : `<td><label class="switch"><input type="checkbox" data-pf="${p.codigo}" data-pm="${x.codigo}" aria-label="${esc(p.nome)}: ${esc(x.nome)}" ${has.has(p.codigo + '|' + x.codigo) ? 'checked' : ''} ${ed ? '' : 'disabled'}><span></span></label></td>`).join('')}</tr>`; }).join('')}
      </tbody></table></div></div>`;
    if (!ed) return;
    $('#pmBody').querySelectorAll('input[data-pf]').forEach(cb => cb.onchange = async () => {
      const on = cb.checked; cb.disabled = true;
      try { await PJ.rpc('definir_permissao_perfil', { p_perfil: cb.dataset.pf, p_permissao: cb.dataset.pm, p_concedida: on }); PJ.toast(`Permissão ${on ? 'concedida' : 'revogada'} para ${PJ.PERFIS[cb.dataset.pf]}.`, 'ok', { ms: 2200 }); }
      catch (e) { cb.checked = !on; PJ.toast(PJ.friendly(e), 'err'); }
      finally { cb.disabled = false; }
    });
  },
  update() {},
};

// =====================================================================
// CONFIGURAÇÕES (meta, segmento padrão) + BASES DE DADOS
// =====================================================================
PJ.pages.configuracoes = {
  title: 'Configurações',
  mount(view) {
    const cfgOk = PJ.can('config.editar'), baseOk = PJ.can('base.importar'), seeCfg = cfgOk || PJ.can('dados.ver'), me = PJ.me;
    const tile = (k, cls, desc) => `<button type="button" class="theme-opt" role="radio" data-theme-opt="${k}" aria-checked="false"><span class="tprev ${cls}">${cls === 'auto' ? '' : '<span class="sb"></span><span class="ct"><i></i><i></i><i></i></span>'}</span><span class="chk">${PJ.icon('check')}</span><span>${PJ.theme.OPTS[k]}<small>${desc}</small></span></button>`;
    view.innerHTML = D.pageHead({ eyebrow: 'Configurações', title: 'Configurações', sub: 'Preferências pessoais e parâmetros do sistema.', filters: false }) + `
      <div class="section-h"><h2>Preferências pessoais</h2></div>
      <div class="grid stagger">
      <div class="card c7 lift"><div class="card-h"><div><h3>Aparência</h3><div class="d">Escolha como o PEÇA JÁ aparece para você. Fica salvo no seu perfil e vale em qualquer computador.</div></div></div>
        <div class="theme-opts" role="radiogroup" aria-label="Tema da interface">${tile('escuro', 'dark', 'Azul-marinho, ideal para monitoramento')}${tile('claro', 'light', 'Fundo claro, ideal para leitura e impressão')}${tile('auto', 'auto', 'Segue o tema do seu sistema')}</div></div>
      <div class="card c5 lift"><div class="card-h"><div><h3>Minha conta</h3><div class="d">Seus dados de acesso.</div></div></div>
        <div class="kv"><span>Nome</span><b>${esc(me.nome || '–')}</b><span>E-mail</span><b style="word-break:break-all">${esc(me.email)}</b><span>Perfil</span><b><span class="role ${me.perfil}">${esc(me.perfil_nome || PJ.PERFIS[me.perfil])}</span></b><span>Versão do app</span><b>${esc(PJ.VERSION)}</b></div>
        <button class="btn btn-ghost" type="button" id="cfPass" style="align-self:flex-start">${PJ.icon('key')}Alterar minha senha</button></div>
      </div>
      ${seeCfg || baseOk ? '<div class="section-h section"><h2>Sistema</h2></div>' : ''}
      <div class="grid stagger">
      ${seeCfg ? `<div class="card c5 lift"><div class="card-h"><div><h3>Parâmetros do painel</h3><div class="d">Valem para todos os usuários.</div></div>${cfgOk ? '' : '<span class="pill neutral">' + PJ.icon('lock') + 'Somente leitura</span>'}</div>
        <form id="cfgF" class="grid-form" novalidate><div class="field full"><label for="cfMeta">Meta de custo logístico (%)</label><input class="input num" type="number" id="cfMeta" step="0.01" min="0" max="100" ${cfgOk ? '' : 'disabled'}><span class="help">% de custo = custo de frete ÷ valor da nota fiscal.</span></div>
        <div class="field full"><label for="cfSeg">Segmento padrão no gráfico de SLA por transportadora</label><select class="select" id="cfSeg" ${cfgOk ? '' : 'disabled'}></select></div>
        ${cfgOk ? `<div class="full"><button class="btn btn-primary" type="submit" id="cfBtn">${PJ.icon('check')}Salvar parâmetros</button></div>` : ''}<div class="full" id="cfInfo"></div></form></div>` : ''}
      ${baseOk ? `<div class="card c7 lift"><div class="card-h"><div><h3>Bases de dados</h3><div class="d">① Carregue a planilha (vira rascunho) → confira → ② publique para todos.</div></div></div>
        <div class="kv" id="bInfo"></div>
        <div class="dz" id="bDz" tabindex="0" role="button" aria-label="Carregar planilha">${PJ.icon('upload')}<div style="font-weight:600;margin-top:6px">① Carregar base Excel</div><div class="help">Arraste o arquivo aqui ou clique · .xlsx, .xlsm, .xls, .csv ou base.json antiga</div></div>
        <input type="file" id="bFile" accept=".xlsx,.xlsm,.xls,.csv,.json" hidden>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary" type="button" id="bPub" disabled>${PJ.icon('check')}② Publicar esta base para todos</button><a class="btn btn-ghost" href="#/dashboard" id="bSee" hidden>${PJ.icon('eye')}Ver rascunho no dashboard</a></div>
        <div class="help" id="bHint">Carregue uma planilha no passo ① para liberar a publicação.</div></div>` : ''}</div>`;
    const marks = () => view.querySelectorAll('[data-theme-opt]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeOpt === PJ.theme.get())));
    view.querySelectorAll('[data-theme-opt]').forEach(b => b.onclick = async () => { await PJ.theme.set(b.dataset.themeOpt); marks(); PJ.toast(`Aparência: modo ${PJ.theme.OPTS[b.dataset.themeOpt].toLowerCase()}.`, 'ok', { ms: 2200 }); });
    marks(); document.addEventListener('pj:theme', marks);
    $('#cfPass').onclick = () => PJ.Auth.changePass();
    if (cfgOk) $('#cfgF').onsubmit = async e => { e.preventDefault(); const btn = $('#cfBtn'), v = parseFloat($('#cfMeta').value);
      if (!isFinite(v) || v < 0 || v > 100) { $('#cfMeta').classList.add('err'); return PJ.toast('Informe uma meta entre 0 e 100.', 'err'); }
      $('#cfMeta').classList.remove('err'); PJ.btnBusy(btn, true, 'Salvando…');
      try { const r = await PJ.q(PJ.sb.from('painel_config').update({ meta_custo_pct: Math.round(v * 100) / 100, segmento_padrao_sla: $('#cfSeg').value || null }).eq('id', 1).select('meta_custo_pct,segmento_padrao_sla,updated_at'), 'salvar configuração');
        if (!r || !r.length) throw { code: '42501' };
        Object.assign(D.OPC.config, r[0]); D.slaSeg = null; PJ.toast(`Parâmetros salvos. Meta de ${F.pct(v / 100)} vale para todos.`, 'ok'); PJ.pages.configuracoes.update(); PJ.Notif && PJ.Notif.refresh(); }
      catch (err) { PJ.toast(PJ.friendly(err), 'err'); } finally { PJ.btnBusy(btn, false); } };
    if (baseOk) {
      const dz = $('#bDz'), fi = $('#bFile');
      dz.onclick = () => fi.click(); dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } };
      dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
      dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) PJ.Bases.readFile(f); };
      fi.onchange = e => { const f = e.target.files[0]; if (f) PJ.Bases.readFile(f); e.target.value = ''; };
      $('#bPub').onclick = () => PJ.Bases.publish($('#bPub'));
    }
    if (!D.loaded && (seeCfg || baseOk)) D.loadAll();
  },
  update() {
    const o = D.OPC; if (!o) return;
    const m = $('#cfMeta'); if (m && document.activeElement !== m) m.value = o.config ? o.config.meta_custo_pct : '';
    const s = $('#cfSeg'); if (s && document.activeElement !== s) { const segs = [...((o.opcoes && o.opcoes.seg) || [])].sort((a, b) => a.localeCompare(b, 'pt-BR')), cur = o.config && o.config.segmento_padrao_sla || '';
      if (cur && !segs.includes(cur)) segs.unshift(cur);
      s.innerHTML = '<option value="">Todos os segmentos</option>' + segs.map(v => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join(''); }
    const ci = $('#cfInfo'); if (ci && o.config) ci.innerHTML = `<span class="help">Última alteração: ${F.dateTime(o.config.updated_at)}</span>`;
    const bi = $('#bInfo'); if (bi) { const imp = o.importacao;
      bi.innerHTML = imp ? `<span>Base ${imp.status === 'publicada' ? 'publicada' : '<b style="color:var(--warn)">RASCUNHO</b>'}</span><b>${esc(imp.nome_arquivo)}${imp.aba ? ' · aba ' + esc(imp.aba) : ''}</b><span>Registros</span><b>${F.int(o.total)}</b><span>Período</span><b>${F.date(o.data_min)} a ${F.date(o.data_max)}</b><span>${imp.status === 'publicada' ? 'Publicada em' : 'Carregada em'}</span><b>${F.dateTime(imp.publicada_em || imp.created_at)}</b>` : '<span>Base</span><b>Nenhuma base publicada</b>';
      $('#bPub').disabled = !D.CUR_IMP; $('#bSee').hidden = !D.CUR_IMP;
      $('#bHint').textContent = D.CUR_IMP ? 'Rascunho pronto. Confira no dashboard e clique em ② para todos verem.' : 'Carregue uma planilha no passo ① para liberar a publicação.'; }
  },
};

// =====================================================================
// IMPORTAÇÃO DA PLANILHA (mesma lógica da versão anterior)
// =====================================================================
const B = PJ.Bases = {};
let XLSX_P = null;
function loadXLSX() { if (window.XLSX) return Promise.resolve(); if (XLSX_P) return XLSX_P;
  XLSX_P = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = () => { XLSX_P = null; ko(new Error('xlsx')); }; document.head.appendChild(s); });
  return XLSX_P; }
const p2 = n => String(n).padStart(2, '0');
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const serialToISO = n => { const d = new Date(Math.round((n - 25569) * 86400000)); return isFinite(d) ? d.toISOString().slice(0, 10) : null; };
function parseDate(v) { if (v == null || v === '') return null; if (typeof v === 'number') return serialToISO(v); if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim(); let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`; m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : null; }
function validDate(iso) { if (!iso) return null; const d = new Date(iso + 'T00:00:00Z'), y = +iso.slice(0, 4); return isFinite(d) && d.toISOString().slice(0, 10) === iso && y >= 2000 && y <= 2100 ? iso : null; }
function parseSla(v) { if (v == null || v === '') return null; if (typeof v === 'number') return v >= 0 ? Math.round(v * 86400) : null;
  const m = String(v).trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0)) : null; }
function num(v) { if (typeof v === 'number') return isFinite(v) ? v : 0; if (v == null || v === '') return 0; const s = String(v).replace(/[R$\s]/g, ''); const n = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(n) ? n : 0; }
const r2 = v => Math.round((+v || 0) * 100) / 100;
function fromLegacyJson(j) { const Dd = j.dic; return j.rows.map(r => ({ cod: r[0], exp: Dd.exp[r[1]], tipo: Dd.tipo[r[2]], eq: Dd.eq[r[3]], emp: Dd.emp[r[4]], seg: Dd.seg[r[5]], par: Dd.par[r[6]] || '(sem parceiro)', date: r[7], valor: r[8], custo: r[9], sla: r[10] })); }

B.readFile = async file => {
  if (!PJ.can('base.importar')) return PJ.toast('Seu perfil não pode importar bases.', 'err');
  const t = PJ.toast(`Lendo <b>${esc(file.name)}</b>… arquivos grandes podem levar alguns segundos.`, 'info', { sticky: true });
  try {
    let rows, aba;
    if (/\.json$/i.test(file.name)) {
      const j = JSON.parse(await file.text()); if (!j || !j.dic || !Array.isArray(j.rows)) { t.close(); return PJ.toast('Este JSON não está no formato da base antiga do painel (base.json).', 'err'); }
      rows = fromLegacyJson(j); aba = 'base.json (formato antigo)';
    } else {
      try { await loadXLSX(); } catch (e) { t.close(); return PJ.toast('Não foi possível carregar o leitor de Excel. Verifique a conexão e tente de novo.', 'err'); }
      const buf = await file.arrayBuffer(), isCsv = /\.csv$/i.test(file.name);
      const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false, cellStyles: false, raw: isCsv });
      const need = { cod: 'CODVENDA', exp: 'TIPOEXPEDICAO', tipo: 'TIPOVENDA', eq: 'EQUIPEVENDA', emp: 'ABREVIACAOEMPRESA', date: 'DATAREFERENCIA', valor: 'VALORNOTAFISCAL', seg: 'SEGMENTO', sla: 'SLADEENTREGA', custo: 'CUSTO', par: 'PARCEIRO' };
      let found = null;
      for (const name of wb.SheetNames) { const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
        for (let h = 0; h < Math.min(aoa.length, 15); h++) { const hdr = (aoa[h] || []).map(norm), idx = {}; for (const [k, n] of Object.entries(need)) idx[k] = hdr.indexOf(n);
          if (idx.cod >= 0 && idx.sla >= 0 && idx.custo >= 0 && idx.valor >= 0) { found = { name, aoa, h, idx }; break; } }
        if (found) break; }
      if (!found) { t.close(); return PJ.toast('Não encontrei a aba da base. Ela precisa ter as colunas Cód. Venda, VALOR NOTA FISCAL, SLA DE ENTREGA e CUSTO.', 'err'); }
      const { aoa, h, idx } = found, g = (r, k) => idx[k] >= 0 ? r[idx[k]] : null, s = (r, k) => { const v = g(r, k); return v == null ? '' : String(v).trim(); };
      rows = []; for (let i = h + 1; i < aoa.length; i++) { const r = aoa[i]; if (!r || g(r, 'cod') == null || String(g(r, 'cod')).trim() === '') continue;
        rows.push({ cod: g(r, 'cod'), exp: s(r, 'exp'), tipo: s(r, 'tipo'), eq: s(r, 'eq'), emp: s(r, 'emp'), seg: s(r, 'seg'), par: s(r, 'par') || '(sem parceiro)', date: parseDate(g(r, 'date')), valor: num(g(r, 'valor')), custo: num(g(r, 'custo')), sla: parseSla(g(r, 'sla')) }); }
      aba = found.name;
    }
    if (!rows.length) { t.close(); return PJ.toast('A aba foi encontrada, mas não tem linhas de venda.', 'err'); }
    await B.upload(rows, file.name, aba, t);
  } catch (err) { console.error('Erro ao ler o arquivo:', err); t.close(); PJ.toast('Erro ao ler o arquivo. Confira se é a planilha correta.', 'err'); }
};
B.upload = async (rows, fileName, aba, t) => {
  let impId = null, bad = 0;
  const out = rows.map(r => { const d = validDate(r.date); if (r.date && !d) bad++;
    return { cod_venda: String(r.cod).trim().slice(0, 60), tipo_expedicao: r.exp || null, tipo_venda: r.tipo || null, equipe_venda: r.eq || null, filial: r.emp || null, segmento: r.seg || null, transportadora: r.par || null,
      data_referencia: d, valor_nota_fiscal: r2(r.valor), custo_frete: r2(r.custo), sla_segundos: (r.sla != null && isFinite(r.sla) && r.sla >= 0) ? Math.round(r.sla) : null }; });
  try {
    t.set('Preparando envio para o banco…');
    await PJ.q(PJ.sb.from('importacoes').delete().eq('status', 'rascunho'), 'limpar rascunhos');
    const ins = await PJ.q(PJ.sb.from('importacoes').insert({ nome_arquivo: String(fileName).slice(0, 255), aba: aba ? String(aba).slice(0, 255) : null, total_registros: out.length }).select('id').single(), 'criar importação');
    impId = ins.id;
    const LOT = 1000, lots = []; for (let i = 0; i < out.length; i += LOT) lots.push(out.slice(i, i + LOT));
    let next = 0, done = 0;
    const send = async lot => { const payload = lot.map(r => ({ ...r, importacao_id: impId }));
      let { error } = await PJ.sb.from('entregas').insert(payload);
      if (error && !error.code) ({ error } = await PJ.sb.from('entregas').insert(payload)); // falha de rede: 1 nova tentativa
      if (error) throw error; };
    const worker = async () => { while (next < lots.length) { const lot = lots[next++]; await send(lot); done += lot.length;
      t.set(`Enviando para o banco… ${F.int(done)} de ${F.int(out.length)}`); t.progress(done / out.length); } };
    await Promise.all([worker(), worker(), worker()]);
    D.CUR_IMP = impId; await D.loadAll();
    t.close(); PJ.toast(`Rascunho carregado: <b>${F.int(out.length)}</b> registros${aba ? ` da aba “${esc(aba)}”` : ''}. Confira e clique em <b>② Publicar</b>.` + (bad ? `<br>⚠ ${F.int(bad)} datas inválidas ficaram em branco.` : ''), 'ok', { ms: 9000 });
    PJ.pages.configuracoes.update();
  } catch (e) {
    console.error('Erro ao enviar a base:', e);
    if (impId) { const { error: de } = await PJ.sb.from('importacoes').delete().eq('id', impId); if (de) console.error('Erro ao limpar rascunho:', de); }
    D.CUR_IMP = null; t.close(); PJ.toast('Não consegui enviar a base. ' + PJ.friendly(e), 'err');
  }
};
B.publish = async btn => {
  if (!D.CUR_IMP) return;
  if (!await PJ.confirm({ title: 'Publicar base para todos', text: `A base atual será substituída pelo rascunho <b>${esc(D.OPC && D.OPC.importacao ? D.OPC.importacao.nome_arquivo : '')}</b> (${F.int(D.OPC ? D.OPC.total : 0)} registros) para todos os usuários.`, ok: 'Publicar', icon: 'upload' })) return;
  btn && PJ.btnBusy(btn, true, 'Publicando…');
  try { await PJ.rpc('publicar_importacao', { p_importacao_id: D.CUR_IMP }); D.CUR_IMP = null; await D.loadAll();
    PJ.toast('Base publicada. Todos que abrirem o painel já veem estes dados.', 'ok'); PJ.Notif && PJ.Notif.refresh(); PJ.pages.configuracoes.update(); }
  catch (e) { PJ.toast(PJ.friendly(e), 'err'); }
  finally { btn && document.body.contains(btn) && PJ.btnBusy(btn, false); }
};
})();
