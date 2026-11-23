/* Jarvis-Terminal — Gehirn: Claude (in claude.ai), sonst dein kostenloser Gemini- oder OpenRouter-Key; Stimme & Mikrofon; goldener Orb */
'use strict';
{
  const JV = window.Jarvis = { state: 'idle', sample: null, tts: null, mcp: null };
  const AI_KEY = 'jt.ai';
JV.ai = () => { try { return Object.assign({ provider: 'gemini', gemini: '', gmodel: 'gemini-2.5-flash', openrouter: '', omodel: 'nvidia/nemotron-3.5-super-vl:free', search: true }, JSON.parse(localStorage.getItem(AI_KEY) || '{}')); } catch { return { provider: 'gemini', gemini: '', gmodel: 'gemini-2.5-flash', openrouter: '', omodel: 'nvidia/nemotron-3.5-super-vl:free', search: true }; } };
JV.saveAi = a => { try { localStorage.setItem(AI_KEY, JSON.stringify(a)); } catch { } };
JV.ready = (async () => {
  if (!window.claude?.use) return;
  try { JV.sample = await claude.use('sample'); } catch { }
  try { JV.mcp = await claude.use('mcp'); } catch { }
  try { JV.tts = await claude.use('tts'); if (JV.tts) JV.tts.onState(({ state }) => { JV.setState(state === 'speaking' ? 'speak' : 'idle'); J.emit('tts', state); }); } catch { }
})();
JV.setState = s => { JV.state = s; J.emit('orb', s); };
/* Welches Gehirn denkt gerade? */
JV.brain = () => { if (JV.sample) return 'claude'; const a = JV.ai(); if (a.provider === 'gemini' && a.gemini) return 'gemini'; if (a.provider === 'openrouter' && a.openrouter) return 'openrouter'; if (a.gemini) return 'gemini'; if (a.openrouter) return 'openrouter'; return null; };
JV.brainLabel = () => ({ claude: 'Claude', gemini: 'Gemini (dein Key)', openrouter: 'OpenRouter (dein Key)' })[JV.brain()] || 'nicht verbunden';
JV.canTools = () => JV.brain() === 'claude';

/* ---------- Goldener Orb ---------- */
JV.orb = (canvas, big = false) => {
  const g = canvas.getContext('2d'); let raf, t0 = performance.now(), energy = 0;
  const parts = Array.from({ length: big ? 90 : 26 }, () => ({ a: Math.random() * 6.283, r: .55 + Math.random() * .45, s: (.2 + Math.random() * .8) * (Math.random() < .5 ? -1 : 1), z: Math.random() }));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frame = now => {
    const d = devicePixelRatio || 1, W = canvas.clientWidth || 40, H = canvas.clientHeight || 40;
    if (canvas.width !== Math.round(W * d)) { canvas.width = Math.round(W * d); canvas.height = Math.round(H * d); }
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, W, H);
    const t = (now - t0) / 1000, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 * .86;
    const target = JV.state === 'speak' ? 1 : JV.state === 'think' ? .6 : JV.state === 'listen' ? .8 : .18; energy += (target - energy) * .06;
    const pulse = 1 + Math.sin(t * (JV.state === 'speak' ? 9 : 2.2)) * .04 * (0.4 + energy);
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
    glow.addColorStop(0, `rgba(255,214,120,${.55 + energy * .35})`); glow.addColorStop(.35, `rgba(242,180,60,${.22 + energy * .2})`); glow.addColorStop(1, 'rgba(242,180,60,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, R * 1.1, 0, 7); g.fill(); g.lineCap = 'round';
    const rings = big ? 5 : 3;
    for (let k = 0; k < rings; k++) { const rr = R * (.42 + k * (.55 / rings)) * pulse, rot = t * (.35 + k * .18) * (k % 2 ? -1 : 1) * (1 + energy * 1.5); g.strokeStyle = `rgba(255,${200 + k * 8},${110 + k * 20},${.75 - k * .1})`; g.lineWidth = big ? 2.2 - k * .25 : 1.4; const segs = 3 + k; for (let s = 0; s < segs; s++) { const a = rot + s * 6.283 / segs; g.beginPath(); g.arc(cx, cy, rr, a, a + 6.283 / segs * (.55 + .25 * Math.sin(t + k))); g.stroke(); } }
    if (big) { g.strokeStyle = 'rgba(255,220,140,.25)'; g.lineWidth = 1; for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283 + t * .2; const r1 = R * .95, r2 = R * (.99 + .03 * Math.sin(t * 3 + k)); g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke(); } }
    for (const p of parts) { p.a += p.s * .006 * (1 + energy * 3); const rr = R * p.r * pulse, x = cx + Math.cos(p.a) * rr, y = cy + Math.sin(p.a) * rr * (.55 + p.z * .45); g.fillStyle = `rgba(255,226,150,${.35 + p.z * .5})`; g.beginPath(); g.arc(x, y, (big ? 1.6 : 1) * (.5 + p.z), 0, 7); g.fill(); }
    const core = g.createRadialGradient(cx, cy - R * .05, 0, cx, cy, R * .3 * pulse); core.addColorStop(0, '#fff6d8'); core.addColorStop(.4, '#ffd36b'); core.addColorStop(1, 'rgba(230,160,40,0)');
    g.fillStyle = core; g.beginPath(); g.arc(cx, cy, R * .3 * pulse, 0, 7); g.fill();
    if (big && energy > .3) { g.strokeStyle = `rgba(255,230,160,${energy * .8})`; g.lineWidth = 2; g.beginPath(); for (let x = -R * .6; x <= R * .6; x += 3) { const y = Math.sin(x * .09 + t * 14) * Math.sin(t * 5) * R * .09 * energy * Math.cos(x / R * 2.4); x === -R * .6 ? g.moveTo(cx + x, cy + y) : g.lineTo(cx + x, cy + y); } g.stroke(); }
    if (!reduce) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
};

/* ---------- Stimme (Claude-Stimme oder die deutsche Stimme deines Geräts) ---------- */
JV.plain = s => String(s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*`>|]/g, '').replace(/\n{2,}/g, '\n').trim();
JV.voices = () => (window.speechSynthesis ? speechSynthesis.getVoices().filter(v => /^de/i.test(v.lang)) : []);
JV.canSpeak = () => !!(JV.tts || window.speechSynthesis);
JV.speak = async (text, force) => {
  if (!force && !J.S.settings.speak) return false;
  const t = JV.plain(text).slice(0, 1990); if (!t) return false;
  if (JV.tts) { try { await JV.tts.speak(t, { language: 'de', rate: J.S.settings.rate || 1 }); return true; } catch (e) { if (e?.code === 'not_granted') return false; } }
  if (!window.speechSynthesis) return false;
  speechSynthesis.cancel();
  const chunks = t.match(/[^.!?\n]+[.!?\n]*/g) || [t];
  const vs = JV.voices(); const v = vs.find(x => x.name === J.S.settings.voice) || vs.find(x => /Anna|Helena|Petra|Markus|Google Deutsch/i.test(x.name)) || vs[0];
  return new Promise(res => {
    chunks.forEach((c, i) => { const u = new SpeechSynthesisUtterance(c.trim()); u.lang = 'de-DE'; if (v) u.voice = v; u.rate = J.S.settings.rate || 1; if (i === 0) u.onstart = () => JV.setState('speak'); if (i === chunks.length - 1) { u.onend = () => { JV.setState('idle'); res(true); }; u.onerror = () => { JV.setState('idle'); res(false); }; } speechSynthesis.speak(u); });
  });
};
JV.stop = () => { try { JV.tts && JV.tts.stop(); } catch { } try { window.speechSynthesis && speechSynthesis.cancel(); } catch { } JV.setState('idle'); };
/* Mikrofon (Spracheingabe) – Safari/Chrome */
JV.canListen = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
JV.listen = () => new Promise((res, rej) => {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return rej(new Error('Spracheingabe gibt es in diesem Browser nicht.'));
  const r = new R(); r.lang = 'de-DE'; r.interimResults = false; r.maxAlternatives = 1;
  JV.setState('listen');
  r.onresult = e => { JV.setState('idle'); res(e.results[0][0].transcript); };
  r.onerror = e => { JV.setState('idle'); rej(new Error(e.error === 'not-allowed' ? 'Mikrofon nicht erlaubt.' : 'Nicht verstanden.')); };
  r.onend = () => { if (JV.state === 'listen') JV.setState('idle'); };
  r.start();
});

/* ---------- Denken ---------- */
JV.persona = () => `Du bist JARVIS, das KI-Gehirn in Elianos „Jarvis Terminal“ (seine Backtest-App Edge Lab Replay mit Markt-Terminal). Du sprichst Deutsch, direkt und freundlich, wie ein erfahrener Trading-Mentor – knapp, strukturiert, mit konkreten Zahlen.
Feste Regeln:
- Erfinde NIEMALS Kurse, Zahlen, Termine, Nachrichten oder Quellen. Nutze nur mitgeschickte Daten, Werkzeuge oder Suchergebnisse. Fehlt etwas, sag es offen.
- Keine Kauf-/Verkaufsbefehle als Gewissheit; zeige Szenarien, Levels, Risiko und was dagegen spricht.
- Risiko zuerst: Stop-Loss, Positionsgröße, Regeln. Lobe Prozess, nicht Glück.
- Formatiere mit kurzen Absätzen, „- “-Listen und **fett** für Kernzahlen. Keine Tabellen.
Heute ist ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })}, ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr (Berlin).`;
JV.err = e => {
  const c = e?.code;
  if (c === 'nobrain') return 'Jarvis hat noch kein Gehirn: Trage im Copilot unter „Jarvis verbinden“ deinen kostenlosen Gemini-Key (Google AI Studio) oder OpenRouter-Key ein.';
  if (c === 'not_granted') return 'Jarvis darf auf dieser Seite noch nicht denken – erlaube „Claude fragen“.';
  if (c === 'rate_limited' || c === 429) return 'Das kostenlose Limit ist gerade erreicht. Versuch es in einer Minute erneut.';
  if (c === 'key') return 'Der API-Key wurde abgelehnt – bitte im Copilot prüfen.';
  return 'Jarvis konnte nicht antworten' + (e?.message ? ': ' + String(e.message).slice(0, 160) : c ? ` (${c})` : '') + '.';
};
  const toMsgs = input => Array.isArray(input) ? input : [{ role: 'user', content: String(input) }];
  const extractJSON = t => { const s = String(t || ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < a) throw { code: 'json', message: 'Keine JSON-Antwort' }; return JSON.parse(s.slice(a, b + 1)); };
  async function gemini(msgs, o) {
  const a = JV.ai();
  const body = { contents: msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { temperature: .5 } };
    if (o.images?.length) body.contents[body.contents.length - 1].parts.push(...o.images.map(im => ({ inline_data: { mime_type: im.mime, data: im.b64 } })));
  if (o.json) body.generationConfig.responseMimeType = 'application/json';
  else if (o.search && a.search) body.tools = [{ google_search: {} }];
  const call = async (b) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(a.gmodel || 'gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(a.gemini)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b), signal: o.signal });
  let r = await call(body);
  if (!r.ok && body.tools) { delete body.tools; r = await call(body); }
  /* Modell abgeschaltet oder unbekannt (404 bzw. 400 „not found/not supported“)? Dann automatisch neuere Modelle probieren und das funktionierende merken */
  const gone = async (res) => { if (res.status === 404) return true; if (res.status !== 400) return false; try { const m = (await res.clone().json()).error?.message || ''; return /not found|not supported|deprecated|no longer/i.test(m); } catch { return false; } };
  if (await gone(r)) {
    for (const m of ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'].filter(x => x !== a.gmodel)) {
      const r2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(a.gemini)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: o.signal });
      if (r2.ok || !(await gone(r2))) { r = r2; if (r2.ok) { a.gmodel = m; JV.saveAi(a); } break; }
    }
  }
  if (r.status === 400 || r.status === 403) { let m = ''; try { m = (await r.json()).error?.message || ''; } catch { } throw /key/i.test(m) ? { code: 'key' } : { code: r.status, message: m }; }
  if (r.status === 429) throw { code: 429 };
  if (!r.ok) { let m = ''; try { m = (await r.json()).error?.message || ''; } catch { } throw { code: r.status, message: 'Gemini-Fehler ' + r.status + (m ? ' – ' + m : '') }; }
  const j = await r.json(); const cand = j.candidates?.[0];
  let text = (cand?.content?.parts || []).map(p => p.text || '').join('');
  const src = (cand?.groundingMetadata?.groundingChunks || []).map(c => c.web).filter(Boolean);
  if (src.length && !o.json) text += '\n\n### Quellen der Websuche\n' + src.slice(0, 6).map(w => `- [${(w.title || w.uri).replace(/[\[\]]/g, '')}](${w.uri})`).join('\n');
  return text;
}
  async function openrouter(msgs, o) {
  const a = JV.ai();
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.openrouter, 'X-Title': 'Jarvis Terminal' }, body: JSON.stringify({ model: a.omodel, messages: msgs.map(m => ({ role: m.role, content: m.content })), temperature: .5 }), signal: o.signal });
  if (r.status === 401) throw { code: 'key' }; if (r.status === 429) throw { code: 429 };
  if (!r.ok) { let m = ''; try { m = (await r.json()).error?.message || ''; } catch { } throw { code: r.status, message: m || 'OpenRouter-Fehler ' + r.status }; }
  const j = await r.json(); return j.choices?.[0]?.message?.content || '';
}
/* input: string oder messages; opts: tools (nur Claude), onText, signal, json, search (Websuche bei Gemini), tier */
JV.think = async (input, opts = {}) => {
  await JV.ready;
  const b = JV.brain(); if (!b) throw { code: 'nobrain' };
  JV.setState('think');
  try {
    if (b === 'claude') {
      const o = { modelTier: opts.tier || 'default', cache: false };
      if (opts.onText) o.onText = opts.onText; if (opts.tools) o.tools = opts.tools; if (opts.signal) o.signal = opts.signal;
      if (opts.json) return await JV.sample.json(input, o);
      return (await JV.sample(input, o)).text;
    }
    const msgs = toMsgs(input);
    if (opts.json) msgs[msgs.length - 1] = { role: 'user', content: msgs[msgs.length - 1].content + '\n\nAntworte ausschließlich mit gültigem JSON.' };
    const text = b === 'gemini' ? await gemini(msgs, opts) : await openrouter(msgs, opts);
    if (opts.json) return extractJSON(text);
    opts.onText && opts.onText({ text });
    return text;
  } finally { if (JV.state === 'think') JV.setState('idle'); }
};

/* ---------- Nachrichten: in Claude per Websuche, sonst aus deinen stündlichen Feeds ---------- */
JV.webSearch = async (objective, queries) => {
  if (!JV.mcp) throw { code: 'nosearch' };
  const r = await JV.mcp.callTool('Parallel Search', 'web_search', { objective, search_queries: queries, session_id: 'jarvisterminal' + (J.S.settings.name || '') + 'session01' }, { cache: { staleTime: 300000, gcTime: 1800000 } });
  let pl = r?.payload; if (typeof pl === 'string') { try { pl = JSON.parse(pl); } catch { } }
  return (pl?.results || []).map(x => ({ title: x.title || x.url, url: x.url, date: x.publish_date || null, text: (x.excerpts || []).join(' … ').replace(/\s+/g, ' ').trim(), src: (() => { try { return new URL(x.url).hostname.replace('www.', ''); } catch { return ''; } })() }));
};
JV.news = async (topic, q) => {
  const j = await J.getJSON('news.json');
  let items = (j.items || []).map(n => ({ title: n.title, url: n.url, date: n.t ? J.dt(n.t) : null, t: n.t, text: n.text || '', src: n.src, topic: n.topic }));
  if (q) { const w = q.toLowerCase().split(/\s+/).filter(x => x.length > 2); items = items.filter(n => w.some(x => (n.title + ' ' + n.text).toLowerCase().includes(x))); }
  else if (topic && topic !== 'alle') items = items.filter(n => n.topic === topic || (topic === 'markt' && !n.topic));
  return { items, updated: j.updated };
};

/* ---------- Werkzeuge (Claude) & Kontext (Gemini/OpenRouter) ---------- */
JV.snapshot = async (sym, tf = '1T') => {
  const d = await J.load(sym, tf); const c = d.candles; const v = TA.closes(c);
  const e20 = TA.ema(v, 20), e50 = TA.ema(v, 50), r = TA.rsi(v, 14), a = TA.atr(c, 14), reg = TA.regime(c); const L = c.length - 1; const q = J.quote(d); const last20 = c.slice(-20);
  const f = x => isFinite(x) ? +x.toFixed(4) : null;
  return { symbol: sym, name: J.name(sym), zeitrahmen: tf, quelle: d.src, letzterKurs: f(q.last), veraenderungProzent: q.chp != null ? +q.chp.toFixed(2) : null, letzteKerze: new Date(q.t).toISOString(), ema20: f(e20[L]), ema50: f(e50[L]), rsi14: f(r[L]), atr14: f(a[L]), regime: reg[L] ? TA.REG[reg[L]][0] : 'zu wenig Daten', hoch20: Math.max(...last20.map(b => b.h)), tief20: Math.min(...last20.map(b => b.l)), letzteKerzen: c.slice(-6).map(b => ({ zeit: new Date(b.t).toISOString().slice(0, 16), o: f(b.o), h: f(b.h), l: f(b.l), c: f(b.c) })) };
};
JV.riskToday = () => {
  const td = J.today(); const T = J.journal().filter(t => t.src === 'desk' && t.exitT && J.dayOf(t.exitT) === td).sort((a, b) => a.exitT - b.exitT);
  const pnl = T.reduce((a, t) => a + (t.pnl || 0), 0); let streak = 0; for (let i = T.length - 1; i >= 0; i--) { if (T[i].pnl < 0) streak++; else break; }
  return { datum: td, tradesHeute: T.length, pnlHeute: pnl, verlustserie: streak, regeln: J.S.risk, offenePositionen: J.S.positions.length };
};
JV.journalCtx = () => { const T = J.journal(); return { statistik: TA.journalStats(T), anzahl: T.length, letzte: T.slice(-8).map(t => ({ markt: t.sym, richtung: t.side > 0 ? 'Long' : 'Short', strategie: t.setup, pnl: +(+t.pnl).toFixed(2), r: t.r != null ? +(+t.r).toFixed(2) : null, regelnOk: t.rulesOk, notiz: (t.note || '').slice(0, 100) })) }; };
JV.backtest = async ({ strategie, symbol, zeitrahmen, parameter }) => { const d = await J.load(symbol, zeitrahmen || '1T'); const p = { ...TA.defParams(strategie), ...(parameter || {}) }; const r = TA.backtest(d.candles, { strat: strategie, params: p, dir: 'both', cap: 10000, riskPct: 1, slAtr: 1.5, tpAtr: 3, fee: .02, off: d.off }); const m = TA.metrics(r, d.candles); return { strategie: TA.STRATS[strategie].name, symbol, zeitrahmen: zeitrahmen || '1T', parameter: p, kerzen: d.candles.length, von: new Date(d.candles[0].t).toISOString().slice(0, 10), ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'number' && isFinite(v) ? +v.toFixed(2) : v])) }; };
JV.tools = () => [
  { name: 'kurs_daten', description: 'Echte Kursdaten und Kennzahlen (EMA20/50, RSI, ATR, Regime, 20-Kerzen-Hoch/Tief). Symbole: ar:NAS100 (Nasdaq wie NQ), ar:US500 (wie ES), ar:US30, ar:GER40 (DAX), ar:XAUUSD (Gold) aus dem Archiv; BTCUSDT/ETHUSDT live; ^GSPC, ^NDX, NQ=F, ES=F, ^VIX, ^TNX, DX-Y.NYB, CL=F, EURUSD=X, NVDA usw.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, zeitrahmen: { type: 'string', enum: ['5m', '15m', '1h', '4h', '1T', '1W'] } }, required: ['symbol'] }, execute: async ({ symbol, zeitrahmen }) => JV.snapshot(symbol, zeitrahmen || '1T') },
  { name: 'web_suche', description: 'Sucht aktuelle Nachrichten im Web.', inputSchema: { type: 'object', properties: { ziel: { type: 'string' }, suchbegriffe: { type: 'array', items: { type: 'string' } } }, required: ['ziel', 'suchbegriffe'] }, execute: async ({ ziel, suchbegriffe }) => (await JV.webSearch(ziel, suchbegriffe)).slice(0, 6).map(r => ({ ...r, text: r.text.slice(0, 700) })) },
  { name: 'journal_statistik', description: 'Statistik aus Elianos Journal (Replay-Backtests und Desk-Trades) und die letzten Trades.', inputSchema: { type: 'object', properties: {} }, execute: async () => JV.journalCtx() },
  { name: 'backtest', description: 'Führt einen Backtest mit echten Kursdaten aus. Strategien: ema, rsi, donch, vwap, bb, orb.', inputSchema: { type: 'object', properties: { strategie: { type: 'string', enum: Object.keys(TA.STRATS) }, symbol: { type: 'string' }, zeitrahmen: { type: 'string', enum: ['5m', '15m', '1h', '4h', '1T', '1W'] }, parameter: { type: 'object' } }, required: ['strategie', 'symbol'] }, execute: JV.backtest },
  { name: 'second_brain', description: 'Elianos Lebensbereiche aus seinem Second Brain (Brand, Content, Agency, Roblox, Jarvis, Nebeneinkommen, Training, Schule …) mit Stand, nächsten Schritten und Notizen.', inputSchema: { type: 'object', properties: {} }, execute: async () => ((J.S.brain && J.S.brain.areas) || []) },
  { name: 'risiko_status', description: 'Heutiger Risiko-Status aus Risk Command.', inputSchema: { type: 'object', properties: {} }, execute: async () => JV.riskToday() }
];
/* Für Gemini/OpenRouter: passende echte Daten vorab einsammeln */
  const ALIAS = [[/nasdaq|nq\b|ndx|nas100/i, 'ar:NAS100'], [/s&p|spx|\bes\b|us500/i, 'ar:US500'], [/\bdow\b|ym\b|us30/i, 'ar:US30'], [/\bdax\b|ger40/i, 'ar:GER40'], [/gold|xau/i, 'ar:XAUUSD'], [/bitcoin|\bbtc/i, 'BTCUSDT'], [/ethereum|\beth\b/i, 'ETHUSDT'], [/\bvix\b/i, '^VIX'], [/rendite|yield|zins|tnx/i, '^TNX'], [/dollar|dxy/i, 'DX-Y.NYB'], [/\böl\b|oil|wti/i, 'CL=F'], [/eur\/?usd|euro/i, 'EURUSD=X'], [/nvidia|nvda/i, 'NVDA'], [/tesla|tsla/i, 'TSLA']];
JV.context = async (q) => {
  const ctx = {};
  const ar = (J.S.brain && J.S.brain.areas) || []; if (ar.length) ctx.zweitesGehirn = ar.map(a => ({ bereich: a.name, kurz: a.summary, stand: (a.facts || []).slice(0, 8), naechsteSchritte: a.next || [], notizen: (a.notes || []).slice(0, 5).map(n => n.t || n) })); const syms = [...new Set(ALIAS.filter(([re]) => re.test(q)).map(a => a[1]))].slice(0, 3);
  for (const s of syms) { try { ctx['kurse_' + s] = await JV.snapshot(s, /stunde|intraday|heute|gerade|jetzt/i.test(q) && J.kind(s) !== 'market' ? '1h' : '1T'); } catch (e) { ctx['kurse_' + s] = { fehler: J.errText(e) }; } }
  if (/journal|trades|statistik|performance|fehler|auswert|coach/i.test(q)) ctx.journal = JV.journalCtx();
  if (/risiko|traden|limit|darf ich|stop/i.test(q)) ctx.risiko = JV.riskToday();
  const st = Object.entries(TA.STRATS).find(([k, s]) => q.toLowerCase().includes(s.name.toLowerCase().split(' ')[0].toLowerCase()) || q.toLowerCase().includes(k + ' '));
  if (/backtest/i.test(q) && st) { try { ctx.backtest = await JV.backtest({ strategie: st[0], symbol: syms[0] || 'ar:NAS100', zeitrahmen: /stunde|1h/i.test(q) ? '1h' : '1T' }); } catch (e) { ctx.backtest = { fehler: J.errText(e) }; } }
  if (/news|nachricht|heute|wichtig|fed|termin|warum/i.test(q)) { try { const n = await JV.news('alle'); ctx.schlagzeilen = n.items.slice(0, 12).map(x => `${x.title} (${x.src}, ${x.date || ''})`); } catch { } try { const c = await J.getJSON('calendar.json'); ctx.termine = (c.events || []).filter(e => e.impact === 'High' || e.impact === 'Medium').slice(0, 25); } catch { } }
  return ctx;
};
}
