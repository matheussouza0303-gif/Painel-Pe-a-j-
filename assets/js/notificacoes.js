/* =====================================================================
   PEÇA JÁ · notificacoes.js — sino, contador e painel lateral
   Notificações são geradas NO BANCO (triggers e RPCs): nova ação, ação
   concluída, base publicada, mudança de SLA, custo acima da meta,
   usuário liberado/bloqueado, meta alterada. O RLS decide quem vê cada uma.
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, $ = PJ.$, esc = PJ.esc, F = PJ.fmt;
const ICON = { acao_nova: 'rocket', acao_concluida: 'checkc', sla: 'clock', operacional: 'alert', base: 'database', usuario_liberado: 'usercheck', acesso_bloqueado: 'lock', usuario: 'users', config: 'gear' };
const N = PJ.Notif = { data: { itens: [], nao_lidas: 0 }, timer: null };

N.refresh = async () => {
  if (!PJ.sb || !PJ.me) return;
  try { N.data = await PJ.rpc('notificacoes_listar', { p_limite: 40 }) || N.data; N.badge(); if (N.dr) N.renderList(); }
  catch (e) { /* silencioso: o sino não deve atrapalhar o uso */ }
};
N.badge = () => {
  const b = $('#bellBtn'); if (!b) return; const n = +N.data.nao_lidas || 0;
  b.innerHTML = PJ.icon('bell') + (n ? `<span class="dot">${n > 99 ? '99+' : n}</span>` : '');
  b.setAttribute('aria-label', n ? `Notificações: ${n} não lidas` : 'Notificações');
};
N.start = () => { N.badge(); N.refresh(); clearInterval(N.timer); N.timer = setInterval(() => { if (document.visibilityState === 'visible') N.refresh(); }, 60000); };
N.stop = () => { clearInterval(N.timer); N.data = { itens: [], nao_lidas: 0 }; };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && PJ.me) N.refresh(); });

N.renderList = () => {
  const el = N.dr && N.dr.body.querySelector('#ntfList'); if (!el) return;
  const it = N.data.itens || [];
  el.innerHTML = it.length ? it.map((n, i) => `<button type="button" class="ntf ${n.nivel} ${n.lida ? '' : 'unread'}" data-id="${n.id}" data-r="${esc(n.rota || '')}" style="animation:rise .4s var(--ease) both;animation-delay:${Math.min(i, 12) * 35}ms">
    <span class="ic">${PJ.icon(ICON[n.tipo] || 'bell')}</span><span style="min-width:0"><b>${esc(n.titulo)}</b>${n.mensagem ? `<p>${esc(n.mensagem)}</p>` : ''}<small>${F.rel(n.created_at)}</small></span></button>`).join('')
    : PJ.emptyHTML('Nenhuma notificação nos últimos 60 dias.', 'bell');
  el.querySelectorAll('.ntf').forEach(b => b.onclick = async () => {
    const n = it.find(x => x.id === b.dataset.id);
    if (n && !n.lida) { n.lida = true; N.data.nao_lidas = Math.max(0, N.data.nao_lidas - 1); b.classList.remove('unread'); N.badge();
      PJ.rpc('notificacoes_marcar_lidas', { p_ids: [n.id] }).catch(() => {}); }
    if (b.dataset.r) { N.dr.close(); location.hash = '#/' + b.dataset.r; }
  });
};
N.open = () => {
  const foot = PJ.h(`<button class="btn btn-ghost btn-block" type="button">${PJ.icon('check')}Marcar todas como lidas</button>`);
  N.dr = PJ.drawer({ title: 'Notificações', body: '<div id="ntfList" style="display:flex;flex-direction:column;gap:8px"><div class="sk" style="height:70px"></div><div class="sk" style="height:70px"></div></div>', foot, onClose: () => { N.dr = null; } });
  foot.onclick = async () => { try { await PJ.rpc('notificacoes_marcar_lidas', { p_ids: null }); (N.data.itens || []).forEach(n => n.lida = true); N.data.nao_lidas = 0; N.badge(); N.renderList(); } catch (e) { PJ.toast(PJ.friendly(e), 'err'); } };
  N.renderList(); N.refresh();
};
})();
