'use strict';
/* Jarvis-Terminal — Canvas-Chart (Kerzen, Volumen, Overlays, Marker, Crosshair, Pan/Zoom/Pinch) */
{
  const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  class JChart {
  constructor(host, opt = {}) {
    this.host = host; this.opt = opt;
    this.cv = document.createElement('canvas'); host.append(this.cv);
    this.ctx = this.cv.getContext('2d');
    this.c = []; this.o = {}; this.W = 300; this.H = 200; this.priceH = .8; this.lo = 0; this.hi = 1; this.n = 120; this.end = 0; this.hover = null; this.ptr = new Map();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
    const cv = this.cv;
    cv.addEventListener('pointerdown', e => this.down(e));
    cv.addEventListener('pointermove', e => this.move(e));
    cv.addEventListener('pointerup', e => this.up(e));
    cv.addEventListener('pointercancel', e => this.ptr.delete(e.pointerId));
    cv.addEventListener('pointerleave', () => { if (!this.ptr.size) { this.hover = null; this.draw(); this.opt.onHover && this.opt.onHover(null); } });
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.offsetX); }, { passive: false });
    cv.addEventListener('dblclick', () => { this.fit(); });
    this.resize();
  }
  destroy() { this.ro.disconnect(); this.cv.remove(); }
  resize() { const r = this.host.getBoundingClientRect(); if (!r.width || !r.height) return; this.W = Math.max(50, r.width); this.H = Math.max(50, r.height); const d = devicePixelRatio || 1; this.cv.width = this.W * d; this.cv.height = this.H * d; this.ctx.setTransform(d, 0, 0, d, 0, 0); this.draw(); }
  set(c, o = {}, keep = false) {
    const grew = keep && this.c.length && c.length > this.c.length && this.end >= this.c.length - 2;
    const prevLen = this.c.length;
    this.c = c || []; this.o = o;
    if (!keep || !prevLen) this.fit(); else { if (grew) this.end += this.c.length - prevLen; this.clampView(); this.draw(); }
  }
  fit() { const L = this.c.length; this.n = J.clamp(this.opt.bars || (this.W < 520 ? 70 : 130), 20, Math.max(20, L + 6)); this.end = L - 1 + Math.min(6, Math.round(this.n * .05)); this.clampView(); this.draw(); }
  clampView() { const L = this.c.length; this.n = J.clamp(this.n, 15, Math.max(15, L + 20)); this.end = J.clamp(this.end, Math.min(L - 1, this.n * .4), L - 1 + this.n * .35); }
  get pw() { return this.W - 66; } get ph() { return this.H - 26; }
  xi(i) { const bw = this.pw / this.n; return (i - (this.end - this.n + 1) + .5) * bw; }
  ix(x) { const bw = this.pw / this.n; return Math.round(x / bw - .5 + this.end - this.n + 1); }
  zoom(f, x) { const i = x != null ? x / (this.pw / this.n) + this.end - this.n + 1 : this.end; const nn = this.n * f; const frac = x != null ? x / this.pw : 1; this.n = nn; this.end = i + (1 - frac) * nn; this.clampView(); this.draw(); }
  pos(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  down(e) { this.cv.setPointerCapture(e.pointerId); const p = this.pos(e); this.ptr.set(e.pointerId, p); this.drag = { x: p.x, end: this.end, moved: false, n: this.n }; if (this.ptr.size === 2) { const [a, b] = [...this.ptr.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), n: this.n, end: this.end, cx: (a.x + b.x) / 2 }; } }
  move(e) {
    const p = this.pos(e);
    if (this.ptr.has(e.pointerId)) {
      this.ptr.set(e.pointerId, p);
      if (this.ptr.size === 2 && this.pinch) { const [a, b] = [...this.ptr.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); this.n = this.pinch.n * this.pinch.d / Math.max(20, d); const frac = this.pinch.cx / this.pw; const iC = this.pinch.end - this.pinch.n + 1 + frac * this.pinch.n; this.end = iC + (1 - frac) * this.n; this.drag.moved = true; this.clampView(); this.draw(); return; }
      if (this.drag) { const dx = p.x - this.drag.x; if (Math.abs(dx) > 4) this.drag.moved = true; if (this.drag.moved) { this.end = this.drag.end - dx / (this.pw / this.n); this.clampView(); } }
    }
    this.hover = p; this.draw();
    if (this.opt.onHover) { const i = this.ix(p.x); this.opt.onHover(this.c[i] ? i : null); }
  }
  up(e) {
    const wasPinch = this.ptr.size > 1; this.ptr.delete(e.pointerId); if (this.ptr.size < 2) this.pinch = null;
    if (this.drag && !this.drag.moved && !wasPinch && this.opt.onClick) { const p = this.pos(e); if (p.x < this.pw && p.y < this.ph) this.opt.onClick({ i: this.ix(p.x), price: this.py(p.y) }); }
    if (!this.ptr.size) this.drag = null;
    if (e.pointerType !== 'mouse') { this.hover = null; this.draw(); }
  }
  py(y) { return this.hi - (y - 10) / (this.ph * this.priceH - 10) * (this.hi - this.lo); }
  yp(p) { return 10 + (this.hi - p) / (this.hi - this.lo) * (this.ph * this.priceH - 10); }
  draw() {
    const g = this.ctx, W = this.W, H = this.H, c = this.c, o = this.o;
    const cs = getComputedStyle(document.documentElement), col = n => cs.getPropertyValue(n).trim();
    const UP = col('--bull') || '#2fcf9f', DN = col('--bear') || '#ef5d78', LINE = col('--grid') || '#1a2440', MUT = col('--muted') || '#7c88a4', INK = col('--text') || '#e8edf7', PANEL = col('--panel') || '#0d1527';
    g.clearRect(0, 0, W, H);
    if (!c.length) { g.fillStyle = MUT; g.font = '14px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(this.opt.empty || 'Keine Daten geladen', W / 2, H / 2); return; }
    const pw = this.pw, ph = this.ph, bw = pw / this.n;
    const i0 = Math.max(0, Math.floor(this.end - this.n + 1)), i1 = Math.min(c.length - 1, Math.ceil(this.end));
    const vol = o.vol !== false && c.some(b => b.v > 0);
    this.priceH = vol ? .8 : .97;
    let lo = Infinity, hi = -Infinity, vmax = 0;
    for (let i = i0; i <= i1; i++) { lo = Math.min(lo, c[i].l); hi = Math.max(hi, c[i].h); vmax = Math.max(vmax, c[i].v || 0); }
    for (const ln of o.lines || []) for (let i = i0; i <= i1; i++) { const v = ln.v[i]; if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    for (const h of o.hlines || []) if (h.fit) { lo = Math.min(lo, h.p); hi = Math.max(hi, h.p); }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const pad = (hi - lo) * .06 || hi * .01 || 1; this.lo = lo - pad; this.hi = hi + pad;
    const Y = p => this.yp(p), X = i => this.xi(i);
    g.save(); g.beginPath(); g.rect(0, 0, pw, ph); g.clip();
    // Regime-Hintergrund
    if (o.regime) { for (let i = i0; i <= i1; i++) { const r = o.regime[i]; if (!r) continue; g.fillStyle = TA.REG[r][1] + '16'; g.fillRect(X(i) - bw / 2, 0, bw + .6, ph); g.fillStyle = TA.REG[r][1] + 'aa'; g.fillRect(X(i) - bw / 2, 0, bw + .6, 3); } }
    // Raster
    const step = niceStep((this.hi - this.lo) / Math.max(3, Math.floor(ph * this.priceH / 70)));
    g.strokeStyle = LINE; g.lineWidth = 1; g.beginPath();
    const ticks = []; for (let p = Math.ceil(this.lo / step) * step; p <= this.hi; p += step) { const y = Math.round(Y(p)) + .5; g.moveTo(0, y); g.lineTo(pw, y); ticks.push([p, y]); }
    const tt = timeTicks(c, i0, i1, bw, this.opt.tf); for (const [i] of tt) { const x = Math.round(X(i)) + .5; g.moveTo(x, 0); g.lineTo(x, ph); }
    g.stroke();
    // Bänder
    for (const b of o.bands || []) { g.fillStyle = b.color; g.beginPath(); let st = false; for (let i = i0; i <= i1; i++) { if (!isFinite(b.up[i])) continue; st ? g.lineTo(X(i), Y(b.up[i])) : g.moveTo(X(i), Y(b.up[i])); st = true; } for (let i = i1; i >= i0; i--) { if (isFinite(b.lo[i])) g.lineTo(X(i), Y(b.lo[i])); } g.closePath(); g.fill(); }
    // Volumen
    if (vol && vmax > 0) { const vh = ph * .17; for (let i = i0; i <= i1; i++) { const b = c[i], h = (b.v || 0) / vmax * vh; g.fillStyle = (b.c >= b.o ? UP : DN) + '55'; g.fillRect(X(i) - Math.max(1, bw * .36), ph - h, Math.max(1, bw * .72), h); } }
    // Kerzen
    const cw = Math.max(1, bw * .66);
    for (let i = i0; i <= i1; i++) {
      const b = c[i], x = X(i), u = b.c >= b.o; g.strokeStyle = g.fillStyle = u ? UP : DN;
      g.beginPath(); g.moveTo(Math.round(x) + .5, Y(b.h)); g.lineTo(Math.round(x) + .5, Y(b.l)); g.lineWidth = 1; g.stroke();
      const y1 = Y(Math.max(b.o, b.c)), y2 = Y(Math.min(b.o, b.c)); g.fillRect(x - cw / 2, y1, cw, Math.max(1, y2 - y1));
    }
    // Linien
    for (const ln of o.lines || []) { g.strokeStyle = ln.color; g.lineWidth = ln.w || 1.6; g.setLineDash(ln.dash || []); g.beginPath(); let st = false; for (let i = i0; i <= i1; i++) { const v = ln.v[i]; if (!isFinite(v)) { st = false; continue; } st ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); st = true; } g.stroke(); g.setLineDash([]); }
    // Horizontale Linien
    for (const h of o.hlines || []) { if (h.p < this.lo || h.p > this.hi) continue; g.strokeStyle = h.color || '#8a96b0'; g.setLineDash(h.dash || [6, 4]); g.lineWidth = 1.2; const y = Math.round(Y(h.p)) + .5; g.beginPath(); g.moveTo(h.from != null ? X(h.from) : 0, y); g.lineTo(pw, y); g.stroke(); g.setLineDash([]); if (h.label) { g.font = '600 11px Inter, sans-serif'; g.fillStyle = h.color || MUT; g.textAlign = 'left'; g.fillText(h.label, 8, y - 4); } }
    // Marker
    for (const m of o.markers || []) {
      if (m.i < i0 || m.i > i1) continue; const x = X(m.i), b = c[m.i];
      const s = Math.max(5, Math.min(8, bw * .6));
      if (m.type === 'exit') { const y = Y(m.price); g.fillStyle = m.win ? UP : DN; g.strokeStyle = '#0b1120'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, s * .7, 0, 7); g.fill(); g.stroke(); continue; }
      const long = m.side === 1, y = long ? Y(b.l) + 6 : Y(b.h) - 6;
      g.fillStyle = long ? UP : DN; g.beginPath();
      if (long) { g.moveTo(x, y); g.lineTo(x - s, y + s * 1.5); g.lineTo(x + s, y + s * 1.5); } else { g.moveTo(x, y); g.lineTo(x - s, y - s * 1.5); g.lineTo(x + s, y - s * 1.5); }
      g.closePath(); g.fill();
      if (m.link != null && o.markers) { const ex = o.markers.find(z => z.id === m.link); if (ex) { g.strokeStyle = (ex.win ? UP : DN) + '88'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, Y(m.price)); g.lineTo(X(ex.i), Y(ex.price)); g.stroke(); g.setLineDash([]); } }
    }
    // letzter Kurs
    const lb = c[c.length - 1], ly = Math.round(Y(lb.c)) + .5, lcol = lb.c >= (c[c.length - 2]?.c ?? lb.o) ? UP : DN;
    g.strokeStyle = lcol + 'aa'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(0, ly); g.lineTo(pw, ly); g.stroke(); g.setLineDash([]);
    // Crosshair
    let hx = null, hy = null;
    if (this.hover && this.hover.x < pw && this.hover.y < ph) { hx = this.hover.x; hy = this.hover.y; const ci = this.ix(hx); if (c[ci]) hx = X(ci); g.strokeStyle = '#8a96b0aa'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(Math.round(hx) + .5, 0); g.lineTo(Math.round(hx) + .5, ph); g.moveTo(0, Math.round(hy) + .5); g.lineTo(pw, Math.round(hy) + .5); g.stroke(); g.setLineDash([]); }
    g.restore();
    // Achsen
    g.fillStyle = PANEL; g.fillRect(pw, 0, W - pw, H); g.fillRect(0, ph, W, H - ph);
    g.strokeStyle = LINE; g.beginPath(); g.moveTo(pw + .5, 0); g.lineTo(pw + .5, ph); g.moveTo(0, ph + .5); g.lineTo(W, ph + .5); g.stroke();
    g.font = '11.5px Inter, sans-serif'; g.textAlign = 'left'; g.fillStyle = MUT; g.textBaseline = 'middle';
    for (const [p, y] of ticks) if (y > 8 && y < ph * this.priceH) g.fillText(fmtAxis(p, step), pw + 8, y);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    if (W > 300) for (const [i, lab] of tt) { const x = X(i); if (x > 20 && x < pw - 20) g.fillText(lab, x, H - 8); }
    const box = (y, text, bg, fg = '#fff') => { g.fillStyle = bg; const w = W - pw - 4; g.fillRect(pw + 2, y - 10, w, 20); g.fillStyle = fg; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '600 11.5px Inter, sans-serif'; g.fillText(text, pw + 7, y); g.textBaseline = 'alphabetic'; };
    for (const h of o.hlines || []) if (h.p >= this.lo && h.p <= this.hi && h.axis !== false) box(Math.round(Y(h.p)), fmtAxis(h.p, step / 10), h.color || '#3a4566', '#081020');
    if (ly > 0 && ly < ph * this.priceH + 10) box(ly, fmtAxis(lb.c, step / 10), lcol, '#081020');
    if (hy != null) {
      box(hy, fmtAxis(this.py(hy), step / 10), '#2a3558');
      const ci = this.ix(hx); if (c[ci]) { const lab = fullTime(c[ci].t, this.opt.tf); g.font = '600 11.5px Inter, sans-serif'; const tw = g.measureText(lab).width + 14; g.fillStyle = '#2a3558'; g.fillRect(J.clamp(hx - tw / 2, 0, pw - tw), ph + 2, tw, 20); g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(lab, J.clamp(hx, tw / 2, pw - tw / 2), ph + 12); g.textBaseline = 'alphabetic'; }
    }
  }
}
  function niceStep(raw) { const p = 10 ** Math.floor(Math.log10(raw || 1)); const f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
  function fmtAxis(p, step) { const d = step >= 1 ? 2 : Math.min(6, Math.max(2, Math.ceil(-Math.log10(step)) + 1)); return J.num(p, Math.abs(p) >= 1000 ? 2 : d); }
  function intraday(tf) { return ['5m', '15m', '1h', '4h', 'csv'].includes(tf); }
  function fullTime(t, tf) { const d = new Date(t); const ds = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`; return intraday(tf) ? ds + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ds; }
  function timeTicks(c, i0, i1, bw, tf) {
  const every = Math.max(1, Math.ceil(95 / bw)); const out = []; let last = -1e9;
  for (let i = i0; i <= i1; i++) {
    const d = new Date(c[i].t), p = i > 0 ? new Date(c[i - 1].t) : null;
    let lab = null;
    if (intraday(tf)) { if (!p || d.getDate() !== p.getDate()) lab = `${d.getDate()}. ${MON[d.getMonth()]}`; else if (i - last >= every && d.getMinutes() === 0) lab = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
    else if (tf === '1W') { if (!p || d.getFullYear() !== p.getFullYear()) lab = String(d.getFullYear()); else if (d.getMonth() !== p.getMonth() && i - last >= every) lab = MON[d.getMonth()]; }
    else { if (!p || d.getMonth() !== p.getMonth()) lab = d.getMonth() === 0 ? String(d.getFullYear()) : `${MON[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; else if (i - last >= every * 1.6 && bw > 9 && d.getDay() === 1) lab = `${d.getDate()}.`; }
    if (lab && i - last >= every * .8) { out.push([i, lab]); last = i; }
  }
  return out;
}
window.JChart = JChart;

/* Kleine SVG-Helfer: Sparkline, Linien- und Flächenchart */
window.Spark = (vals, color, w = 200, h = 38) => {
  const v = vals.filter(isFinite); if (v.length < 2) return '<svg></svg>';
  const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 3 - (x - lo) / r * (h - 6)).toFixed(1)}`).join(' ');
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><polygon points="0,${h} ${pts} ${w},${h}" fill="url(#${id})"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
};
/* Linienchart auf Canvas: series [{v:[], color, w, fill, label}], x labels optional; zero line */
window.LineChart = (host, series, opt = {}) => {
  const draw = () => {
    host.innerHTML = ''; const cv = document.createElement('canvas'); host.append(cv);
    const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return; const d = devicePixelRatio || 1; cv.width = W * d; cv.height = H * d; const g = cv.getContext('2d'); g.scale(d, d);
    const all = series.flatMap(s => s.v.filter(isFinite)); if (!all.length) { g.fillStyle = '#7c88a4'; g.font = '13px Inter'; g.textAlign = 'center'; g.fillText(opt.empty || 'Noch keine Daten', W / 2, H / 2); return; }
    let lo = Math.min(...all, opt.zero ? 0 : Infinity), hi = Math.max(...all, opt.zero ? 0 : -Infinity); const pad = (hi - lo) * .08 || 1; lo -= pad; hi += pad;
    const L = Math.max(...series.map(s => s.v.length)); const pw = W - 62, ph = H - (opt.labels ? 24 : 8);
    const X = i => 4 + i / Math.max(1, L - 1) * (pw - 8), Y = v => 6 + (hi - v) / (hi - lo) * (ph - 12);
    const st = niceStep((hi - lo) / 4); g.font = '11px Inter, sans-serif'; g.textBaseline = 'middle';
    for (let p = Math.ceil(lo / st) * st; p <= hi; p += st) { const y = Math.round(Y(p)) + .5; g.strokeStyle = Math.abs(p) < st / 1e6 ? '#3a4566' : '#1a2440'; g.beginPath(); g.moveTo(0, y); g.lineTo(pw, y); g.stroke(); g.fillStyle = '#7c88a4'; g.fillText((opt.fmt || (x => J.num(x, st < 1 ? 2 : 0)))(p), pw + 6, y); }
    if (opt.labels) { g.textAlign = 'center'; g.textBaseline = 'alphabetic'; const ev = Math.max(1, Math.ceil(L / (pw / 90))); opt.labels.forEach((lab, i) => { if (i % ev === 0 && lab) g.fillText(lab, X(i), H - 6); }); g.textAlign = 'left'; }
    for (const s of series) {
      g.beginPath(); let started = false; s.v.forEach((v, i) => { if (!isFinite(v)) return; started ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); started = true; });
      g.strokeStyle = s.color; g.lineWidth = s.w || 1.8; g.globalAlpha = s.alpha ?? 1; g.stroke(); g.globalAlpha = 1;
      if (s.fill) { const fi = s.v.findIndex(isFinite); g.lineTo(X(s.v.length - 1), Y(Math.max(lo, opt.zero ? 0 : lo))); g.lineTo(X(fi), Y(Math.max(lo, opt.zero ? 0 : lo))); g.closePath(); const gr = g.createLinearGradient(0, 0, 0, ph); gr.addColorStop(0, s.fill); gr.addColorStop(1, s.fill.slice(0, 7) + '00'); g.fillStyle = gr; g.fill(); }
    }
  };
  draw(); const ro = new ResizeObserver(() => draw()); ro.observe(host); return () => ro.disconnect();
};
}
