/* =====================================================================
   PEÇA JÁ · auth.js — Supabase Auth (e-mail + senha), sessão e perfil
   Fluxos: entrar · recuperar senha · primeiro acesso · nova senha.
   Depois do login, iniciar_sessao() traz perfil, status e permissões
   (validadas de novo pelo RLS em cada consulta).
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, $ = PJ.$, esc = PJ.esc;
const Auth = PJ.Auth = {};
const BASE_URL = () => location.origin + location.pathname;

function hideBoot() { const b = $('#boot'); if (b) { b.classList.add('hide'); setTimeout(() => b.remove(), 400); } }
function msg(id, text, type = 'err') { const el = $('#' + id); if (!text) { el.hidden = true; return; } el.className = 'form-msg ' + type; el.innerHTML = PJ.icon(type === 'ok' ? 'checkc' : type === 'info' ? 'info' : 'alert') + `<span>${text}</span>`; el.hidden = false; }
function shake() { const c = $('#loginCard'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
Auth.view = v => { ['login', 'forgot', 'first', 'reset'].forEach(k => $('#lgView-' + k).hidden = k !== v); const f = $('#lgView-' + v + ' input'); f && setTimeout(() => f.focus(), 50); };

Auth.showLogin = (view = 'login') => {
  $('#app').hidden = true; $('#stateScreen').hidden = true; $('#login').hidden = false;
  $('#loginBrand').innerHTML = PJ.brandHTML(false); Auth.view(view); hideBoot();
};
Auth.state = (icon, title, text, danger, canOut = true) => {
  $('#app').hidden = true; $('#login').hidden = true; $('#stateScreen').hidden = false;
  $('#stIc').className = 'confirm-ic' + (danger ? ' danger' : ''); $('#stIc').innerHTML = PJ.icon(icon);
  $('#stTitle').textContent = title; $('#stText').innerHTML = text; $('#stOut').hidden = !canOut; hideBoot();
};

const authErr = e => { const m = String(e && e.message || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha inválidos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/banned/i.test(m)) return 'Seu acesso está bloqueado. Fale com o administrador do sistema.';
  if (/already registered|already been registered/i.test(m)) return 'Este e-mail já tem conta. Use “Entrar” ou “Esqueci minha senha”.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (/Password should be|weak/i.test(m)) return 'Senha fraca: use pelo menos 8 caracteres, misturando letras e números.';
  if (/Signups not allowed|signup is disabled/i.test(m)) return 'O cadastro de novas contas está desativado no projeto. Peça ao administrador para criar seu usuário.';
  if (/fetch|network/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet.';
  return 'Não foi possível concluir. Tente novamente.'; };
const validEmail = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

// ---------- Formulários ----------
document.addEventListener('click', e => { const b = e.target.closest('[data-lgview]'); if (b) { e.preventDefault(); ['lgErr', 'fgMsg', 'faMsg'].forEach(i => msg(i, '')); Auth.view(b.dataset.lgview); } });
$('#fLogin').onsubmit = async e => {
  e.preventDefault(); msg('lgErr', ''); const em = $('#lgEmail').value.trim(), pw = $('#lgPass').value, btn = $('#lgBtn');
  $('#lgEmail').classList.toggle('err', !validEmail(em)); $('#lgPass').classList.toggle('err', !pw);
  if (!validEmail(em) || !pw) { msg('lgErr', 'Informe e-mail e senha.'); shake(); return; }
  PJ.btnBusy(btn, true, 'Entrando…');
  const { error } = await PJ.sb.auth.signInWithPassword({ email: em, password: pw });
  PJ.btnBusy(btn, false);
  if (error) { console.error('Erro de login:', error); msg('lgErr', authErr(error)); shake(); $('#lgPass').select(); return; }
  $('#lgPass').value = '';
};
$('#fForgot').onsubmit = async e => {
  e.preventDefault(); const em = $('#fgEmail').value.trim(), btn = $('#fgBtn');
  if (!validEmail(em)) { $('#fgEmail').classList.add('err'); msg('fgMsg', 'Informe um e-mail válido.'); shake(); return; }
  $('#fgEmail').classList.remove('err'); PJ.btnBusy(btn, true, 'Enviando…');
  const { error } = await PJ.sb.auth.resetPasswordForEmail(em, { redirectTo: BASE_URL() });
  PJ.btnBusy(btn, false);
  if (error && /rate limit|fetch/i.test(error.message)) { msg('fgMsg', authErr(error)); return; }
  if (error) console.error('Erro ao recuperar senha:', error);
  msg('fgMsg', 'Se o e-mail estiver cadastrado, você receberá em instantes um link para criar uma nova senha.', 'ok');
};
$('#fFirst').onsubmit = async e => {
  e.preventDefault(); const nm = $('#faNome').value.trim(), em = $('#faEmail').value.trim().toLowerCase(), pw = $('#faPass').value, btn = $('#faBtn');
  if (!nm || !validEmail(em) || pw.length < 8) { msg('faMsg', !nm ? 'Informe seu nome.' : !validEmail(em) ? 'Informe um e-mail válido.' : 'A senha precisa ter pelo menos 8 caracteres.'); shake(); return; }
  PJ.btnBusy(btn, true, 'Criando…');
  const { data, error } = await PJ.sb.auth.signUp({ email: em, password: pw, options: { data: { nome: nm }, emailRedirectTo: BASE_URL() } });
  PJ.btnBusy(btn, false);
  if (error) { console.error('Erro no primeiro acesso:', error); msg('faMsg', authErr(error)); shake(); return; }
  if (data && data.user && Array.isArray(data.user.identities) && !data.user.identities.length) { msg('faMsg', authErr({ message: 'already registered' })); return; }
  if (!data.session) msg('faMsg', 'Conta criada! Enviamos um e-mail de confirmação. Clique no link e depois entre com sua senha.', 'ok');
};
$('#fReset').onsubmit = async e => {
  e.preventDefault(); const pw = $('#rsPass').value, btn = $('#rsBtn');
  if (pw.length < 8) { msg('rsMsg', 'A senha precisa ter pelo menos 8 caracteres.'); shake(); return; }
  PJ.btnBusy(btn, true, 'Salvando…');
  const { error } = await PJ.sb.auth.updateUser({ password: pw });
  PJ.btnBusy(btn, false);
  if (error) { console.error('Erro ao salvar senha:', error); msg('rsMsg', authErr(error)); return; }
  msg('rsMsg', 'Senha alterada com sucesso.', 'ok'); Auth.recovering = false;
  const { data } = await PJ.sb.auth.getSession(); if (data.session) Auth.start(data.session, true);
};
$('#stOut').onclick = () => Auth.logout();

// ---------- Sessão ----------
let starting = null;
Auth.start = async (session, force) => {
  if (!session) { PJ.me = null; PJ.App && PJ.App.stop(); return Auth.showLogin(); }
  if (Auth.recovering) return Auth.showLogin('reset');
  if (!force && PJ.me && PJ.me._uid === session.user.id) return; // refresh de token: nada muda
  if (starting) return starting;
  starting = (async () => {
    try {
      const me = await PJ.rpc('iniciar_sessao');
      if (!me || me.status === 'sem_sessao') return Auth.showLogin();
      if (me.status !== 'ativo') {
        PJ.me = null;
        if (me.status === 'bloqueado') return Auth.state('lock', 'Acesso bloqueado', 'Seu acesso ao PEÇA JÁ foi bloqueado. Fale com o administrador do sistema.', true);
        return Auth.state('clock', 'Acesso aguardando liberação', `Sua conta <b>${esc(session.user.email)}</b> foi criada, mas ainda não foi liberada. Um administrador precisa ativar seu acesso em Gestão de Acessos.`);
      }
      PJ.me = Object.assign(me, { _uid: session.user.id });
      $('#login').hidden = true; $('#stateScreen').hidden = true; hideBoot();
      PJ.App.start();
    } catch (e) {
      console.error('Erro ao iniciar sessão:', e);
      Auth.state('alert', 'Não foi possível entrar', esc(PJ.friendly(e)), true);
    } finally { starting = null; }
  })();
  return starting;
};
Auth.logout = async () => {
  const { error } = await PJ.sb.auth.signOut();
  if (error) { console.error('Erro ao sair:', error); await PJ.sb.auth.signOut({ scope: 'local' }); }
  PJ.me = null; PJ.App && PJ.App.stop(); Auth.showLogin();
};

// ---------- Menu do usuário / Minha conta ----------
Auth.userMenu = () => {
  const old = $('#userMenu'); if (old) { old.remove(); $('#userBtn').setAttribute('aria-expanded', 'false'); return; }
  const me = PJ.me; if (!me) return;
  const dd = PJ.h(`<div class="dropdown" id="userMenu" role="menu"><div class="head"><span class="avatar">${esc(PJ.fmt.initials(me.nome || me.email))}</span><div style="min-width:0"><b>${esc(me.nome || 'Usuário')}</b><small>${esc(me.email)}</small><div style="margin-top:5px"><span class="role ${me.perfil}">${esc(me.perfil_nome || PJ.PERFIS[me.perfil])}</span></div></div></div>
    <button class="menu-item" type="button" role="menuitem" data-a="conta">${PJ.icon('key')}Alterar minha senha</button>
    ${PJ.can('config.editar') || PJ.can('base.importar') ? `<button class="menu-item" type="button" role="menuitem" data-a="cfg">${PJ.icon('gear')}Configurações</button>` : ''}
    ${PJ.can('usuarios.ver') ? `<button class="menu-item" type="button" role="menuitem" data-a="usr">${PJ.icon('shield')}Gestão de Acessos</button>` : ''}
    <button class="menu-item danger" type="button" role="menuitem" data-a="out">${PJ.icon('logout')}Sair</button></div>`);
  document.body.appendChild(dd); $('#userBtn').setAttribute('aria-expanded', 'true');
  dd.querySelector('.menu-item').focus();
  dd.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; dd.remove();
    ({ conta: Auth.changePass, cfg: () => location.hash = '#/configuracoes', usr: () => location.hash = '#/usuarios', out: Auth.logout })[b.dataset.a](); };
  setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!dd.contains(e.target) && !e.target.closest('#userBtn')) { dd.remove(); $('#userBtn').setAttribute('aria-expanded', 'false'); } document.removeEventListener('mousedown', off); }), 0);
};
Auth.changePass = () => {
  const body = PJ.h(`<form class="grid-form" novalidate><div class="field full"><label for="cpP">Nova senha (mín. 8 caracteres)</label><div class="input-wrap"><input class="input" type="password" id="cpP" autocomplete="new-password"><button type="button" class="icon-btn" data-eye="cpP" aria-label="Mostrar senha">${PJ.icon('eye')}</button></div></div>
    <div class="field full"><label for="cpC">Confirmar nova senha</label><input class="input" type="password" id="cpC" autocomplete="new-password"></div><div class="form-msg err full" id="cpE" hidden></div></form>`);
  PJ.modal({ title: 'Alterar minha senha', body, actions: [{ label: 'Cancelar' }, { label: 'Salvar senha', cls: 'btn-primary', onClick: async ({ close, btn }) => {
    const p = body.querySelector('#cpP').value, c = body.querySelector('#cpC').value, er = body.querySelector('#cpE');
    const fail = m => { er.hidden = false; er.innerHTML = PJ.icon('alert') + esc(m); };
    if (p.length < 8) return fail('A senha precisa ter pelo menos 8 caracteres.'); if (p !== c) return fail('As senhas não conferem.');
    PJ.btnBusy(btn, true, 'Salvando…'); const { error } = await PJ.sb.auth.updateUser({ password: p }); PJ.btnBusy(btn, false);
    if (error) { console.error(error); return fail(authErr(error)); }
    close(); PJ.toast('Senha alterada com sucesso.', 'ok');
  } }] });
};

// ---------- Inicialização ----------
Auth.init = () => {
  if (PJ.secretKey) return Auth.state('alert', 'Configuração insegura', 'Uma chave secreta do Supabase foi colocada no frontend. Troque pela chave <b>anon/publishable</b> em <code>assets/js/config.js</code> e gere uma nova chave secreta no painel do Supabase.', true, false);
  if (!window.supabase) return Auth.state('alert', 'Sem conexão', 'Não foi possível carregar a biblioteca de conexão. Verifique sua internet e recarregue a página.', true, false);
  if (!PJ.configOk) return Auth.state('gear', 'Sistema não configurado', 'Preencha <b>SUPABASE_URL</b> e <b>SUPABASE_ANON_KEY</b> em <code>assets/js/config.js</code> (veja o README).', true, false);
  if (/type=recovery/.test(location.hash)) Auth.recovering = true;
  // Recomendação do supabase-js: não chamar a API dentro do callback (setTimeout evita travar a sessão)
  PJ.sb.auth.onAuthStateChange((ev, session) => setTimeout(() => {
    if (ev === 'PASSWORD_RECOVERY') { Auth.recovering = true; return Auth.showLogin('reset'); }
    if (ev === 'SIGNED_OUT') { PJ.me = null; PJ.App && PJ.App.stop(); return Auth.showLogin(); }
    if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN' || ev === 'USER_UPDATED') Auth.start(session);
  }, 0));
};
})();
