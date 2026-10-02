/* =====================================================================
   PEÇA JÁ · charts.js — gráficos SVG/CSS animados (sem dependências)
   Animações só com transform/opacity/stroke-dashoffset (GPU, leves).
   Barras e donut são "reconciliados": ao trocar filtro, animam do valor
   anterior para o novo em vez de redesenhar do zero.
   ===================================================================== */
(function () {
'use strict';
const PJ = window.PJ, esc = PJ.esc;

// Tooltip padrão: título + linhas chave/valor
PJ.tipHTML = (title, rows = []) => `<b>${esc(title)}</b>` + rows.map(([k, v]) => `<div class="tr"><span>${esc(k)}</span><b>${v}</b></div>`).join('');

// ---------- Barras horizontais ----------
// items: [{key,label,sub,value,display,color,tip}]  opts: {max, ref:{value,label}, empty, cols}
function hbars(el, items, o = {}) {
  if (!el) return;
  if (!items || !items.length) { el.innerHTML = PJ.emptyHTML(o.empty || 'Sem dados nos filtros atuais.'); return; }
  let wrap = el.firstElementChild;
  if (!wrap || !wrap.classList.contains('hb')) { el.innerHTML = ''; wrap = PJ.h('<div class="hb"></div>'); el.appendChild(wrap); }
  if (o.cols) wrap.style.gridTemplateColumns = o.cols;
  const max = o.max || Math.max(...items.map(i => +i.value || 0), o.ref ? o.ref.value : 0) || 1;
  const old = new Map([...wrap.children].map(r => [r.dataset.k, r]));
  const rows = items.map((it, i) => {
    let r = old.get(String(it.key)), fresh = false;
    if (!r) {
      fresh = true;
      r = PJ.h('<div class="hb-row enter"><div class="lab"></div><div class="tr"><div class="bar"></div></div><div class="val num"></div></div>');
      r.dataset.k = it.key; r.style.setProperty('--i', i);
      r.querySelector('.bar').style.setProperty('--v', 0);
    } else old.delete(String(it.key));
    r.querySelector('.lab').innerHTML = esc(it.label ?? it.key) + (it.sub ? `<small>${it.sub}</small>` : '');
    const tr = r.querySelector('.tr'); tr.dataset.tip = it.tip || '';
    tr.setAttribute('aria-label', `${it.label ?? it.key}: ${String(it.display).replace(/<[^>]+>/g, '')}`);
    r.querySelector('.bar').style.backgroundColor = it.color || 'var(--s1)';
    r.querySelector('.val').innerHTML = it.display;
    let rf = tr.querySelector('.ref');
    if (o.ref && isFinite(o.ref.value)) { if (!rf) { rf = PJ.h('<div class="ref"></div>'); tr.appendChild(rf); } rf.style.left = Math.min(100, o.ref.value / max * 100) + '%'; rf.dataset.l = o.ref.label || ''; }
    else if (rf) rf.remove();
    r._v = Math.max(0, Math.min(1, (+it.value || 0) / max)); r._fresh = fresh;
    return r;
  });
  old.forEach(r => r.remove());
  rows.forEach((r, i) => { if (wrap.children[i] !== r) wrap.insertBefore(r, wrap.children[i] || null); });
  PJ.raf2(() => rows.forEach(r => r.querySelector('.bar').style.setProperty('--v', r._v)));
}

// ---------- Donut ----------
// items: [{key,label,value,color,tip}]  opts: {center:{value,fmt,label}, legendValue(it,total)}
function donut(el, items, o = {}) {
  if (!el) return;
  const total = items.reduce((s, i) => s + (+i.value || 0), 0);
  if (!items.length || !total) { el.innerHTML = PJ.emptyHTML(o.empty || 'Sem dados nos filtros atuais.', 'pie'); el._dn = null; return; }
  const R = 78, C = 2 * Math.PI * R, gap = items.length > 1 ? 2.5 : 0;
  if (!el._dn) {
    el.innerHTML = `<div class="donut-wrap"><svg viewBox="0 0 220 220" role="img" aria-label="${esc(o.aria || 'Gráfico de participação')}">
      <circle cx="110" cy="110" r="${R}" fill="none" stroke="rgba(115,198,255,.06)" stroke-width="34"/><g class="arcs"></g>
      <text x="110" y="112" text-anchor="middle" class="donut-c1 num">0</text><text x="110" y="134" text-anchor="middle" class="donut-c2"></text></svg><div class="legend"></div></div>`;
    el._dn = { wrap: el.firstElementChild };
  }
  const wrap = el._dn.wrap, g = wrap.querySelector('.arcs'), lg = wrap.querySelector('.legend');
  const old = new Map([...g.children].map(c => [c.dataset.k, c]));
  let off = 0; const arcs = [];
  items.forEach(it => {
    const len = (+it.value || 0) / total * C;
    let c = old.get(String(it.key));
    if (!c) {
      c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', 'arc'); c.setAttribute('cx', 110); c.setAttribute('cy', 110); c.setAttribute('r', R);
      c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', 34); c.setAttribute('transform', 'rotate(-90 110 110)');
      c.dataset.k = it.key; c.style.strokeDasharray = `0 ${C}`; c.style.strokeDashoffset = -off; g.appendChild(c);
    } else old.delete(String(it.key));
    c.setAttribute('stroke', it.color); c.dataset.tip = it.tip || '';
    arcs.push([c, `${Math.max(len - gap, .01)} ${C}`, -off]); off += len;
  });
  old.forEach(c => { c.style.strokeDasharray = `0 ${C}`; setTimeout(() => c.remove(), 900); });
  PJ.raf2(() => arcs.forEach(([c, da, of]) => { c.style.strokeDasharray = da; c.style.strokeDashoffset = of; }));
  const ce = o.center || {};
  PJ.countUp(wrap.querySelector('.donut-c1'), ce.value != null ? ce.value : total, ce.fmt || PJ.fmt.int);
  wrap.querySelector('.donut-c2').textContent = ce.label || '';
  lg.innerHTML = items.map(it => `<span class="li" data-k="${esc(it.key)}"><i style="background:${it.color}"></i>${esc(it.label ?? it.key)}<b>${o.legendValue ? o.legendValue(it, total) : PJ.fmt.pct(it.value / total, 1)}</b></span>`).join('');
  lg.onmouseover = e => { const li = e.target.closest('.li'); if (!li) return; wrap.classList.add('dim'); lg.classList.add('dim');
    [...g.children].forEach(c => c.classList.toggle('hl', c.dataset.k === li.dataset.k)); [...lg.children].forEach(x => x.classList.toggle('hl', x === li)); };
  lg.onmouseleave = () => { wrap.classList.remove('dim'); lg.classList.remove('dim'); [...g.children].forEach(c => c.classList.remove('hl')); };
}

// ---------- Colunas agrupadas (um único eixo) ----------
// data: [{key,label,values:[..],tips:[..],under:{text,color}}]  opts: {series:[{name,color}], fmtAxis, fmtVal, labels:boolean}
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; }
PJ.niceMax = niceMax;
function columns(el, data, o = {}) {
  if (!el) return;
  if (!data || !data.length) { el.innerHTML = PJ.emptyHTML(o.empty || 'Sem dados nos filtros atuais.', 'barChart'); return; }
  const S = o.series || [{ name: '', color: 'var(--s1)' }];
  const W = Math.max(520, data.length * (S.length > 1 ? 86 : 60) + 80), H = 300, L = 58, B = data.some(d => d.under && d.under.sub) ? 68 : data.some(d => d.under) ? 52 : 36, T = 22, ph = H - T - B;
  const mv = niceMax(Math.max(...data.flatMap(d => d.values.map(v => +v || 0))));
  const fA = o.fmtAxis || (v => PJ.fmt.int(v)), fV = o.fmtVal || fA;
  const gw = (W - L - 10) / data.length, bw = Math.min(46, gw * (S.length > 1 ? .32 : .5));
  const showLab = o.labels !== false && data.length <= 10;
  let s = '';
  for (let i = 0; i <= 4; i++) { const y = T + ph - ph * i / 4; s += `<line class="grid-l" x1="${L}" x2="${W - 6}" y1="${y}" y2="${y}"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" style="font-size:11px">${esc(fA(mv * i / 4))}</text>`; }
  data.forEach((d, i) => {
    const cx = L + gw * i + gw / 2, tot = S.length * bw + (S.length - 1) * 3;
    d.values.forEach((v, j) => {
      const h = Math.max(ph * (+v || 0) / mv, v > 0 ? 2 : 0), x = cx - tot / 2 + j * (bw + 3), y = T + ph - h;
      s += `<rect class="col" x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${S[j].color}" style="animation-delay:${i * 45 + j * 70}ms" data-tip="${esc(d.tips ? d.tips[j] : '')}"/>`;
      if (showLab) s += `<text class="vlab" x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" style="animation-delay:${400 + i * 45}ms">${esc(fV(v))}</text>`;
    });
    s += `<text class="xlab" x="${cx}" y="${T + ph + 18}" text-anchor="middle">${esc(d.label)}</text>`;
    if (d.under) { s += `<text x="${cx}" y="${T + ph + 35}" text-anchor="middle" style="font-size:11px;font-weight:700;fill:${d.under.color || 'var(--muted)'}">${esc(d.under.text)}</text>`;
      if (d.under.sub) s += `<text x="${cx}" y="${T + ph + 50}" text-anchor="middle" style="font-size:10.5px;fill:var(--muted)">${esc(d.under.sub)}</text>`; }
  });
  const lg = S.length > 1 ? `<div class="legend">${S.map(x => `<span class="li"><i style="background:${x.color}"></i>${esc(x.name)}</span>`).join('')}</div>` : '';
  el.innerHTML = `${lg}<div class="tw"><svg class="ch-svg" viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 560)}px" role="img" aria-label="${esc(o.aria || 'Gráfico de colunas')}">${s}</svg></div>`;
}

// ---------- Linha com crosshair ----------
// pts: [{key,label,value,tip}]  opts: {color, fmt, ref:{value,label}, min0}
function line(el, pts, o = {}) {
  if (!el) return;
  pts = (pts || []).filter(p => p.value != null && isFinite(p.value));
  if (pts.length < 1) { el.innerHTML = PJ.emptyHTML(o.empty || 'Sem dados nos filtros atuais.', 'trend'); return; }
  const W = Math.max(520, pts.length * 60 + 80), H = 260, L = 64, B = 34, T = 24, ph = H - T - B, pw = W - L - 18;
  const vals = pts.map(p => +p.value).concat(o.ref && isFinite(o.ref.value) ? [o.ref.value] : []);
  let lo = o.min0 === false ? Math.min(...vals) : 0, hi = Math.max(...vals);
  if (o.min0 === false) { const pad = (hi - lo) * .2 || hi * .1 || 1; lo = Math.max(0, lo - pad); hi = hi + pad; } else hi = niceMax(hi * 1.08);
  const X = i => L + (pts.length === 1 ? pw / 2 : pw * i / (pts.length - 1)), Y = v => T + ph - (v - lo) / (hi - lo || 1) * ph;
  const f = o.fmt || (v => PJ.fmt.int(v)), col = o.color || 'var(--sky)';
  let s = `<defs><linearGradient id="lg${el.id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>`;
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, y = Y(v); s += `<line class="grid-l" x1="${L}" x2="${W - 6}" y1="${y}" y2="${y}"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" style="font-size:11px">${esc(f(v))}</text>`; }
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join('');
  if (pts.length > 1) s += `<path class="area" d="${d}L${X(pts.length - 1)},${T + ph}L${X(0)},${T + ph}Z" fill="url(#lg${el.id})"/>`;
  if (o.ref && isFinite(o.ref.value)) s += `<line class="refl" x1="${L}" x2="${W - 6}" y1="${Y(o.ref.value)}" y2="${Y(o.ref.value)}"/><text x="${W - 8}" y="${Y(o.ref.value) - 6}" text-anchor="end" style="font-size:10.5px;font-weight:700;fill:var(--bad)">${esc(o.ref.label || '')}</text>`;
  s += `<path class="line" pathLength="1" d="${d}" stroke="${col}"/>`;
  const cw = pts.length > 1 ? pw / (pts.length - 1) : pw;
  pts.forEach((p, i) => {
    const x = X(i), y = Y(p.value);
    s += `<g class="pg"><line class="xhair" x1="${x}" x2="${x}" y1="${T}" y2="${T + ph}"/><circle class="pt" cx="${x}" cy="${y}" r="4" fill="var(--bg)" stroke="${col}" stroke-width="2.2" style="animation-delay:${600 + i * 50}ms"/>
      <rect class="hit" x="${x - cw / 2}" y="${T}" width="${cw}" height="${ph}" data-tip="${esc(p.tip || '')}"/></g>
      <text class="xlab" x="${x}" y="${T + ph + 20}" text-anchor="middle">${esc(p.label)}</text>`;
  });
  el.innerHTML = `<div class="tw"><svg class="ch-svg" viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 520)}px" role="img" aria-label="${esc(o.aria || 'Gráfico de linha')}">${s}</svg></div>`;
  el.querySelectorAll('.pg').forEach(g => { g.onmouseenter = () => { g.querySelector('.xhair').style.opacity = 1; g.querySelector('.pt').setAttribute('r', 6); };
    g.onmouseleave = () => { g.querySelector('.xhair').style.opacity = 0; g.querySelector('.pt').setAttribute('r', 4); }; });
}

// ---------- Sparkline ----------
function spark(el, values, color = 'var(--sky)') {
  if (!el) return;
  const v = (values || []).filter(x => x != null && isFinite(x));
  if (v.length < 2) { el.innerHTML = ''; return; }
  const W = Math.max(60, Math.round(el.clientWidth || 120)), H = 30, lo = Math.min(...v), hi = Math.max(...v), rg = hi - lo || 1;
  const pts = v.map((x, i) => [i / (v.length - 1) * W, H - 3 - (x - lo) / rg * (H - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const id = 'sp' + Math.random().toString(36).slice(2, 8);
  el.innerHTML = `<svg class="spark" viewBox="0 0 ${W} ${H}" width="100%" height="30" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".3"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path class="sa" d="${d}L${W},${H}L0,${H}Z" fill="url(#${id})" style="stroke:none"/><path d="${d}" pathLength="1" stroke="${color}"/></svg>`;
}

PJ.charts = { hbars, donut, columns, line, spark };
})();
