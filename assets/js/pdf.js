/* =====================================================================
   PEÇA JÁ · pdf.js — gerador de PDF próprio, 100% no navegador
   ---------------------------------------------------------------------
   Sem bibliotecas externas e sem servidor: usa as fontes padrão do PDF
   (Helvetica / Helvetica-Bold, presentes em todo leitor de PDF) e desenho
   vetorial. Resultado leve, nítido na tela e na impressão, e que funciona
   offline dentro do app instalado (PWA).
   Coordenadas em pontos (1/72"), origem no canto SUPERIOR esquerdo.
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ = window.PJ || {};

// Larguras oficiais (AFM) da Helvetica em WinAnsiEncoding, códigos 32–255 (unidades de 1/1000)
const W_REG=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const W_BOLD=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];

// Caracteres do Windows-1252 entre 0x80 e 0x9F
const CP1252 = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142,
  '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };
const SUBST = { '→': '»', '←': '<', '✓': 'v', '▲': '^', '▼': 'v', ' ': ' ', ' ': ' ', ' ': ' ', '·': '·' };
function toWin(str) {
  str = String(str ?? '').normalize('NFC');
  let out = '';
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c === 9) out += ' ';
    else if (c >= 32 && c < 127) out += ch;
    else if (c >= 160 && c <= 255) out += String.fromCharCode(c);
    else if (CP1252[ch]) out += String.fromCharCode(CP1252[ch]);
    else if (SUBST[ch]) out += toWin(SUBST[ch]);
    else if (c === 10 || c === 13) out += ' ';
    else out += '?';
  }
  return out;
}
const escPdf = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const n = v => (Math.round(v * 100) / 100).toString();
// texto Unicode para metadados (título/autor) — UTF-16BE com BOM
const uniStr = s => '<FEFF' + [...String(s ?? '')].map(ch => { const c = ch.codePointAt(0); if (c > 0xFFFF) { const v = c - 0x10000; return ((0xD800 + (v >> 10)).toString(16) + (0xDC00 + (v & 1023)).toString(16)).toUpperCase(); } return c.toString(16).padStart(4, '0').toUpperCase(); }).join('') + '>';
function rgb(hex) {
  const h = String(hex).replace('#', ''); const f = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  return [0, 2, 4].map(i => (parseInt(f.substr(i, 2), 16) / 255).toFixed(3)).join(' ');
}

class PDF {
  constructor(opts = {}) {
    this.W = opts.width || 595.28; this.H = opts.height || 841.89; // A4
    this.pages = []; this.info = opts; this.cur = null;
  }
  addPage() { this.cur = []; this.pages.push(this.cur); return this; }
  get pageCount() { return this.pages.length; }
  setPage(i) { this.cur = this.pages[i]; return this; }
  _o(s) { this.cur.push(s); }
  // ---- texto ----
  width(str, size = 10, bold = false) {
    const W = bold ? W_BOLD : W_REG, s = toWin(str); let w = 0;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); w += (c >= 32 ? W[c - 32] : 0) || 556; }
    return w * size / 1000;
  }
  wrap(str, size, bold, maxW) {
    const out = [];
    String(str ?? '').split(/\r?\n/).forEach(par => {
      const words = par.split(/\s+/).filter(Boolean); let line = '';
      if (!words.length) { out.push(''); return; }
      words.forEach(w => {
        const t = line ? line + ' ' + w : w;
        if (this.width(t, size, bold) <= maxW) { line = t; return; }
        if (line) out.push(line);
        // palavra maior que a linha: quebra por caracteres
        if (this.width(w, size, bold) > maxW) { let part = ''; for (const ch of w) { if (this.width(part + ch, size, bold) > maxW) { out.push(part); part = ch; } else part += ch; } line = part; }
        else line = w;
      });
      out.push(line);
    });
    return out;
  }
  fit(str, size, bold, maxW) { // corta com reticências para caber
    let s = String(str ?? ''); if (this.width(s, size, bold) <= maxW) return s;
    while (s.length && this.width(s + '…', size, bold) > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }
  text(str, x, y, o = {}) {
    const size = o.size || 10, bold = !!o.bold, s = toWin(str);
    let tx = x; const w = this.width(str, size, bold);
    if (o.align === 'right') tx = x - w; else if (o.align === 'center') tx = x - w / 2;
    this._o(`BT ${rgb(o.color || '#050A34')} rg /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(tx)} ${n(this.H - y)} Td (${escPdf(s)}) Tj ET`);
    return w;
  }
  // parágrafo com quebra automática; retorna o y após o bloco
  para(str, x, y, maxW, o = {}) {
    const size = o.size || 10, lh = o.lh || size * 1.38;
    let lines = this.wrap(str, size, o.bold, maxW);
    if (o.maxLines && lines.length > o.maxLines) { lines = lines.slice(0, o.maxLines); lines[lines.length - 1] = this.fit(lines[lines.length - 1] + ' …', size, o.bold, maxW); }
    lines.forEach((l, i) => this.text(l, x, y + i * lh, o));
    return y + lines.length * lh;
  }
  // ---- formas ----
  _paint(mode) { return mode === 'S' ? 'S' : mode === 'FS' ? 'B' : 'f'; }
  rect(x, y, w, h, o = {}) {
    if (o.fill) this._o(`${rgb(o.fill)} rg`);
    if (o.stroke) this._o(`${rgb(o.stroke)} RG ${n(o.lw || .6)} w`);
    const mode = o.fill && o.stroke ? 'FS' : o.stroke ? 'S' : 'F';
    const r = Math.min(o.r || 0, w / 2, h / 2), Y = this.H - y;
    if (!r) { this._o(`${n(x)} ${n(Y - h)} ${n(w)} ${n(h)} re ${this._paint(mode)}`); return; }
    const k = r * 0.5523;
    this._o([`${n(x + r)} ${n(Y)} m`, `${n(x + w - r)} ${n(Y)} l`, `${n(x + w - r + k)} ${n(Y)} ${n(x + w)} ${n(Y - r + k)} ${n(x + w)} ${n(Y - r)} c`,
      `${n(x + w)} ${n(Y - h + r)} l`, `${n(x + w)} ${n(Y - h + r - k)} ${n(x + w - r + k)} ${n(Y - h)} ${n(x + w - r)} ${n(Y - h)} c`,
      `${n(x + r)} ${n(Y - h)} l`, `${n(x + r - k)} ${n(Y - h)} ${n(x)} ${n(Y - h + r - k)} ${n(x)} ${n(Y - h + r)} c`,
      `${n(x)} ${n(Y - r)} l`, `${n(x)} ${n(Y - r + k)} ${n(x + r - k)} ${n(Y)} ${n(x + r)} ${n(Y)} c`, `h ${this._paint(mode)}`].join(' '));
  }
  line(x1, y1, x2, y2, o = {}) {
    this._o(`${rgb(o.color || '#DCE3F0')} RG ${n(o.lw || .6)} w ${o.cap ? '1 J ' : '0 J '}${o.dash ? `[${o.dash.join(' ')}] 0 d ` : '[] 0 d '}${n(x1)} ${n(this.H - y1)} m ${n(x2)} ${n(this.H - y2)} l S`);
  }
  circle(cx, cy, r, o = {}) {
    const k = r * 0.5523, Y = this.H - cy;
    if (o.fill) this._o(`${rgb(o.fill)} rg`); if (o.stroke) this._o(`${rgb(o.stroke)} RG ${n(o.lw || .8)} w [] 0 d`);
    const mode = o.fill && o.stroke ? 'B' : o.stroke ? 'S' : 'f';
    this._o(`${n(cx + r)} ${n(Y)} m ${n(cx + r)} ${n(Y + k)} ${n(cx + k)} ${n(Y + r)} ${n(cx)} ${n(Y + r)} c ${n(cx - k)} ${n(Y + r)} ${n(cx - r)} ${n(Y + k)} ${n(cx - r)} ${n(Y)} c ${n(cx - r)} ${n(Y - k)} ${n(cx - k)} ${n(Y - r)} ${n(cx)} ${n(Y - r)} c ${n(cx + k)} ${n(Y - r)} ${n(cx + r)} ${n(Y - k)} ${n(cx + r)} ${n(Y)} c ${mode}`);
  }
  polygon(pts, o = {}) { // pts em coordenadas de cima para baixo
    if (o.fill) this._o(`${rgb(o.fill)} rg`);
    this._o(pts.map((p, i) => `${n(p[0])} ${n(this.H - p[1])} ${i ? 'l' : 'm'}`).join(' ') + ' h f');
  }
  // degradê horizontal simulado com faixas finas (compatível com qualquer leitor)
  gradient(x, y, w, h, from, to, steps = 60) {
    const a = from.replace('#', ''), b = to.replace('#', ''), ch = (s, i) => parseInt(s.substr(i, 2), 16);
    const sw = w / steps;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1), c = [0, 2, 4].map(j => Math.round(ch(a, j) + (ch(b, j) - ch(a, j)) * t).toString(16).padStart(2, '0')).join('');
      this.rect(x + i * sw, y, sw + .6, h, { fill: '#' + c });
    }
  }
  // ---- saída ----
  output() {
    const objs = []; const add = s => { objs.push(s); return objs.length; };
    const catalog = add(null), pagesId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const d = new Date(), p2 = v => String(v).padStart(2, '0'), off = -d.getTimezoneOffset();
    const date = `D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}${off >= 0 ? '+' : '-'}${p2(Math.floor(Math.abs(off) / 60))}'${p2(Math.abs(off) % 60)}'`;
    const info = add(`<< /Title ${uniStr(this.info.title || 'PEÇA JÁ')} /Author ${uniStr(this.info.author || 'PEÇA JÁ')} /Subject ${uniStr(this.info.subject || '')} /Creator ${uniStr('PEÇA JÁ · Centro de Controle')} /Producer ${uniStr('PEÇA JÁ · gerador de PDF próprio')} /CreationDate (${date}) >>`);
    const kids = [];
    this.pages.forEach(ops => {
      const content = ops.join('\n');
      const cId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(this.W)} ${n(this.H)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cId} 0 R >>`));
    });
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n%âãÏÓ\n'; const xref = [];
    objs.forEach((o, i) => { xref.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xs = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + xref.map(x => String(x).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xs}\n%%EOF`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }
  blob() { return new Blob([this.output()], { type: 'application/pdf' }); }
}
PJ.PDF = PDF;
})();
