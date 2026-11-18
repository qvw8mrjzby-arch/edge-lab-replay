/* Jarvis-Terminal — Second Brain: schwarzes Loch mit Wissens-Netz aus deinen echten Daten; Klick aufs Loch führt ins Terminal (Glas-Design) */
'use strict';
{
  const esc = J.esc;
  const S = window.Space = { open: false, raf: 0 };
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  /* ---------- echte Daten → Cluster ---------- */
  const tradeLabel = t => `${t.sym} ${t.side > 0 ? 'Long' : 'Short'} · ${t.r != null ? (t.r >= 0 ? '+' : '') + J.num(t.r, 2) + 'R' : J.money(t.pnl, 0)}`;
  const recorded = () => { const m = new Map((App.sessions || []).map(s => [s.replayId, s.created])); return t => t.src === 'desk' ? t.exitT : (m.get(t.replay) || null); };
  S.clusters = () => {
    J.loadState();
    const T = J.journal(), sess = App.sessions || [], strat = App.strategies || [], notes = J.S.notes || [], br = J.S.briefings || [], fund = J.S.funded || [];
    const lvl = (typeof Pass !== 'undefined' && Pass.last) ? Pass.last.level : null;
    const mk = [...new Set(['ar:NAS100', 'ar:US500', 'ar:US30', 'ar:GER40', 'ar:XAUUSD', ...(J.S.watch || [])])];
    return [
      { id: 'journal', name: 'Journal', sub: `${T.length} Trades`, go: 'journal', items: T.slice(-180).map(t => ({ label: tradeLabel(t), w: Math.min(2, .6 + Math.abs(t.r || 0) / 2) })) },
      { id: 'sessions', name: 'Backtest-Sessions', sub: `${sess.length} Sessions`, go: 'backtests', items: sess.slice(-120).map(s => ({ label: `${s.sym || 'Session'} · ${s.result && s.result !== 'auto' ? s.result : (s.running ? 'läuft' : 'beendet')}`, w: 1.2 })) },
      { id: 'strat', name: 'Strategien', sub: `${strat.length} Strategien`, go: 'strategien', items: strat.map(s => ({ label: s.name, w: 1.8 })) },
      { id: 'notes', name: 'Research & Notizen', sub: `${notes.length} Notizen`, go: 'research', items: notes.slice(0, 120).map(n => ({ label: n.title || 'Notiz', w: 1.2 })) },
      { id: 'markets', name: 'Märkte', sub: `${mk.length} beobachtet`, go: 'markt', items: mk.map(s => ({ label: J.name(s), w: 1.4 })) },
      { id: 'funded', name: 'Funded-Konten', sub: `${fund.length} Konten`, go: 'funded', items: fund.map(a => ({ label: `${a.name} · ${a.phase}`, w: 1.8 })) },
      { id: 'brief', name: 'Briefings', sub: `${br.length} Briefings`, go: 'briefing', items: br.map(b => ({ label: 'Briefing ' + J.dt(b.t), w: 1.1 })) },
      { id: 'hb', name: 'Handbuch', sub: '10 Kapitel', go: 'handbuch', items: ['Risiko & Größe', 'Prop-Regeln', 'VWAP', 'Volume Profile', 'Orderflow', 'Sessions', 'Setups', 'Sauber backtesten', 'Psychologie', 'Glossar'].map(x => ({ label: x, w: 1 })) },
      { id: 'jarvis', name: 'Jarvis', sub: 'dein Copilot', go: 'copilot', items: (J.S.chat || []).filter(m => m.role === 'user').slice(-60).map(m => ({ label: String(m.content).slice(0, 60), w: 1.3 })) },
      ...((J.S.brain && J.S.brain.areas) || []).map(a => ({ id: 'p-' + a.id, name: a.name, sub: a.sub || `${(a.facts || []).length} Infos`, area: a, items: [...(a.facts || []), ...(a.next || []), ...(a.notes || []).map(n => n.t || n)].map(f => ({ label: String(f).slice(0, 70), w: 1.1 })) })),
      { id: 'pass', name: 'Pass', sub: lvl ? `Level ${lvl}` : 'Fortschritt', go: 'pass', items: Array.from({ length: Math.min(30, lvl || 0) }, (_, i) => ({ label: `Level ${i + 1} erreicht`, w: .9 })) }
    ];
  };

  /* ---------- Szene aufbauen ---------- */
  let cv, g, W = 0, H = 0, DPR = 1, nodes = [], hubs = [], links = [], stars = [], dust = [], amb = [], ambL = [], fog = null, arcs = [];
  let rotA = .4, rotB = .32, spin = true, zoom = 1, t0 = performance.now(), entering = null, hover = null, drag = null, ptrs = new Map(), pinch = null;
  const build = () => {
    const cl = S.clusters(); nodes = []; hubs = []; links = [];
    const n = cl.length;
    cl.forEach((c, k) => {
      const th = k / n * TAU + .3, ph = (k % 2 ? .38 : -.34) + Math.sin(k * 1.7) * .22;
      const dir = [Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph)];
      const dist = 6.2 + (k % 3) * 1.4;
      const hub = { x: dir[0] * dist, y: dir[1] * dist * .8, z: dir[2] * dist, c, k };
      hubs.push(hub);
      const start = nodes.length;
      c.items.forEach((it, i) => {
        const sp = 1.15 + Math.min(1.6, Math.sqrt(c.items.length) * .12);
        nodes.push({ x: hub.x + gauss() * sp, y: hub.y + gauss() * sp * .75, z: hub.z + gauss() * sp, w: it.w, label: it.label, c, tw: Math.random() * TAU });
        if (i > 0) { const j = start + Math.floor(Math.random() * i); links.push([nodes.length - 1, j]); if (Math.random() < .25) links.push([nodes.length - 1, start + Math.floor(Math.random() * i)]); }
      });
    });
    amb = Array.from({ length: 520 }, () => { const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = 3.4 + Math.pow(Math.random(), .8) * 12; return { x: Math.sqrt(1 - u * u) * Math.cos(a) * r, y: u * r * .7, z: Math.sqrt(1 - u * u) * Math.sin(a) * r }; });
    ambL = []; for (let i = 1; i < amb.length; i++) { let best = -1, bd = 1e9; for (let k = 0; k < 14; k++) { const j = Math.floor(Math.random() * i), d = (amb[i].x - amb[j].x) ** 2 + (amb[i].y - amb[j].y) ** 2 + (amb[i].z - amb[j].z) ** 2; if (d < bd) { bd = d; best = j; } } if (bd < 9) ambL.push([i, best]); }
    dust = Array.from({ length: 700 }, () => { const r = 2.2 + Math.pow(Math.random(), 1.6) * 13, a = Math.random() * TAU; return { x: Math.cos(a) * r, y: gauss() * (.25 + r * .09), z: Math.sin(a) * r, s: Math.random() }; });
  };
  const resize = () => {
    DPR = Math.min(devicePixelRatio || 1, innerWidth > 1100 ? 1.5 : 2);
    W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    stars = Array.from({ length: Math.round(W * H / 2600) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.1 + .2, a: Math.random() * .7 + .15, tw: Math.random() * TAU }));
    arcs = [{ r: Math.max(W, H) * .62, a0: -1.1, len: .55, sp: .018 }, { r: Math.max(W, H) * .55, a0: 2.3, len: .7, sp: -.012 }, { r: Math.max(W, H) * .7, a0: .4, len: .35, sp: .01 }, { r: Math.min(W, H) * .58, a0: 4.2, len: .5, sp: -.02 }];
    fog = makeFog(W, H);
  };
  const makeFog = (w, h) => {
    const o = document.createElement('canvas'); o.width = Math.max(1, Math.round(w / 3)); o.height = Math.max(1, Math.round(h / 3)); const x = o.getContext('2d');
    for (let i = 0; i < 26; i++) { const px = Math.random() * o.width, py = Math.random() * o.height, r = rnd(.12, .45) * Math.max(o.width, o.height); const gr = x.createRadialGradient(px, py, 0, px, py, r); const v = 40 + Math.random() * 30; gr.addColorStop(0, `rgba(${v},${v + 4},${v + 12},${rnd(.05, .14)})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, o.width, o.height); }
    return o;
  };

  /* ---------- schwarzes Loch (Gargantua-Stil) ---------- */
  const radial = (x, cx, cy, r0, r1, stops) => { const gr = x.createRadialGradient(cx, cy, r0, cx, cy, r1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r1, 0, TAU); x.fill(); };
  const disk = (x, cx, cy, R, a, front, t, squash) => {
    x.save(); x.beginPath(); front ? x.rect(cx - R * 9, cy, R * 18, R * 3) : x.rect(cx - R * 9, cy - R * 3, R * 18, R * 3); x.clip();
    x.translate(cx, cy); x.rotate(-.035); x.scale(1, squash);
    const gr = x.createRadialGradient(0, 0, R * 1.18, 0, 0, R * 6.4);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.02, `rgba(255,252,240,${a})`); gr.addColorStop(.12, `rgba(255,232,190,${a * .9})`); gr.addColorStop(.35, `rgba(255,190,120,${a * .45})`); gr.addColorStop(.7, `rgba(255,150,70,${a * .14})`); gr.addColorStop(1, 'rgba(255,130,50,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(0, 0, R * 6.4, 0, TAU); x.fill();
    // Doppler: linke Seite heller
    const ln = x.createLinearGradient(-R * 6.4, 0, R * 6.4, 0); ln.addColorStop(0, 'rgba(255,200,140,0)'); ln.addColorStop(.32, `rgba(255,236,200,${a * .35})`); ln.addColorStop(.5, 'rgba(255,236,200,0)');
    x.fillStyle = ln; x.beginPath(); x.arc(0, 0, R * 6.4, 0, TAU); x.fill();
    // Strömung
    x.lineWidth = R * .05;
    for (let i = 0; i < 9; i++) { const rr = R * (1.5 + i * .5), st = t * (.6 - i * .045) + i * 1.7; x.strokeStyle = `rgba(255,240,215,${a * (.22 - i * .018)})`; x.beginPath(); x.arc(0, 0, rr, st, st + .9); x.stroke(); }
    x.restore();
  };
  const drawHole = (x, cx, cy, R, t, fade = 1) => {
    x.save(); x.globalCompositeOperation = 'lighter';
    radial(x, cx, cy, R * .4, R * 8, [[0, `rgba(255,205,140,${.34 * fade})`], [.28, `rgba(255,165,85,${.12 * fade})`], [1, 'rgba(255,150,60,0)']]);
    disk(x, cx, cy, R, .95 * fade, false, t, .095); disk(x, cx, cy, R, .25 * fade, false, t, .24);
    x.save(); x.translate(cx, cy - R * .02); x.scale(1, 1.07);
    radial(x, 0, 0, R * .98, R * 1.95, [[0, `rgba(255,248,232,${.95 * fade})`], [.07, `rgba(255,228,175,${.8 * fade})`], [.3, `rgba(255,178,92,${.26 * fade})`], [1, 'rgba(255,140,50,0)']]);
    x.restore(); x.restore();
    radial(x, cx, cy, R * .86, R * 1.02, [[0, '#000'], [1, 'rgba(0,0,0,0)']]);
    x.fillStyle = '#000'; x.beginPath(); x.arc(cx, cy, R * .9, 0, TAU); x.fill();
    x.save(); x.globalCompositeOperation = 'lighter';
    x.strokeStyle = `rgba(255,244,222,${.9 * fade})`; x.lineWidth = Math.max(1, R * .03); x.beginPath(); x.arc(cx, cy, R * 1.01, 0, TAU); x.stroke();
    disk(x, cx, cy, R, 1.1 * fade, true, t, .095); disk(x, cx, cy, R, .28 * fade, true, t, .24);
    x.restore();
  };

  /* ---------- Projektion & Zeichnen ---------- */
  const proj = (p, R, cx, cy, A, B, Z) => {
    const ca = Math.cos(A), sa = Math.sin(A), cb = Math.cos(B), sb = Math.sin(B);
    const x1 = p.x * ca + p.z * sa, z1 = -p.x * sa + p.z * ca;
    const y2 = p.y * cb - z1 * sb, z2 = p.y * sb + z1 * cb;
    const f = 22 / (22 + z2); return { x: cx + x1 * R * f * Z, y: cy + y2 * R * f * Z, z: z2, f };
  };
  const frame = (now) => {
    if (!S.open) return;
    const x = g, t = (now - t0) / 1000;
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    let Z = zoom, HZ = zoom, fade = 1;
    if (entering) { const k = Math.min(1, (now - entering.t) / 1250); const e = ease(k); Z = zoom * (1 + e * 2.6); fade = 1 - e; HZ = zoom * (1 + e * e * (Math.hypot(W, H) / (Math.min(W, H) * .062) * .62)); if (k >= 1) { finishEnter(); return; } }
    if (spin && !drag && !entering) rotA += .0009;
    const cx = W / 2, cy = H * .5, R = Math.min(W, H) * .062;
    x.fillStyle = '#020306'; x.fillRect(0, 0, W, H);
    if (fog) { x.globalAlpha = 1; x.drawImage(fog, Math.sin(t * .03) * 20 - 20, Math.cos(t * .025) * 14 - 14, W + 40, H + 28); }
    for (const s of stars) { x.globalAlpha = s.a * (.65 + .35 * Math.sin(t * 1.3 + s.tw)); x.fillStyle = '#fff'; x.fillRect(s.x, s.y, s.r, s.r); }
    x.globalAlpha = 1;
    // große Bahnen
    x.lineCap = 'round';
    for (const a of arcs) { const st = a.a0 + t * a.sp; x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 1.2; x.beginPath(); x.arc(cx, cy, a.r * Z ** .35, st, st + a.len); x.stroke(); const ex = cx + Math.cos(st + a.len) * a.r * Z ** .35, ey = cy + Math.sin(st + a.len) * a.r * Z ** .35; x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(ex, ey, 2.2, 0, TAU); x.fill(); }
    const A = rotA, B = rotB;
    const P = nodes.map(p => proj(p, R, cx, cy, A, B, Z)), D = dust.map(p => proj(p, R, cx, cy, A, B, Z)), AM = amb.map(p => proj(p, R, cx, cy, A, B, Z));
    const drawLayer = back => {
      x.globalAlpha = fade; x.lineWidth = .5;
      for (const [i, j] of ambL) { const a = AM[i], b = AM[j]; if ((a.z > 0) !== back) continue; x.strokeStyle = `rgba(210,218,255,${.05 * Math.min(a.f, 1.3)})`; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); }
      for (const a of AM) { if ((a.z > 0) !== back) continue; x.fillStyle = `rgba(235,238,255,${back ? .28 : .5})`; const s = .7 * a.f; x.fillRect(a.x, a.y, s, s); }
      x.lineWidth = .6;
      for (const [i, j] of links) { const a = P[i], b = P[j]; if ((a.z > 0) !== back) continue; x.strokeStyle = `rgba(220,226,255,${.08 * Math.min(a.f, 1.3)})`; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); }
      for (let i = 0; i < D.length; i++) { const d = D[i]; if ((d.z > 0) !== back) continue; x.fillStyle = `rgba(255,${235 - dust[i].s * 40},${210 - dust[i].s * 80},${.25 + dust[i].s * .35})`; const s = .5 + dust[i].s * .9 * d.f; x.fillRect(d.x, d.y, s, s); }
      for (let i = 0; i < P.length; i++) { const p = P[i]; if ((p.z > 0) !== back) continue; const n = nodes[i]; const r = (.7 + n.w * .9) * p.f * Math.min(Z, 2.4); const a = .55 + .45 * Math.sin(t * 1.1 + n.tw); x.fillStyle = `rgba(255,255,255,${(back ? .55 : .9) * a})`; x.beginPath(); x.arc(p.x, p.y, Math.max(.6, r), 0, TAU); x.fill(); if (n.w > 1.5) { x.fillStyle = `rgba(255,255,255,${.12 * a})`; x.beginPath(); x.arc(p.x, p.y, r * 3.2, 0, TAU); x.fill(); } }
    };
    drawLayer(true);
    drawHole(x, cx, cy, R * HZ, t, fade);
    drawLayer(false); x.globalAlpha = 1;
    // Beschriftungen der Gruppen
    S.hits = [];
    if (!entering || Z < 3) for (const h of hubs) {
      const p = proj(h, R, cx, cy, A, B, Z); if (p.x < -60 || p.x > W + 60 || p.y < -40 || p.y > H + 40) continue;
      const al = Math.max(.35, Math.min(1, .55 + p.f * .45)) * (entering ? .4 : 1);
      x.textAlign = 'center'; x.font = `600 ${Math.round(12.5 * Math.min(1.25, p.f))}px Inter, system-ui, sans-serif`; x.fillStyle = `rgba(255,255,255,${al})`; x.fillText(h.c.name, p.x, p.y);
      x.font = `500 ${Math.round(10.5 * Math.min(1.2, p.f))}px Inter, system-ui, sans-serif`; x.fillStyle = `rgba(255,255,255,${al * .5})`; x.fillText(h.c.sub, p.x, p.y + 14);
      S.hits.push({ x: p.x, y: p.y + 4, w: Math.max(80, h.c.name.length * 7.5), h: 34, go: h.c.go, area: h.c.area });
    }
    // Home-Schild unter dem Loch
    if (!entering) { x.font = '600 11.5px Inter, system-ui, sans-serif'; const tw = x.measureText('Eintreten').width + 22; x.fillStyle = 'rgba(30,32,40,.75)'; roundRect(x, cx - tw / 2, cy + R * 1.55, tw, 22, 11); x.fill(); x.fillStyle = 'rgba(255,255,255,.85)'; x.textAlign = 'center'; x.fillText('Eintreten', cx, cy + R * 1.55 + 15); }
    // Tooltip
    if (hover != null && P[hover] && !entering) { const p = P[hover]; x.font = '500 12px Inter, system-ui, sans-serif'; const lab = nodes[hover].label, tw = x.measureText(lab).width + 18; x.fillStyle = 'rgba(16,18,26,.88)'; roundRect(x, p.x + 10, p.y - 30, tw, 24, 8); x.fill(); x.strokeStyle = 'rgba(255,255,255,.14)'; x.stroke(); x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(lab, p.x + 19, p.y - 14); x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(p.x, p.y, 3, 0, TAU); x.fill(); }
    S.P = P; S.holeR = R * HZ; S.cx = cx; S.cy = cy;
    S.raf = requestAnimationFrame(frame);
  };
  const roundRect = (x, a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };

  /* ---------- Hintergrundbild fürs Glas-Design (dein schwarzes Loch, weichgezeichnet) ---------- */
  S.glassBg = () => {
    try {
      const w = Math.min(1800, Math.max(900, innerWidth)), h = Math.round(w * Math.max(.62, innerHeight / Math.max(1, innerWidth)));
      const o = document.createElement('canvas'); o.width = w; o.height = h; const x = o.getContext('2d');
      x.fillStyle = '#030409'; x.fillRect(0, 0, w, h);
      const f = makeFog(w * 3, h * 3); x.drawImage(f, 0, 0, w, h);
      for (let i = 0; i < w * h / 1800; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * .6 + .1})`; const s = Math.random() * 1.3 + .3; x.fillRect(Math.random() * w, Math.random() * h, s, s); }
      x.filter = 'blur(28px)'; drawHole(x, w * .5, h * .46, Math.min(w, h) * .085, 1); x.filter = 'blur(8px)'; drawHole(x, w * .5, h * .46, Math.min(w, h) * .085, 1, .7);
      x.filter = 'none'; x.fillStyle = 'rgba(3,4,9,.32)'; x.fillRect(0, 0, w, h);
      const v = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .2, w / 2, h / 2, Math.max(w, h) * .75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = v; x.fillRect(0, 0, w, h);
      document.documentElement.style.setProperty('--glass-img', `url(${o.toDataURL('image/jpeg', .82)})`);
    } catch (e) { console.warn('Glas-Hintergrund', e); }
  };
  S.setGlass = on => { try { localStorage.setItem('elr.glass', on ? '1' : '0'); } catch { } if (on) { document.documentElement.setAttribute('data-glass', ''); S.glassBg(); } else document.documentElement.removeAttribute('data-glass'); try { readColors(); App.requestRender(); } catch { } };
  S.glassOn = () => { try { return localStorage.getItem('elr.glass') !== '0'; } catch { return true; } };

  /* ---------- Oberfläche der Szene ---------- */
  const el = () => document.getElementById('brainScene');
  const ensure = () => {
    if (el()) return el();
    const d = document.createElement('div'); d.id = 'brainScene'; d.className = 'jt-space'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Second Brain');
    d.innerHTML = `<canvas id="bsCv"></canvas>
      <div class="bs-head"><b>Second Brain</b><small>${esc(J.S.settings.name || 'Eliano')} · Jarvis Terminal</small></div>
      <div class="bs-greet"><h1 id="bsHello"></h1><p id="bsText"></p></div>
      <button class="bs-pill bs-home" id="bsHome">Home</button><button class="bs-pill bs-jarvis" id="bsJarvis"><canvas></canvas>Jarvis</button><button class="bs-pill bs-pagesbtn" id="bsPages">Pages</button>
      <div class="bs-dock"><button id="bsOut" aria-label="Verkleinern">−</button><button id="bsIn" aria-label="Vergrößern">+</button><button id="bsReset" aria-label="Ansicht zurücksetzen">⟲</button><button id="bsPause" aria-label="Drehung pausieren">❚❚</button><button id="bsGlass" aria-label="Glas-Design umschalten" title="Glas-Design">◩</button><button id="bsEnter" class="bs-go">Terminal öffnen</button></div>
      <div class="bs-panel" id="bsPanel" hidden></div>`;
    document.body.append(d);
    cv = d.querySelector('#bsCv'); g = cv.getContext('2d');
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY, a: rotA, b: rotB, moved: false }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; } });
    cv.addEventListener('pointermove', e => {
      if (ptrs.has(e.pointerId)) { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; zoom = J.clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, .55, 2.6); drag.moved = true; return; } if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; rotA = drag.a + dx * .006; rotB = J.clamp(drag.b + dy * .004, -.2, .9); } }
      else if (S.P) { let best = null, bd = 12; S.P.forEach((p, i) => { const d = Math.hypot(p.x - e.clientX, p.y - e.clientY); if (d < bd) { bd = d; best = i; } }); hover = best; cv.style.cursor = best != null || overHole(e) || hitLabel(e) ? 'pointer' : 'grab'; }
    });
    const end = e => { const was = drag; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null; if (was && !was.moved && e.type === 'pointerup') click(e); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', e => { e.preventDefault(); zoom = J.clamp(zoom * (e.deltaY > 0 ? .92 : 1.08), .55, 2.6); }, { passive: false });
    d.querySelector('#bsIn').onclick = () => { zoom = J.clamp(zoom * 1.15, .55, 2.6); };
    d.querySelector('#bsOut').onclick = () => { zoom = J.clamp(zoom / 1.15, .55, 2.6); };
    d.querySelector('#bsReset').onclick = () => { zoom = 1; rotA = .4; rotB = .32; };
    d.querySelector('#bsPause').onclick = e => { spin = !spin; e.currentTarget.textContent = spin ? '❚❚' : '▶'; };
    d.querySelector('#bsGlass').onclick = () => { const on = !S.glassOn(); S.setGlass(on); J.toast(on ? 'Glas-Design an' : 'Glas-Design aus'); };
    d.querySelector('#bsEnter').onclick = () => S.enter();
    d.querySelector('#bsHome').onclick = () => panel('home');
    d.querySelector('#bsJarvis').onclick = () => S.enter('copilot');
    try { Jarvis.orb(d.querySelector('#bsJarvis canvas'), false); } catch { }
    d.querySelector('#bsPages').onclick = () => panel('pages');
    addEventListener('resize', () => { if (S.open) resize(); });
    document.addEventListener('keydown', e => { if (!S.open) return; if (e.key === 'Escape') { if (!d.querySelector('#bsPanel').hidden) panel(null); else S.enter(); } if (e.key === 'Enter' && document.activeElement === document.body) S.enter(); });
    return d;
  };
  const overHole = e => S.holeR && Math.hypot(e.clientX - S.cx, e.clientY - S.cy) < S.holeR * 2.2;
  const hitLabel = e => (S.hits || []).find(h => Math.abs(e.clientX - h.x) < h.w / 2 && Math.abs(e.clientY - h.y) < h.h / 2);
  const click = e => {
    if (entering) return;
    if (overHole(e)) return S.enter();
    const h = hitLabel(e); if (h) return h.area ? panel('area', h.area) : S.enter(h.go);
    if (hover != null) { const n = nodes[hover]; return n.c.area ? panel('area', n.c.area) : S.enter(n.c.go); }
  };
  S.enter = (target) => { if (entering) return; panel(null); entering = { t: performance.now(), target: target || S.target || 'markt' }; el()?.classList.add('entering'); };
  const finishEnter = () => {
    const tgt = entering.target; entering = null;
    const d = el(); d.classList.add('out'); S.leaving = true;
    if (location.hash.slice(1) !== tgt) location.hash = '#' + tgt; else if (typeof UI !== 'undefined') UI.route();
    setTimeout(() => { S.close(); d.classList.remove('out', 'entering'); }, 520);
  };
  S.show = (target) => {
    const d = ensure(); S.target = target || S.target || 'markt';
    build(); d.hidden = false; d.classList.remove('out'); S.open = true; resize(); greet(); panel(null);
    document.body.classList.add('brain-open');
    cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(frame);
  };
  S.close = () => { S.leaving = false; S.open = false; cancelAnimationFrame(S.raf); const d = el(); if (d) d.hidden = true; document.body.classList.remove('brain-open'); };

  /* ---------- Begrüßung mit echten Zahlen ---------- */
  const greet = async () => {
    const day = new Date().toLocaleDateString('de-DE', { weekday: 'long', timeZone: 'Europe/Berlin' });
    J.$('#bsHello', el()).textContent = `Schönen ${day}, ${J.S.settings.name || 'Eliano'}.`;
    const T = J.journal(), st = TA.journalStats(T), sess = (App.sessions || []).slice().sort((a, b) => (b.created || 0) - (a.created || 0));
    const parts = [];
    if (T.length) parts.push(`Dein Journal hat ${T.length} Trades mit ${J.money(st.net, 0)} netto und ${J.num(st.winRate, 0)} % Trefferquote.`);
    else parts.push('Dein Journal ist noch leer – starte eine Backtest-Session oder einen Trade im Handels-Desk.');
    if (sess[0]) parts.push(`Letzte Backtest-Session: ${sess[0].sym || 'Markt'} am ${J.date(sess[0].created * 1000)}.`);
    if (typeof Pass !== 'undefined' && Pass.last) parts.push(`Pass: Level ${Pass.last.level}.`);
    const ar = (J.S.brain && J.S.brain.areas) || []; if (ar.length) parts.push(`${ar.length} Lebensbereiche im Gehirn.`);
    if ((J.S.funded || []).length) parts.push(`${J.S.funded.length} Funded-Konto${J.S.funded.length > 1 ? 'en' : ''} im Tracker.`);
    const box = J.$('#bsText', el()); box.textContent = parts.join(' ');
    try { const d = await J.load('ar:NAS100', '1T'); const q = J.quote(d); parts.push(`Nasdaq 100 steht bei ${J.price(q.last)} (${J.pct(q.chp)} zum Vortag).`); } catch { }
    try { const c = await J.getJSON('calendar.json'); const td = J.today(); const ev = (c.events || []).filter(e => e.impact === 'High' && J.dayOf(Date.parse(e.date) / 1000) === td); if (ev.length) parts.push(`Heute ${ev.length} wichtige${ev.length > 1 ? '' : 'r'} Termin${ev.length > 1 ? 'e' : ''}: ${ev.slice(0, 2).map(e => `${new Date(e.date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} ${e.country} ${e.title}`).join(', ')}.`); } catch { }
    if (S.open) box.textContent = parts.join(' ');
  };

  /* ---------- Glas-Panels: Home & Pages ---------- */
  const spark = (vals, col) => { const m = Math.max(1, ...vals); return `<div class="bs-bars">${vals.map(v => `<i style="height:${Math.max(6, v / m * 100)}%;background:${col}"></i>`).join('')}</div>`; };
  const weeks = (times, n = 8) => { const now = Date.now() / 1000, out = new Array(n).fill(0); for (const t of times) { if (!t) continue; const k = Math.floor((now - t) / 604800); if (k >= 0 && k < n) out[n - 1 - k]++; } return out; };
  const AREAS = () => J.NAV_ALL;
  J.NAV_ALL = [['Markt', [['markt', 'Marktüberblick'], ['briefing', 'Morning Briefing'], ['explorer', 'Markt-Explorer'], ['charts', 'Charts & Replay'], ['news', 'News Intelligence'], ['makro', 'Makroökonomie']]], ['Handel', [['desk', 'Handels-Desk'], ['funded', 'Funded-Tracker'], ['journal', 'Journal'], ['stats', 'Statistik'], ['risk', 'Risk Command']]], ['Research', [['backtests', 'Backtests'], ['analyse', 'Analyse'], ['strategien', 'Strategien'], ['quant', 'Quant Lab'], ['regime', 'Marktregime'], ['research', 'Research Desk'], ['copilot', 'Intelligence Copilot']]], ['Wissen & Fortschritt', [['start', 'Übersicht'], ['handbuch', 'Handbuch'], ['tradingview', 'TradingView'], ['pass', 'Pass'], ['shop', 'Shop']]]];
  const panel = (which, area) => {
    const p = el()?.querySelector('#bsPanel'); if (!p) return;
    if (!which || (p.dataset.k === which && which !== 'area' && !p.hidden)) { p.hidden = true; p.dataset.k = ''; return; }
    p.dataset.k = which; p.hidden = false;
    if (which === 'area' && area) {
      const sec = (t, arr, cls) => arr && arr.length ? `<div class="bs-box"><h5>${t}</h5>${arr.map(x => `<div class="bs-fact ${cls || ''}">${esc(typeof x === 'string' ? x : x.t)}${x.d ? `<small>${esc(J.dt(x.d))}</small>` : ''}</div>`).join('')}</div>` : '';
      p.innerHTML = `<div class="bs-ph"><b>${esc(area.name)}</b><span class="bs-tag">${esc(area.sub || '')}</span><span class="sp"></span><button class="bs-x" aria-label="Schließen">✕</button></div>
        ${area.summary ? `<p class="bs-sum">${esc(area.summary)}</p>` : ''}
        <div class="bs-grid2">${sec('Stand', area.facts)}${sec('Nächste Schritte', area.next, 'next')}</div>
        ${area.links && area.links.length ? `<div class="bs-links">${area.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.t)} ↗</a>`).join('')}</div>` : ''}
        <div class="bs-grid2" style="margin-top:12px">${sec('Deine Notizen', area.notes)}<div class="bs-box"><h5>Notiz hinzufügen</h5><textarea id="bsNote" placeholder="Idee, Stand, To-do …"></textarea><div class="row" style="display:flex;gap:8px;margin-top:8px"><button class="bs-btn" id="bsNoteSave">Speichern</button><button class="bs-btn gold" id="bsAsk">Jarvis dazu fragen</button>${area.go ? `<button class="bs-btn" data-go="${esc(area.go)}">Im Terminal öffnen</button>` : ''}</div></div></div>`;
      p.querySelector('#bsNoteSave').onclick = () => { const v = p.querySelector('#bsNote').value.trim(); if (!v) return; (area.notes = area.notes || []).unshift({ t: v, d: Date.now() }); J.store.save('brain'); build(); panel('area', area); J.toast('Notiz gespeichert', 'good'); };
      p.querySelector('#bsAsk').onclick = () => { try { sessionStorage.setItem('jt.prefill', `Zu meinem Bereich „${area.name}“: Was sind die nächsten sinnvollen Schritte? Nutze, was du darüber weißt.`); } catch { } S.enter('copilot'); };
    } else if (which === 'pages') {
      p.innerHTML = `<div class="bs-ph"><b>Pages</b><span class="sp"></span><button class="bs-x" aria-label="Schließen">✕</button></div><div class="bs-pages">${((J.S.brain && J.S.brain.areas) || []).length ? `<div><h6>Dein Leben</h6>${J.S.brain.areas.map((a, i) => `<button data-area="${i}">${esc(a.name)}</button>`).join('')}</div>` : ''}${AREAS().map(([g2, items]) => `<div><h6>${g2}</h6>${items.map(([v, l]) => `<button data-go="${v}">${l}</button>`).join('')}</div>`).join('')}</div>`;
    } else {
      const T = J.journal(), rec = recorded(), sess = App.sessions || [], strat = App.strategies || [], notes = J.S.notes || [], br = J.S.briefings || [];
      const tTimes = T.map(rec), wk = Date.now() / 1000 - 604800;
      const stratCount = {}; T.forEach(t => { const k = t.setup || 'ohne Strategie'; stratCount[k] = (stratCount[k] || 0) + 1; });
      const sc = Object.entries(stratCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
      const mk = {}; T.forEach(t => { mk[t.sym] = (mk[t.sym] || 0) + (t.pnl || 0); }); const mks = Object.entries(mk).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6); const mmax = Math.max(1, ...mks.map(x => Math.abs(x[1])));
      const days = new Array(30).fill(0); const now = Date.now() / 1000; [...sess.map(s => s.created), ...T.filter(t => t.src === 'desk').map(t => t.exitT)].forEach(t => { if (!t) return; const k = Math.floor((now - t) / 86400); if (k >= 0 && k < 30) days[29 - k]++; });
      const dmax = Math.max(1, ...days);
      const recent = [...sess.map(s => ({ t: s.created, txt: `Backtest-Session ${s.sym || ''}`, sub: s.running ? 'läuft' : (s.result && s.result !== 'auto' ? s.result : 'beendet'), go: 'backtests' })), ...T.filter(t => t.src === 'desk').map(t => ({ t: t.exitT, txt: `Desk-Trade ${tradeLabel(t)}`, sub: 'Handels-Desk', go: 'journal' }))].filter(x => x.t).sort((a, b) => b.t - a.t).slice(0, 5);
      const fresh = [...notes.map(n => ({ t: n.t / 1000, txt: n.title || 'Notiz', sub: 'Research Desk', go: 'research' })), ...br.map(b => ({ t: b.t / 1000, txt: 'Morning Briefing', sub: J.dt(b.t), go: 'briefing' }))].sort((a, b) => b.t - a.t).slice(0, 5);
      const card = (cls, val, lbl, sub, tag, bars) => `<div class="bs-stat ${cls}"><div class="row nw"><b>${val}</b><span class="sp"></span>${tag ? `<span class="bs-tag">${tag}</span>` : ''}</div><span>${lbl}</span><small>${sub}</small>${bars}</div>`;
      p.innerHTML = `<div class="bs-ph"><b>Home</b><span class="sp"></span><button class="bs-x" aria-label="Schließen">✕</button></div>
        <div class="bs-search"><input id="bsQ" placeholder="Alles durchsuchen – Bereiche, Strategien, Notizen, Märkte …" autocomplete="off"><div id="bsRes"></div></div>
        ${((J.S.brain && J.S.brain.areas) || []).length ? `<div class="bs-box" style="margin:12px 0"><h5>Dein Leben</h5><div class="bs-areas">${J.S.brain.areas.map((a, i) => `<button data-area="${i}"><b>${esc(a.name)}</b><small>${esc(a.sub || '')}</small>${a.next && a.next[0] ? `<em>${esc(a.next[0])}</em>` : ''}</button>`).join('')}</div></div>` : ''}
        <div class="bs-stats">${card('o', T.length, 'Trades', 'im Journal', `+${tTimes.filter(t => t && t > wk).length} neu`, spark(weeks(tTimes), '#f08a3c'))}${card('g', sess.length, 'Sessions', 'Backtests gesamt', `+${sess.filter(s => s.created > wk).length} Woche`, spark(weeks(sess.map(s => s.created)), '#2fcf9f'))}${card('b', strat.length, 'Strategien', `${strat.filter(s => (s.rules || '').trim()).length} mit Regeln`, '', spark(sc.map(x => x[1]), '#4f8cff'))}${card('p', notes.length + br.length, 'Notizen & Briefings', 'Research Desk', `${notes.filter(n => n.t / 1000 > wk).length + br.filter(b => b.t / 1000 > wk).length} Woche`, spark(weeks([...notes.map(n => n.t / 1000), ...br.map(b => b.t / 1000)]), '#a26bff'))}</div>
        <div class="bs-grid3"><div class="bs-box"><h4><i style="background:#a26bff"></i>Aktivität</h4><small>Sessions & Desk-Trades pro Tag, letzte 30 Tage</small><div class="bs-col">${days.map(v => `<i style="height:${v ? Math.max(4, v / dmax * 100) : 0}%"></i>`).join('')}</div></div>
        <div class="bs-box"><h4><i style="background:#2fcf9f"></i>Trades nach Strategie</h4><small>Antippen öffnet das Journal</small>${sc.length ? sc.map(([k, v]) => `<button class="bs-row" data-go="journal"><span>${esc(k)}</span><b>${v}</b><em style="width:${v / sc[0][1] * 100}%;background:#2fcf9f"></em></button>`).join('') : '<p class="bs-empty">Noch keine Trades.</p>'}</div>
        <div class="bs-box"><h4><i style="background:#4f8cff"></i>Märkte nach Netto</h4><small>Ergebnis je Markt</small>${mks.length ? mks.map(([k, v]) => `<button class="bs-row" data-go="stats"><span>${esc(k)}</span><b class="${v >= 0 ? 'up' : 'dn'}">${J.money(v, 0)}</b><em style="width:${Math.abs(v) / mmax * 100}%;background:${v >= 0 ? '#2fcf9f' : '#ef5d78'}"></em></button>`).join('') : '<p class="bs-empty">Noch keine Trades.</p>'}</div></div>
        <div class="bs-grid2"><div class="bs-box"><h5>Letzte Aktivität</h5>${recent.length ? recent.map(r => `<button class="bs-li" data-go="${r.go}"><b>${esc(r.txt)}</b><small>${J.dt(r.t * 1000)} · ${esc(r.sub)}</small></button>`).join('') : '<p class="bs-empty">Noch nichts passiert.</p>'}</div>
        <div class="bs-box"><h5>Neueste Notizen & Briefings</h5>${fresh.length ? fresh.map(r => `<button class="bs-li" data-go="${r.go}"><b>${esc(r.txt)}</b><small>${esc(r.sub)}</small></button>`).join('') : '<p class="bs-empty">Lass Jarvis im Research Desk recherchieren oder ein Briefing schreiben.</p>'}</div></div>`;
      const q = p.querySelector('#bsQ'), res = p.querySelector('#bsRes');
      const idx = [...AREAS().flatMap(([g2, it]) => it.map(([v, l]) => ({ l, s: 'Bereich · ' + g2, go: v }))), ...strat.map(s => ({ l: s.name, s: 'Strategie', go: 'strategien' })), ...notes.map(n => ({ l: n.title || 'Notiz', s: 'Notiz', go: 'research' })), ...J.SYM.map(s => ({ l: s[1], s: 'Markt · ' + s[2], go: 'markt', sym: s[0] })), ...((J.S.brain && J.S.brain.areas) || []).flatMap((a, i) => [{ l: a.name, s: 'Lebensbereich', area: i }, ...[...(a.facts || []), ...(a.next || [])].map(f => ({ l: f, s: a.name, area: i }))])];
      q.oninput = () => { const v = q.value.trim().toLowerCase(); res.innerHTML = v ? idx.filter(x => (x.l + ' ' + x.s).toLowerCase().includes(v)).slice(0, 8).map(x => (x.area != null ? `<button class="bs-li" data-area="${x.area}"><b>${esc(String(x.l).slice(0, 90))}</b><small>${esc(x.s)}</small></button>` : `<button class="bs-li" data-go="${x.go}" ${x.sym ? `data-sym="${esc(x.sym)}"` : ''}><b>${esc(x.l)}</b><small>${esc(x.s)}</small></button>`)).join('') || '<p class="bs-empty">Nichts gefunden.</p>' : ''; bindGo(); };
    }
    p.querySelector('.bs-x').onclick = () => panel(null);
    const bindGo = () => { p.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { if (b.dataset.sym) { J.S.settings.sym = b.dataset.sym; J.store.save('settings'); } S.enter(b.dataset.go); }); p.querySelectorAll('[data-area]').forEach(b => b.onclick = () => panel('area', J.S.brain.areas[+b.dataset.area])); };
    bindGo();
  };
}
