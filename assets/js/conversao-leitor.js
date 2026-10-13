/* =====================================================================
   PEÇA JÁ · conversao-leitor.js — leitura e validação da planilha de
   CONVERSÃO (aba BD_Conversão). [v3.2 · NOVO]
   ---------------------------------------------------------------------
   • Roda num Web Worker (o painel não trava com arquivos grandes) e
     também direto na página, se o navegador não permitir Worker.
   • .xlsx/.xlsm: abre o arquivo com JSZip e lê SOMENTE a aba de dados
     e os textos compartilhados (as tabelas dinâmicas e caches da
     planilha, que podem ter centenas de MB, nem são descompactados).
   • .csv: separador ; , ou TAB, UTF-8 ou Windows-1252.
   • Não altera nenhuma regra: só converte tipos e aponta problemas.
   ===================================================================== */
(function (root) {
'use strict';

// ---------- Colunas da aba BD_Conversão ----------
// [coluna no banco, nomes aceitos (normalizados), obrigatória, tipo, nome exibido]
const COLS = [
  ['nome_origem', ['NOMEDAORIGEM'], false, 't', 'Nome da Origem'],
  ['cod_venda', ['CODVENDA'], true, 'cod', 'Cód. Venda'],
  ['data_referencia', ['DATAREFERENCIA'], true, 'date', 'Data Referência'],
  ['mes_texto', ['MESDEDATAREFERENCIA'], false, 't', 'Mês de Data Referência'],
  ['tipo_venda', ['TIPOVENDA'], true, 't', 'Tipo Venda'],
  ['tipo_expedicao', ['TIPOEXPEDICAO'], false, 't', 'Tipo Expedição'],
  ['tipo_servico', ['TIPOSERVICO'], false, 't', 'Tipo Serviço'],
  ['equipe_venda', ['EQUIPEVENDAVENDEDORTITULAR', 'EQUIPEVENDA'], false, 't', 'Equipe Venda (Vendedor Titular)'],
  ['segmentacao_equipe', ['SEGMENTACAOEQUIPEVENDA'], false, 't', 'Segmentação Equipe Venda'],
  ['lideranca', ['LIDERANCAEQUIPEVENDA'], false, 't', 'Liderança Equipe Venda'],
  ['vendedor', ['NOMEVENDEDORVENDEDORTITULAR', 'NOMEVENDEDOR'], false, 't', 'Nome Vendedor (Vendedor Titular)'],
  ['unidade', ['EMPRESA', 'UNIDADEVENDA'], true, 't', 'Empresa'],
  ['uf_empresa', ['UFEMPRESA'], false, 't', 'UF Empresa'],
  ['regiao_empresa', ['REGIAOEMPRESA'], false, 't', 'Região Empresa'],
  ['cod_cliente', ['CODCLIENTE'], false, 'cod', 'Cód. Cliente'],
  ['razao_social_cliente', ['RAZAOSOCIALCLIENTE'], false, 't', 'Razão Social Cliente'],
  ['cidade_cliente', ['CIDADECLIENTE'], false, 't', 'Cidade Cliente'],
  ['uf_cliente', ['UFCLIENTE'], false, 't', 'UF Cliente'],
  ['qtde_produtos', ['QTDEPRODUTOSDIV', 'QTDEPRODUTOS'], false, 'num', 'Qtde Produtos (Div)'],
  ['valor_negociado', ['VALORTOTALNEGOCIADODIV', 'VALORTOTALNEGOCIADO'], true, 'money', 'Valor Total Negociado (Div)'],
  ['produto_ref', ['PRODUTOREF'], false, 't', 'ProdutoREF'],
  ['cod_cliente_final', ['CODCLIENTEFINAL'], false, 'cod', 'Cód. Cliente Final'],
  ['nome_cliente_final', ['NOMECLIENTEFINAL'], false, 't', 'Nome Cliente Final'],
  ['cidade_cliente_final', ['CIDADECLIENTEFINAL'], false, 't', 'Cidade Cliente Final'],
  ['uf_cliente_final', ['UFCLIENTEFINAL'], false, 't', 'UF Cliente Final'],
  ['uf_cidade', ['UFCIDADE'], false, 't', 'UF + Cidade'],
  ['segmento_cliente', ['SEGMENTOCLIENTE'], false, 't', 'Segmento Cliente'],
  ['km_same_day', ['KMSAMEDAYMAISPROXIMO'], false, 'num', 'KM Same Day mais próximo'],
  ['unidade_same_day', ['UNIDADESAMEDAYMAISPROXIMA'], false, 't', 'Unidade Same Day mais próxima'],
  ['classificacao_distancia', ['CLASSIFICACAODISTANCIASAMEDAY'], false, 't', 'Classificação distância Same Day'],
  ['validacao_estoque', ['VALIDACAOESTOQUE'], false, 't', 'Validação Estoque'],
  ['criterio_same_day', ['VENDAPODERIAIRNOSAMEDAY'], true, 't', 'Venda poderia ir no Same Day?'],
  ['raio_km', ['RAIOKM'], false, 't', 'Raio KM'],
  ['qtde_peca_ja', ['QTDEVENDASPECAJA'], true, 'int', 'Qtde Vendas Peça Já'],
  ['qtde_criterios', ['QTDEVENDASNOCRITEIROS', 'QTDEVENDASNOCRITERIOS'], true, 'int', 'Qtde Vendas no Critérios'],
  ['lideranca_grafico', ['LIDERANCAGRAFICO'], false, 't', 'Liderança - grafico'],
];
// Usadas como filtro/gráfico: se faltarem, a importação continua, mas avisa
const IMPORTANTES = ['segmento_cliente', 'segmentacao_equipe', 'lideranca', 'lideranca_grafico', 'equipe_venda', 'vendedor', 'raio_km', 'regiao_empresa'];
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const MAXLEN = 300, MAX_ERROS = 500;

const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const p2 = n => String(n).padStart(2, '0');

// ---------- XML ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeXml(s) {
  if (s.indexOf('&') < 0 && s.indexOf('_x') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] != null ? ENT[e] : m))
          .replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
}
function textOf(xml) { // concatena <t> (ignora a guia fonética <rPh>)
  xml = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '', re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g, m;
  while ((m = re.exec(xml))) out += m[1] || '';
  return decodeXml(out);
}
function colIndex(ref) { let n = 0; for (let i = 0; i < ref.length; i++) { const c = ref.charCodeAt(i); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); } return n - 1; }

// Lê linhas de uma aba (XML). keep: Set de colunas a guardar (null = todas). Para em maxRows.
function readRows(xml, ss, keep, maxRows, onProg) {
  const rows = []; let pos = 0, seq = 0; const L = xml.length;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let nextProg = 0;
  while (true) {
    const a = xml.indexOf('<row', pos); if (a < 0) break;
    const gt = xml.indexOf('>', a); if (gt < 0) break;
    const head = xml.slice(a, gt + 1);
    let rowNum = (head.match(/\sr="(\d+)"/) || [])[1]; rowNum = rowNum ? +rowNum : seq + 1; seq = rowNum;
    if (head.endsWith('/>')) { pos = gt + 1; continue; }
    const b = xml.indexOf('</row>', gt); if (b < 0) break;
    const body = xml.slice(gt + 1, b); pos = b + 6;
    const vals = []; let ci = -1, m; cellRe.lastIndex = 0;
    while ((m = cellRe.exec(body))) {
      const at = m[1]; const r = at.match(/\sr="([A-Z]+)\d*"/); ci = r ? colIndex(r[1]) : ci + 1;
      if (keep && !keep.has(ci)) continue;
      const inner = m[2]; if (inner == null) continue;
      const t = (at.match(/\st="(\w+)"/) || [])[1];
      let v = null;
      if (t === 'inlineStr') v = textOf(inner);
      else { const vm = inner.match(/<v>([\s\S]*?)<\/v>/); if (vm) {
        const raw = vm[1];
        if (t === 's') v = ss[+raw] != null ? ss[+raw] : '';
        else if (t === 'str' || t === 'e' || t === 'd') v = decodeXml(raw);
        else if (t === 'b') v = raw === '1';
        else { const n = Number(raw); v = isFinite(n) ? n : decodeXml(raw); }
      } }
      vals[ci] = v;
    }
    rows.push({ n: rowNum, v: vals });
    if (maxRows && rows.length >= maxRows) break;
    if (onProg && pos > nextProg) { onProg(pos / L); nextProg = pos + L / 50; }
  }
  return rows;
}

function mapHeader(cells) {
  const idx = {}, found = [];
  cells.forEach((c, i) => { if (c == null) return; const n = norm(c); if (!n) return;
    COLS.forEach(([k, alias]) => { if (idx[k] == null && alias.includes(n)) { idx[k] = i; found.push(k); } }); });
  return { idx, found };
}
function findHeader(rows) {
  let best = null;
  rows.forEach((r, i) => { const h = mapHeader(r.v); const score = h.found.length;
    if (score >= 3 && (!best || score > best.score)) best = { row: i, n: r.n, score, map: h.idx, cells: r.v }; });
  return best;
}

// ---------- XLSX ----------
async function lerXlsx(JSZip, buf, prog) {
  prog('Abrindo o arquivo…', 0.02);
  const zip = await JSZip.loadAsync(buf);
  const get = async p => { const f = zip.file(p) || zip.file(p.replace(/^\//, '')); return f ? f.async('string') : null; };
  const wb = await get('xl/workbook.xml'); if (!wb) throw erro('Este arquivo não parece ser uma planilha do Excel (.xlsx/.xlsm).');
  const date1904 = /<workbookPr[^>]*date1904="(1|true)"/.test(wb);
  const rels = (await get('xl/_rels/workbook.xml.rels')) || '';
  const relMap = {}; rels.replace(/<Relationship\b[^>]*>/g, t => { const id = (t.match(/Id="([^"]+)"/) || [])[1], tg = (t.match(/Target="([^"]+)"/) || [])[1]; if (id && tg) relMap[id] = tg; return t; });
  const sheets = []; wb.replace(/<sheet\b[^>]*>/g, t => { const name = decodeXml((t.match(/name="([^"]*)"/) || [])[1] || ''), rid = (t.match(/r:id="([^"]+)"/) || [])[1];
    let tg = relMap[rid] || ''; tg = tg.startsWith('/') ? tg.slice(1) : 'xl/' + tg.replace(/^\.\//, ''); sheets.push({ name, path: tg, hidden: /state="(hidden|veryHidden)"/.test(t) }); return t; });
  // a aba de dados primeiro (BD_Conversão), depois as demais
  sheets.sort((a, b) => (/BD.?CONVERS/i.test(norm(b.name)) ? 1 : 0) - (/BD.?CONVERS/i.test(norm(a.name)) ? 1 : 0));
  prog('Lendo os textos da planilha…', 0.08);
  const ssXml = (await get('xl/sharedStrings.xml')) || '';
  const ss = []; { const re = /<si>([\s\S]*?)<\/si>|<si\/>/g; let m; while ((m = re.exec(ssXml))) ss.push(m[1] ? textOf(m[1]) : ''); }
  for (const sh of sheets) {
    const xml = await get(sh.path); if (!xml) continue;
    const top = readRows(xml, ss, null, 15);
    const h = findHeader(top);
    if (!h || !COLS.filter(c => c[2]).every(c => h.map[c[0]] != null)) { if (h && h.score >= 6) return { aba: sh.name, header: h, rows: null, date1904 }; continue; }
    prog(`Lendo a aba “${sh.name}”…`, 0.12);
    const keep = new Set(Object.values(h.map));
    const all = readRows(xml, ss, keep, 0, p => prog(`Lendo a aba “${sh.name}”…`, 0.12 + p * 0.6));
    return { aba: sh.name, header: h, rows: all.filter(r => r.n > h.n), date1904 };
  }
  return { aba: null, header: null, rows: null, date1904, abas: sheets.map(s => s.name) };
}

// ---------- CSV ----------
function decodeText(buf) {
  const u8 = new Uint8Array(buf);
  let t = new TextDecoder('utf-8').decode(u8);
  if (t.indexOf('�') >= 0) { try { t = new TextDecoder('windows-1252').decode(u8); } catch (e) { /* mantém */ } }
  return t.replace(/^﻿/, '');
}
function lerCsv(buf, prog) {
  prog('Lendo o CSV…', 0.05);
  const txt = decodeText(buf);
  const first = txt.slice(0, txt.indexOf('\n') > 0 ? txt.indexOf('\n') : txt.length);
  const sep = [';', '\t', ','].map(s => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false, n = 1;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && cell === '') { q = true; continue; }
    if (c === sep) { row.push(cell); cell = ''; continue; }
    if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cell); rows.push({ n: n++, v: row }); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push({ n: n++, v: row }); }
  const h = findHeader(rows.slice(0, 15));
  if (!h) return { aba: 'CSV', header: null, rows: null };
  return { aba: 'CSV', header: h, rows: rows.filter(r => r.n > h.n), csv: true };
}

// ---------- Conversão de tipos ----------
function serialToISO(n, d1904) { const d = new Date(Math.round((n - (d1904 ? 24107 : 25569)) * 86400000)); return isFinite(d) ? d.toISOString().slice(0, 10) : null; }
function parseDate(v, d1904) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return serialToISO(v, d1904);
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0];
  if (/^\d+(\.\d+)?$/.test(s)) return serialToISO(+s, d1904);
  return null;
}
function validDate(iso) { if (!iso) return null; const d = new Date(iso + 'T00:00:00Z'), y = +iso.slice(0, 4); return isFinite(d) && d.toISOString().slice(0, 10) === iso && y >= 2000 && y <= 2100 ? iso : null; }
function parseNum(v, csv) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (v == null) return null; let s = String(v).trim().replace(/^R\$\s*/, '').replace(/\s/g, ''); if (s === '' || s === '-') return null;
  if (s.includes(',') && (csv || /\.\d{3}(,|$)/.test(s) || !s.includes('.'))) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s); return isFinite(n) ? n : NaN;
}
function codigo(v) { if (v == null) return ''; if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v); return String(v).trim(); }

// ---------- Validação + normalização ----------
function normalizar(lido, prog) {
  const { header, rows, date1904, csv } = lido;
  const map = header.map, faltam = COLS.filter(c => c[2] && map[c[0]] == null).map(c => c[4]);
  const opcionaisFaltando = COLS.filter(c => !c[2] && map[c[0]] == null).map(c => c[4]);
  const importantesFaltando = COLS.filter(c => IMPORTANTES.includes(c[0]) && map[c[0]] == null).map(c => c[4]);
  if (faltam.length) return { ok: false, faltam, encontradas: (header.cells || []).filter(x => x != null && String(x).trim() !== '').map(String) };
  const registros = [], erros = []; let nErros = 0, linhasErro = 0;
  const avisos = { pjSemApta: 0, duplicados: 0, mesDivergente: 0, statusDivergente: 0, textoCortado: 0 };
  const vistos = new Set(), porMes = {}; let dmin = null, dmax = null; const unidades = new Set();
  const addErro = (linha, campo, valor, msg) => { nErros++; if (erros.length < MAX_ERROS) erros.push({ linha, campo, valor: valor == null ? '' : String(valor).slice(0, 60), msg }); };
  const total = rows.length; let next = 0;
  for (let i = 0; i < total; i++) {
    const r = rows[i], v = r.v;
    if (i >= next) { prog && prog('Validando as linhas…', 0.75 + 0.2 * i / total); next = i + 2000; }
    if (!v || !v.some(x => x != null && String(x).trim() !== '')) continue; // linha em branco
    const rec = { linha: r.n }; let ok = true;
    for (const [k, , req, tipo, nome] of COLS) {
      const ix = map[k], raw = ix == null ? null : v[ix];
      if (tipo === 't') { if (raw == null || raw === '') { rec[k] = null; continue; } let s = String(raw).trim(); if (s.length > MAXLEN) { s = s.slice(0, MAXLEN); avisos.textoCortado++; } rec[k] = s === '' ? null : s;
        if (req && rec[k] == null) { ok = false; addErro(r.n, nome, raw, 'Campo obrigatório vazio'); } continue; }
      if (tipo === 'cod') { const s = codigo(raw).slice(0, 60); rec[k] = s || null; if (req && !s) { ok = false; addErro(r.n, nome, raw, 'Código da venda vazio'); } continue; }
      if (tipo === 'date') { const d = validDate(parseDate(raw, date1904)); rec[k] = d; if (!d) { ok = false; addErro(r.n, nome, raw, raw == null || raw === '' ? 'Data vazia' : 'Data inválida (use DD/MM/AAAA)'); } continue; }
      if (tipo === 'money' || tipo === 'num') { const n = parseNum(raw, csv);
        if (n === null) { rec[k] = tipo === 'money' ? 0 : null; continue; }
        if (isNaN(n)) { ok = false; addErro(r.n, nome, raw, 'Número inválido'); continue; }
        if (Math.abs(n) >= 1e12) { ok = false; addErro(r.n, nome, raw, 'Número grande demais'); continue; }
        rec[k] = Math.round(n * (tipo === 'money' ? 100 : 10000)) / (tipo === 'money' ? 100 : 10000); continue; }
      if (tipo === 'int') { const n = parseNum(raw, csv);
        if (n === null || isNaN(n) || !Number.isInteger(n) || n < 0) { ok = false; addErro(r.n, nome, raw, n === null ? 'Campo vazio (esperado 0 ou 1)' : 'Esperado número inteiro (0 ou 1)'); continue; }
        rec[k] = n; continue; }
    }
    if (!ok) { linhasErro++; continue; }
    // avisos (não bloqueiam; a regra de cálculo continua a da planilha)
    if (rec.qtde_peca_ja > rec.qtde_criterios) avisos.pjSemApta++;
    if (vistos.has(rec.cod_venda)) avisos.duplicados++; else vistos.add(rec.cod_venda);
    const mesIdx = +rec.data_referencia.slice(5, 7) - 1;
    if (rec.mes_texto && MESES.indexOf(norm(rec.mes_texto)) >= 0 && MESES.indexOf(norm(rec.mes_texto)) !== mesIdx) avisos.mesDivergente++;
    if (rec.criterio_same_day && (norm(rec.criterio_same_day) === 'VENDAPECAJA') !== (rec.qtde_peca_ja > 0)) avisos.statusDivergente++;
    const mk = rec.data_referencia.slice(0, 7);
    const pm = porMes[mk] || (porMes[mk] = { mes: mk, vendas: 0, aptas: 0, pj: 0, fat: 0 });
    pm.vendas++; pm.aptas += rec.qtde_criterios; pm.pj += rec.qtde_peca_ja; if (norm(rec.criterio_same_day) === 'VENDAPECAJA') pm.fat += rec.valor_negociado;
    if (!dmin || rec.data_referencia < dmin) dmin = rec.data_referencia; if (!dmax || rec.data_referencia > dmax) dmax = rec.data_referencia;
    if (rec.unidade) unidades.add(rec.unidade);
    registros.push(rec);
  }
  return { ok: true, registros, erros, nErros, linhasErro, avisos, porMes: Object.values(porMes).sort((a, b) => a.mes < b.mes ? -1 : 1),
    dmin, dmax, unidades: unidades.size, opcionaisFaltando, importantesFaltando, linhaCabecalho: header.n };
}

// ---------- Entrada principal ----------
async function processar(JSZip, buf, nome, prog) {
  prog = prog || (() => {});
  const ext = (String(nome).match(/\.(\w+)$/) || [])[1] || '';
  let lido;
  if (/^csv|txt$/i.test(ext)) lido = lerCsv(buf, prog);
  else if (/^xlsx|xlsm$/i.test(ext)) lido = await lerXlsx(JSZip, buf, prog);
  else throw erro('Formato não suportado aqui. Use .xlsx, .xlsm ou .csv.');
  return finalizar(lido, prog);
}
function finalizar(lido, prog) {
  if (!lido.header) return { ok: false, semAba: true, abas: lido.abas || [] };
  if (!lido.rows) { const h = lido.header; return { ok: false, aba: lido.aba, faltam: COLS.filter(c => c[2] && h.map[c[0]] == null).map(c => c[4]), encontradas: (h.cells || []).filter(x => x != null && String(x).trim() !== '').map(String) }; }
  const out = normalizar(lido, prog);
  out.aba = lido.aba; out.linhasLidas = lido.rows.length;
  prog('Pronto.', 1);
  return out;
}
// Para o caminho alternativo (.xls via SheetJS): recebe uma matriz [[...],[...]]
function deMatriz(aoa, aba) {
  const rows = aoa.map((v, i) => ({ n: i + 1, v: v || [] }));
  const h = findHeader(rows.slice(0, 15));
  return finalizar(h ? { aba, header: h, rows: rows.filter(r => r.n > h.n) } : { header: null }, () => {});
}
function erro(m) { const e = new Error(m); e.amigavel = true; return e; }

const API = { COLS, IMPORTANTES, processar, deMatriz, norm, _readRows: readRows };
root.ConversaoLeitor = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;

// ---------- Modo Worker ----------
if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
  root.onmessage = async e => {
    const { buf, nome, jszip } = e.data || {};
    try {
      if (!root.JSZip) importScripts(jszip);
      const res = await processar(root.JSZip, buf, nome, (msg, p) => root.postMessage({ tipo: 'progresso', msg, p }));
      root.postMessage({ tipo: 'fim', res });
    } catch (err) { root.postMessage({ tipo: 'erro', msg: err && err.amigavel ? err.message : 'Não consegui ler o arquivo. Confira se é a planilha de conversão e se não está corrompido.', detalhe: String(err && err.message || err) }); }
  };
}
})(typeof self !== 'undefined' ? self : this);
