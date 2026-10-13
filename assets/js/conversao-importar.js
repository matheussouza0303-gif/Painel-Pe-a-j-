/* =====================================================================
   PEÇA JÁ · conversao-importar.js — botão "Atualizar Base de Conversão".
   [v3.2 · NOVO]
   ---------------------------------------------------------------------
   Processo SEPARADO da base de SLA/custo (admin.js → PJ.Bases):
     tabelas conversao_importacoes / conversao_vendas, permissão
     conversao.importar e função conversao_concluir_importacao.
   Passos: escolher arquivo → ler e validar (Web Worker) → prévia →
   confirmação → envio em lotes (invisível no painel enquanto envia) →
   o banco confere a contagem e troca os dados de uma vez → sucesso.
   Se algo falhar, o envio é apagado e a base atual continua intacta.
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, $ = PJ.$, esc = PJ.esc, F = PJ.fmt;
const IMP = PJ.ConversaoImport = {};
const V = () => encodeURIComponent(PJ.VERSION || '');
const url = p => new URL(p + '?v=' + V(), location.href).href;
let enviando = false;
window.addEventListener('beforeunload', e => { if (enviando) { e.preventDefault(); e.returnValue = ''; } });

// ---------- Leitura (Worker; se não der, na própria página) ----------
const loadScript = src => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('script')); document.head.appendChild(s); });
async function lerNaPagina(buf, nome, prog) {
  if (!window.JSZip) await loadScript(url('assets/vendor/jszip/jszip.min.js'));
  if (!window.ConversaoLeitor) await loadScript(url('assets/js/conversao-leitor.js'));
  return window.ConversaoLeitor.processar(window.JSZip, buf, nome, prog);
}
function lerNoWorker(buf, nome, prog) {
  return new Promise((ok, ko) => {
    let w; try { w = new Worker(url('assets/js/conversao-leitor.js')); } catch (e) { return ko({ semWorker: true }); }
    let falou = false;
    w.onmessage = e => { falou = true; const m = e.data || {};
      if (m.tipo === 'progresso') prog(m.msg, m.p);
      else if (m.tipo === 'fim') { w.terminate(); ok(m.res); }
      else if (m.tipo === 'erro') { w.terminate(); console.error('Leitor:', m.detalhe); ko(new Error(m.msg)); } };
    w.onerror = e => { w.terminate(); if (!falou) ko({ semWorker: true }); else ko(new Error('Não consegui ler o arquivo.')); };
    w.postMessage({ buf, nome, jszip: url('assets/vendor/jszip/jszip.min.js') }, [buf]);
  });
}
// .xls (formato antigo): usa o leitor de Excel da CDN, igual à base de SLA
async function lerXls(buf, nome) {
  if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  if (!window.ConversaoLeitor) await loadScript(url('assets/js/conversao-leitor.js'));
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const nomes = wb.SheetNames.slice().sort((a, b) => (/BD.?CONVERS/i.test(b) ? 1 : 0) - (/BD.?CONVERS/i.test(a) ? 1 : 0));
  let ult = null;
  for (const n of nomes) { const r = ConversaoLeitor.deMatriz(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }), n); if (r.ok) return r; ult = r; }
  return ult || { ok: false, semAba: true, abas: wb.SheetNames };
}
async function ler(file, prog) {
  const nome = file.name, buf = await file.arrayBuffer();
  if (/\.xls$/i.test(nome)) return lerXls(buf, nome);
  if (!/\.(xlsx|xlsm|csv|txt)$/i.test(nome)) throw new Error('Formato não suportado. Envie .xlsx, .xlsm, .xls ou .csv.');
  try { return await lerNoWorker(buf.slice(0), nome, prog); }
  catch (e) { if (e && e.semWorker) return lerNaPagina(buf, nome, prog); throw e; }
}

// ---------- Janela ----------
IMP.abrir = async () => {
  if (!PJ.can('conversao.importar')) return PJ.toast('Seu perfil não pode atualizar a base de conversão.', 'err');
  const body = PJ.h(`<div class="cvi"><div class="cvi-step" id="cviStep"></div></div>`);
  const m = PJ.modal({ title: 'Atualizar Base de Conversão', wide: true, body });
  m.el.querySelector('.modal').classList.add('cvi-modal');
  const fecharOrig = m.close;
  m.el.querySelector('[data-x]').onclick = () => { if (enviando) return PJ.toast('Aguarde o envio terminar.', 'info'); fecharOrig(); };
  passo1(m);
};

// Passo 1: escolher arquivo + histórico
async function passo1(m) {
  const st = m.body.querySelector('#cviStep');
  st.innerHTML = `<p class="cvi-intro">Envie a planilha <b>CONVERSÃO PEÇA JÁ</b> (.xlsx/.xlsm, aba <b>BD_Conversão</b>) ou um <b>.csv</b> com as mesmas colunas.
    Esta atualização é <b>exclusiva da conversão</b>: a base de SLA e custo logístico, usuários e configurações não são alterados.</p>
    <div class="dz" id="cviDz" tabindex="0" role="button" aria-label="Escolher a planilha de conversão">${PJ.icon('upload')}<div style="font-weight:600;margin-top:6px">Escolher ou arrastar a planilha</div><div class="help">.xlsx · .xlsm · .xls · .csv — arquivos grandes são lidos no próprio navegador</div></div>
    <input type="file" id="cviFile" accept=".xlsx,.xlsm,.xls,.csv" hidden>
    <details class="cvi-cols"><summary>Colunas necessárias</summary><p class="help">Obrigatórias: ${COLS_OBRIG.map(c => `<code>${esc(c)}</code>`).join(' ')}.<br>As demais colunas da aba BD_Conversão (segmentos, liderança, vendedor, raio…) alimentam os filtros e gráficos; se faltarem, a importação avisa.</p></details>
    <div class="cvi-hist"><div class="label" style="margin:14px 0 6px">Histórico de atualizações</div><div id="cviHist"><div class="sk" style="height:60px"></div></div></div>`;
  const inp = st.querySelector('#cviFile'), dz = st.querySelector('#cviDz');
  dz.onclick = () => inp.click(); dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) passo2(m, f); };
  inp.onchange = () => { const f = inp.files[0]; if (f) passo2(m, f); };
  try {
    const h = await PJ.q(PJ.sb.from('conversao_importacoes').select('nome_arquivo,status,modo,total_registros,linhas_ativas,linhas_ignoradas,meses,criado_por_nome,created_at,concluida_em')
      .in('status', ['concluida', 'substituida']).order('created_at', { ascending: false }).limit(8), 'histórico conversão');
    const el = st.querySelector('#cviHist'); if (!el) return;
    const SITU = { concluida: '<span class="pill ok">Ativa</span>', substituida: '<span class="pill neutral">Substituída</span>' };
    el.innerHTML = h.length ? `<div class="tw stack"><table><thead><tr><th class="l">Data</th><th class="l">Arquivo</th><th class="l">Meses</th><th>Registros</th><th class="l">Por</th><th>Situação</th></tr></thead><tbody>${h.map(x => `<tr>
      <td class="l" data-label="Data">${esc(F.dateTime(x.concluida_em || x.created_at))}</td><td class="l" data-label="Arquivo">${esc(x.nome_arquivo)}</td>
      <td class="l" data-label="Meses">${esc((x.meses || []).map(d => F.mes(String(d).slice(0, 7))).join(', '))}${x.modo === 'tudo' ? ' <small class="muted">(base inteira)</small>' : ''}</td>
      <td data-label="Registros">${F.int(x.total_registros)}</td>
      <td class="l" data-label="Por">${esc(x.criado_por_nome || '–')}</td><td data-label="Situação">${SITU[x.status] || esc(x.status)}</td></tr>`).join('')}</tbody></table></div>`
      : '<span class="muted">Nenhuma atualização ainda.</span>';
  } catch (e) { const el = st.querySelector('#cviHist'); if (el) el.innerHTML = `<span class="muted">${esc(PJ.friendly(e))}</span>`; }
}
const COLS_OBRIG = ['Cód. Venda', 'Data Referência', 'Tipo Venda', 'Empresa', 'Valor Total Negociado (Div)', 'Venda poderia ir no Same Day?', 'Qtde Vendas Peça Já', 'Qtde Vendas no Critérios'];

// Passo 2: ler, validar e mostrar a prévia
async function passo2(m, file) {
  const st = m.body.querySelector('#cviStep');
  st.innerHTML = `<div class="cvi-prog"><div class="cvi-ptxt" id="cviPt">Lendo <b>${esc(file.name)}</b>…</div><div class="pbar"><i id="cviPb" style="--v:.02"></i></div><div class="help">${F.dec(file.size / 1048576, 1)} MB · a leitura acontece no seu navegador; nada é enviado antes da sua confirmação.</div></div>`;
  const prog = (msg, p) => { const t = st.querySelector('#cviPt'), b = st.querySelector('#cviPb'); if (t) t.innerHTML = esc(msg); if (b) b.style.setProperty('--v', Math.max(.02, Math.min(1, p))); };
  let res;
  try { res = await ler(file, prog); }
  catch (e) { console.error('Leitura conversão:', e); return falha(m, (e && e.message) || 'Não consegui ler o arquivo.'); }
  if (!res.ok) {
    if (res.semAba) return falha(m, `Não encontrei a aba de dados da conversão neste arquivo.${res.abas && res.abas.length ? ` Abas encontradas: ${res.abas.map(esc).join(', ')}.` : ''} A aba precisa ter as colunas ${COLS_OBRIG.map(c => `<b>${esc(c)}</b>`).join(', ')}.`, true);
    return falha(m, `A aba <b>${esc(res.aba || '')}</b> foi encontrada, mas faltam colunas obrigatórias: ${res.faltam.map(c => `<b>${esc(c)}</b>`).join(', ')}.` +
      (res.encontradas && res.encontradas.length ? `<details style="margin-top:8px"><summary>Colunas encontradas no arquivo</summary><p class="help">${res.encontradas.map(esc).join(' · ')}</p></details>` : ''), true);
  }
  if (!res.registros.length) return falha(m, `Nenhuma linha válida para importar.${res.nErros ? ` ${F.int(res.linhasErro)} linha(s) com erro — veja abaixo.` : ''}`, true, res);
  // meses que já existem na base atual (serão substituídos)
  let atuais = {};
  try { const o = await PJ.rpc('conversao_opcoes'); (o.opcoes && o.opcoes.mes || []).forEach(([k, n]) => atuais[k] = +n); IMP._totalAtual = +o.total || 0; } catch (e) { atuais = {}; }
  previa(m, file, res, atuais);
}

function falha(m, msg, voltar, res) {
  const st = m.body.querySelector('#cviStep');
  st.innerHTML = `<div class="form-msg err">${PJ.icon('alert')}<div>${msg}</div></div>${res && res.erros && res.erros.length ? tabelaErros(res) : ''}
    <div class="cvi-acts"><button class="btn btn-ghost" type="button" id="cviVolta">${PJ.icon('chevL')}Escolher outro arquivo</button></div>`;
  st.querySelector('#cviVolta').onclick = () => passo1(m);
}
function tabelaErros(res) {
  return `<div class="cvi-err"><div class="label" style="margin:12px 0 6px">${F.int(res.linhasErro)} linha(s) com erro · ${F.int(res.nErros)} problema(s)${res.erros.length < res.nErros ? ` (mostrando os ${F.int(res.erros.length)} primeiros)` : ''}</div>
    <div class="tw stack cvi-errt"><table><thead><tr><th class="l">Linha</th><th class="l">Coluna</th><th class="l">Valor</th><th class="l">Problema</th></tr></thead><tbody>
    ${res.erros.slice(0, 200).map(e => `<tr><td class="l" data-label="Linha">${F.int(e.linha)}</td><td class="l" data-label="Coluna">${esc(e.campo)}</td><td class="l" data-label="Valor"><code>${esc(e.valor || '(vazio)')}</code></td><td class="l" data-label="Problema">${esc(e.msg)}</td></tr>`).join('')}</tbody></table></div>
    <button class="linkbtn" type="button" data-errcsv style="margin-top:6px">${PJ.icon('download')} Baixar a lista de erros (CSV)</button></div>`;
}
function baixarErros(res) {
  const q = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + ['Linha;Coluna;Valor;Problema', ...res.erros.map(e => [e.linha, e.campo, e.valor, e.msg].map(q).join(';'))].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'erros-importacao-conversao.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

function previa(m, file, res, atuais) {
  const st = m.body.querySelector('#cviStep'), av = res.avisos, R = res.registros;
  const tot = res.porMes.reduce((a, x) => (a.v += x.vendas, a.a += x.aptas, a.p += x.pj, a), { v: 0, a: 0, p: 0 });
  const substitui = res.porMes.filter(x => atuais[x.mes]).reduce((s, x) => s + atuais[x.mes], 0);
  const outros = Object.keys(atuais).filter(k => !res.porMes.some(x => x.mes === k));
  const avisos = [];
  if (res.importantesFaltando.length) avisos.push(`Colunas ausentes (filtros/gráficos ficarão “(vazio)”): <b>${res.importantesFaltando.map(esc).join(', ')}</b>.`);
  if (av.duplicados) avisos.push(`${F.int(av.duplicados)} código(s) de venda repetido(s) no arquivo — mantidos como estão (a planilha também conta cada linha).`);
  if (av.pjSemApta) avisos.push(`${F.int(av.pjSemApta)} linha(s) com “Qtde Vendas Peça Já” maior que “Qtde Vendas no Critérios”.`);
  if (av.statusDivergente) avisos.push(`${F.int(av.statusDivergente)} linha(s) em que o status “VENDA PEÇA JÁ” não bate com “Qtde Vendas Peça Já”.`);
  if (av.mesDivergente) avisos.push(`${F.int(av.mesDivergente)} linha(s) em que “Mês de Data Referência” difere do mês da data — o painel usa a <b>data</b>.`);
  if (av.textoCortado) avisos.push(`${F.int(av.textoCortado)} texto(s) com mais de 300 caracteres foram encurtados.`);
  const prevCols = [['linha', 'Linha'], ['cod_venda', 'Cód. venda'], ['data_referencia', 'Data'], ['unidade', 'Unidade'], ['tipo_venda', 'Tipo venda'], ['segmento_cliente', 'Seg. cliente'], ['criterio_same_day', 'Status Same Day'], ['qtde_criterios', 'Apta'], ['qtde_peca_ja', 'PJ'], ['valor_negociado', 'Valor']];
  st.innerHTML = `<div class="cvi-sum">
      <div><span>Arquivo</span><b>${esc(file.name)}</b><small>aba “${esc(res.aba)}” · cabeçalho na linha ${F.int(res.linhaCabecalho)}</small></div>
      <div><span>Registros a importar</span><b class="num">${F.int(R.length)}</b><small>${F.int(res.linhasLidas)} linhas lidas${res.linhasErro ? ` · <span style="color:var(--bad)">${F.int(res.linhasErro)} com erro</span>` : ''}</small></div>
      <div><span>Período</span><b>${F.date(res.dmin)} a ${F.date(res.dmax)}</b><small>${F.int(res.unidades)} unidades</small></div>
      <div><span>Conversão do arquivo</span><b class="num">${tot.a ? F.pct(tot.p / tot.a, 2) : '–'}</b><small>${F.int(tot.p)} Peça Já de ${F.int(tot.a)} aptas</small></div></div>
    <div class="label" style="margin:14px 0 6px">Meses no arquivo</div>
    <div class="tw stack"><table><thead><tr><th class="l">Mês</th><th>Vendas</th><th>Aptas</th><th>Peça Já</th><th>Conversão</th><th>Faturamento PJ</th><th class="l">Na base atual</th></tr></thead><tbody>
      ${res.porMes.map(x => `<tr><td class="l" data-label="Mês"><b>${esc(F.mesF(x.mes))}</b></td><td data-label="Vendas">${F.int(x.vendas)}</td><td data-label="Aptas">${F.int(x.aptas)}</td><td data-label="Peça Já">${F.int(x.pj)}</td>
        <td data-label="Conversão">${x.aptas ? F.pct(x.pj / x.aptas, 2) : '–'}</td><td data-label="Faturamento PJ">${F.brl(x.fat)}</td>
        <td class="l" data-label="Na base atual">${atuais[x.mes] ? `<span class="pill warn">${PJ.icon('refresh')}substitui ${F.int(atuais[x.mes])}</span>` : '<span class="pill info">novo</span>'}</td></tr>`).join('')}</tbody></table></div>
    ${avisos.length ? `<div class="form-msg info" style="margin-top:12px">${PJ.icon('info')}<div><b>Avisos (não impedem a importação)</b><ul class="cvi-ul">${avisos.map(a => `<li>${a}</li>`).join('')}</ul></div></div>` : ''}
    ${res.nErros ? tabelaErros(res) : ''}
    <details class="cvi-prev"><summary>Prévia das primeiras linhas</summary><div class="tw"><table><thead><tr>${prevCols.map(([, t], i) => `<th class="${i ? '' : 'l'}">${esc(t)}</th>`).join('')}</tr></thead><tbody>
      ${R.slice(0, 8).map(r => `<tr>${prevCols.map(([k], i) => `<td class="${i ? '' : 'l'}">${k === 'data_referencia' ? F.date(r[k]) : k === 'valor_negociado' ? F.brl(r[k]) : esc(r[k] ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
    <div class="cvi-modo" role="radiogroup" aria-label="Como atualizar">
      <label class="cvi-opt"><input type="radio" name="cviModo" value="meses" checked><div><b>Substituir só os meses do arquivo</b> <span class="pill ok">recomendado</span><small>${substitui ? `${F.int(substitui)} registros atuais desses meses serão trocados.` : 'Os meses do arquivo ainda não existem na base.'}${outros.length ? ` Os demais meses (${outros.map(k => F.mes(k)).join(', ')}) continuam como estão.` : ''}</small></div></label>
      <label class="cvi-opt"><input type="radio" name="cviModo" value="tudo"><div><b>Substituir toda a base de conversão</b><small>A base passa a ter somente este arquivo${IMP._totalAtual ? ` (os ${F.int(IMP._totalAtual)} registros atuais saem)` : ''}.</small></div></label></div>
    ${res.linhasErro ? `<label class="rep-check" style="margin-top:10px"><input type="checkbox" id="cviIgn"> Importar mesmo assim, sem as <b>&nbsp;${F.int(res.linhasErro)}&nbsp;</b> linha(s) com erro</label>` : ''}
    <div class="form-msg err" id="cviErr" hidden></div>
    <div class="cvi-acts"><button class="btn btn-ghost" type="button" id="cviVolta">${PJ.icon('chevL')}Escolher outro arquivo</button><div class="grow"></div>
      <button class="btn btn-primary" type="button" id="cviOk" ${res.linhasErro ? 'disabled' : ''}>${PJ.icon('check')}Confirmar e atualizar a base</button></div>`;
  const ok = st.querySelector('#cviOk'), ign = st.querySelector('#cviIgn');
  if (ign) ign.onchange = () => { ok.disabled = !ign.checked; };
  const ec = st.querySelector('[data-errcsv]'); if (ec) ec.onclick = () => baixarErros(res);
  st.querySelector('#cviVolta').onclick = () => passo1(m);
  ok.onclick = async () => {
    const modo = st.querySelector('input[name=cviModo]:checked').value;
    const txt = modo === 'tudo' ? `A base de conversão inteira será substituída por <b>${esc(file.name)}</b> (${F.int(R.length)} registros).` :
      `Os meses ${res.porMes.map(x => '<b>' + esc(F.mes(x.mes)) + '</b>').join(', ')} serão atualizados com <b>${esc(file.name)}</b> (${F.int(R.length)} registros).`;
    if (!await PJ.confirm({ title: 'Confirmar atualização da base de conversão', text: txt + '<br><span class="muted">A base de SLA e custo não é alterada.</span>', ok: 'Atualizar base', icon: 'upload' })) return;
    enviar(m, file, res, modo);
  };
}

// Passo 3: envio + conclusão no banco
async function enviar(m, file, res, modo) {
  const st = m.body.querySelector('#cviStep'), R = res.registros;
  st.innerHTML = `<div class="cvi-prog"><div class="cvi-ptxt" id="cviPt">Preparando o envio…</div><div class="pbar"><i id="cviPb" style="--v:.02"></i></div><div class="help">Não feche esta janela. O painel continua mostrando a base anterior até o fim do envio.</div></div>`;
  const prog = (msg, p) => { const t = st.querySelector('#cviPt'), b = st.querySelector('#cviPb'); if (t) t.innerHTML = msg; if (b) b.style.setProperty('--v', Math.max(.02, Math.min(1, p))); };
  enviando = true; let impId = null, etapa = 'preparação';
  try {
    // [v3.2.1] tudo em passos curtos (o Supabase encerra comandos que passam de ~8 s)
    etapa = 'limpeza de envios anteriores';
    prog('Organizando envios anteriores…', .03);
    await PJ.rpc('conversao_cancelar_envio', { p_id: null });
    await limpar(n => prog(`Organizando envios anteriores… ${F.int(n)} linhas antigas removidas`, .04));
    etapa = 'registro do envio';
    const ins = await PJ.q(PJ.sb.from('conversao_importacoes').insert({ nome_arquivo: String(file.name).slice(0, 255), aba: res.aba ? String(res.aba).slice(0, 255) : null,
      modo, total_registros: R.length, linhas_ignoradas: res.linhasErro || 0 }).select('id').single(), 'criar envio de conversão');
    impId = ins.id;
    const LOT = 500, lots = []; for (let i = 0; i < R.length; i += LOT) lots.push(R.slice(i, i + LOT));
    let next = 0, done = 0;
    // envia um lote; se o banco demorar (tempo limite) ou a rede falhar, divide o lote e tenta de novo
    const send = async (lot, tent = 0) => {
      const payload = lot.map(r => Object.assign({ importacao_id: impId }, r));
      const { error } = await PJ.sb.from('conversao_vendas').insert(payload);
      if (!error) return;
      const lento = error.code === '57014' || !error.code || /timeout|fetch/i.test(error.message || '');
      if (lento && lot.length > 50 && tent < 4) { const h = Math.ceil(lot.length / 2); await send(lot.slice(0, h), tent + 1); await send(lot.slice(h), tent + 1); return; }
      if (lento && tent < 4) { await new Promise(r => setTimeout(r, 800 * (tent + 1))); return send(lot, tent + 1); }
      throw error; };
    const worker = async () => { while (next < lots.length) { const i = next++; etapa = `envio do lote ${i + 1} de ${lots.length}`; await send(lots[i]); done += lots[i].length;
      prog(`Enviando para o banco… <b>${F.int(done)}</b> de ${F.int(R.length)}`, .05 + .8 * done / R.length); } };
    await Promise.all([worker(), worker()]);
    etapa = 'conferência e troca da base';
    prog('Conferindo e gravando a nova base…', .92);
    const r = await PJ.rpc('conversao_concluir_importacao', { p_id: impId });
    enviando = false;
    sucesso(m, file, res, r);
    PJ.Notif && PJ.Notif.refresh && PJ.Notif.refresh();
    PJ.Conversao && PJ.Conversao.recarregar && PJ.Conversao.recarregar();
    // remove as linhas que deixaram de valer, em segundo plano (não afeta o painel)
    limpar().catch(e => console.warn('Limpeza da conversão adiada:', e));
  } catch (e) {
    console.error(`Erro ao enviar a base de conversão (${etapa}):`, e);
    if (impId) { try { await PJ.rpc('conversao_cancelar_envio', { p_id: impId }); limpar().catch(() => {}); } catch (de) { console.error('Erro ao cancelar envio:', de); } }
    enviando = false;
    const msg = /Envio incompleto/i.test(e && e.message || '') ? 'O envio ficou incompleto (conexão instável?). Tente novamente.' : PJ.friendly(e);
    st.innerHTML = `<div class="form-msg err">${PJ.icon('alert')}<div><b>A base de conversão não foi atualizada.</b><br>${esc(msg)}<br><span class="muted">Etapa: ${esc(etapa)}${e && e.code ? ` · código ${esc(e.code)}` : ''}. Os dados que já estavam no painel continuam intactos.</span></div></div>
      <div class="cvi-acts"><button class="btn btn-ghost" type="button" id="cviVolta">${PJ.icon('chevL')}Voltar</button><div class="grow"></div><button class="btn btn-primary" type="button" id="cviTenta">${PJ.icon('refresh')}Tentar de novo</button></div>`;
    st.querySelector('#cviVolta').onclick = () => passo1(m); st.querySelector('#cviTenta').onclick = () => enviar(m, file, res, modo);
  }
}
// Apaga em lotes curtos as linhas que não valem mais (meses substituídos / envios cancelados)
async function limpar(onProg) {
  let total = 0, lote = 5000;
  for (let i = 0; i < 400; i++) {
    let n;
    try { n = await PJ.rpc('conversao_limpar', { p_limite: lote }); }
    catch (e) { if (e && e.code === '57014' && lote > 500) { lote = Math.floor(lote / 2); continue; } throw e; }
    total += n; onProg && onProg(total);
    if (n < lote && n === 0) break;
  }
  return total;
}
function sucesso(m, file, res, r) {
  const st = m.body.querySelector('#cviStep');
  st.innerHTML = `<div class="cvi-ok"><div class="confirm-ic" style="margin:0 auto;background:var(--good-bg);color:var(--good)">${PJ.icon('checkc')}</div>
    <h3>Base de conversão atualizada</h3>
    <p><b>${F.int(r.total_registros)}</b> registros de <b>${esc(file.name)}</b> gravados e conferidos no banco${r.linhas_substituidas ? ` · ${F.int(r.linhas_substituidas)} registros antigos substituídos` : ''}.</p>
    <p class="muted">Meses atualizados: ${(r.meses || []).map(d => esc(F.mesF(String(d).slice(0, 7)))).join(', ')}${res.linhasErro ? ` · ${F.int(res.linhasErro)} linha(s) com erro ficaram de fora` : ''}.</p>
    <div class="cvi-acts" style="justify-content:center"><button class="btn btn-primary" type="button" id="cviFim">${PJ.icon('funnel')}Ver o painel de conversão</button></div></div>`;
  st.querySelector('#cviFim').onclick = () => { m.close(); if (!/#\/conversao/.test(location.hash)) location.hash = '#/conversao'; };
  PJ.toast('Base de conversão atualizada com sucesso.', 'ok');
}
})();
