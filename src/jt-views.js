/* Jarvis-Terminal — Bereiche: Marktüberblick, Morning Briefing, Markt-Explorer, News Intelligence, Makroökonomie */
'use strict';
{
  const { $, $$, esc, num, pct, cls, price } = J;
  const V = J.V;

/* ---------- gemeinsame Helfer ---------- */
J.errBox = (e, retry) => `<div class="card empty"><b>Kurse konnten nicht geladen werden</b><span>${esc(J.errText(e))}</span><div class="row" style="justify-content:center">${retry ? '<button class="btn pri" data-retry>' + J.icon('refresh') + 'Erneut laden</button>' : ''}<button class="btn" data-csv>${J.icon('upload')}CSV importieren</button></div></div>`;
J.bindErr = (el, retry, onCsv) => { const r = el.querySelector('[data-retry]'); if (r) r.onclick = retry; const c = el.querySelector('[data-csv]'); if (c) c.onclick = async () => { const k = await J.pickCSV(); if (k) onCsv ? onCsv(k) : retry(); }; };
J.chg = (c, back) => { if (!c || c.length <= back) return null; return (c[c.length - 1].c / c[c.length - 1 - back].c - 1) * 100; };
J.ytd = c => { const y = new Date().getFullYear(); const i = c.findIndex(b => new Date(b.t).getFullYear() === y); if (i <= 0) return null; return (c[c.length - 1].c / c[i - 1].c - 1) * 100; };
J.greet = () => { const h = +new Date().toLocaleString('de-DE', { hour: '2-digit', hour12: false, timeZone: 'Europe/Berlin' }); return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend'; };
J.indLines = (d, ind) => {
  const c = d.candles, v = TA.closes(c), lines = [], bands = [];
  if (ind.e20) lines.push({ v: TA.ema(v, 20), color: '#35d3b6', w: 1.6 });
  if (ind.e50) lines.push({ v: TA.ema(v, 50), color: '#6f8dff', w: 1.6 });
  if (ind.e200) lines.push({ v: TA.ema(v, 200), color: '#f3b74f', w: 1.6 });
  if (ind.vwap) lines.push({ v: TA.vwap(c, d.off || 0), color: '#e879f9', w: 1.5, dash: [5, 3] });
  if (ind.bb) { const b = TA.bb(v, 20, 2); lines.push({ v: b.up, color: '#8b6cff99', w: 1 }, { v: b.lo, color: '#8b6cff99', w: 1 }, { v: b.mid, color: '#8b6cff66', w: 1, dash: [3, 3] }); bands.push({ up: b.up, lo: b.lo, color: '#8b6cff12' }); }
  return { lines, bands, regime: ind.reg ? TA.regime(c) : null, vol: ind.vol !== false };
};
J.ohlcHtml = (b, prev) => b ? `<span>O<b>${price(b.o)}</b></span><span>H<b>${price(b.h)}</b></span><span>T<b>${price(b.l)}</b></span><span>S<b>${price(b.c)}</b></span>${prev ? `<span class="${cls(b.c - prev.c)}">${pct((b.c / prev.c - 1) * 100)}</span>` : ''}${b.v ? `<span>Vol<b>${num(b.v, 0)}</b></span>` : ''}` : '';
J.standLine = d => `${d.src}${d.candles?.length ? ' · letzte Kerze ' + J.dt(d.candles[d.candles.length - 1].t) : ''}`;
J.brainHint = () => Jarvis.brain() ? '' : `<p class="note">Jarvis braucht ein Gehirn: Trage im <a href="#copilot">Copilot</a> deinen kostenlosen Gemini-Key ein.</p>`;
J.calendar = async () => { try { const j = await J.getJSON('calendar.json'); return j; } catch { return null; } };

/* ===================== Marktüberblick ===================== */
V.markt = el => {
  const s = J.S.settings; s.ind = s.ind || { e20: true, e50: true, e200: false, vwap: false, bb: false, vol: true, reg: false };
  let sym = s.sym || 'ar:NAS100', tf = s.tf || '1T', d = null, rows = {};
  const IND = [['e20', 'EMA 20'], ['e50', 'EMA 50'], ['e200', 'EMA 200'], ['vwap', 'VWAP'], ['bb', 'Bollinger'], ['vol', 'Volumen'], ['reg', 'Regime']];
  el.innerHTML = `
  <div class="page-hd"><div><h1>${J.greet()}, ${esc(s.name)}</h1><p class="mut">${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'Europe/Berlin' })} · Marktüberblick</p></div></div>
  <div class="split">
    <div class="chartbox">
      <div class="chartbar"><div class="symsel"><select id="ovsym" aria-label="Markt">${J.symOptions(sym)}</select></div>
        <div class="seg" id="ovtf">${Object.keys(J.TF).map(k => `<button data-tf="${k}" class="${k === tf ? 'on' : ''}">${k}</button>`).join('')}</div><div class="sp"></div>
        <button class="btn sm" id="ovline" title="Linie setzen">${J.icon('line')}Linie</button><button class="btn sm ghost" id="ovclr">Linien löschen</button><button class="btn sm" id="ovcsv">${J.icon('upload')}CSV</button></div>
      <div class="row" style="padding:8px 12px 0;gap:6px">${IND.map(([k, l]) => `<button class="chip ${s.ind[k] ? 'acc' : ''}" data-ind="${k}" style="cursor:pointer;min-height:30px">${l}</button>`).join('')}</div>
      <div class="ohlc" id="ovohlc"></div>
      <div class="cv" id="ovcv"></div>
      <div class="replay-ctl"><span class="big" id="ovlast" style="font-size:24px">–</span><span id="ovch"></span><span class="note" id="ovstand"></span><div class="sp"></div><button class="btn gold sm" id="ovja">Jarvis: Chart analysieren</button></div>
    </div>
    <div class="card" style="padding:12px">
      <h3>Watchlist <span class="sp"></span><button class="btn sm ghost" id="wedit">Bearbeiten</button><button class="btn sm" id="wref" aria-label="Aktualisieren">${J.icon('refresh')}</button></h3>
      <div id="wlist"><div class="note">Lade Kurse …</div></div>
    </div>
  </div>
  <div id="ovjout" class="card md" style="margin-top:16px;display:none"></div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card glass"><h3>Marktbreite <span class="sp"></span><small>deine Watchlist</small></h3><div id="breadth" class="mut">Erscheint nach dem Laden.</div>
      <div class="hr"></div><div class="row"><button class="btn gold" id="ovj">Jarvis-Einschätzung</button><a class="btn" href="#briefing">Morning Briefing</a></div><div id="ovjo2" class="md" style="margin-top:10px"></div></div>
    <div class="card"><h3>Stärke heute <small>Veränderung zum Vortag</small></h3><div id="strength"></div></div>
  </div>`;
  const ch = new JChart($('#ovcv'), { tf, onHover: i => { const c = ch.c; const k = i ?? c.length - 1; $('#ovohlc').innerHTML = J.ohlcHtml(c[k], c[k - 1]); }, onClick: ({ price: p }) => { if (!lineMode) return; (s.lines[sym] = s.lines[sym] || []).push(+p.toPrecision(7)); J.store.save('settings'); lineMode = false; $('#ovline').classList.remove('pri'); draw(); } });
  let lineMode = false;
  const ov = () => { const o = J.indLines(d, s.ind); o.hlines = (s.lines[sym] || []).map(p => ({ p, color: '#f3b74f', dash: [6, 4] })); return o; };
  const draw = (keep = true) => { if (d) ch.set(d.candles, ov(), keep); };
  const loadMain = async (force) => {
    ch.opt.tf = tf; ch.opt.empty = 'Lade …'; ch.set([], {});
    try {
      d = await J.load(sym, J.kind(sym) === 'csv' ? 'csv' : tf, force); ch.opt.tf = d.tf; draw(false);
      const q = J.quote(d), c = d.candles;
      $('#ovohlc').innerHTML = J.ohlcHtml(c[c.length - 1], c[c.length - 2]);
      $('#ovlast').textContent = price(q.last); $('#ovch').innerHTML = q.chp != null ? `<span class="chip ${cls(q.chp)}">${q.chp > 0 ? '▲' : '▼'} ${pct(q.chp)}</span>` : '';
      $('#ovstand').textContent = J.standLine(d);
    } catch (e) { ch.opt.empty = J.errText(e); ch.set([], {}); }
  };
  const renderW = () => {
    const list = J.S.watch.map(x => { const dd = rows[x]; const q = dd && J.quote(dd); return { s: x, d: dd, q }; });
    $('#wlist').innerHTML = `<table><tbody>${list.map(({ s: x, d: dd, q }) => `<tr class="click" data-s="${esc(x)}"><td style="padding-left:4px"><b>${esc(J.short(x))}</b><div class="note" style="max-width:130px;overflow:hidden;text-overflow:ellipsis">${esc(J.name(x))}</div></td><td style="width:70px">${dd ? Spark(dd.candles.slice(-30).map(b => b.c), q.chp >= 0 ? '#2fcf9f' : '#ef5d78', 70, 26).replace('<svg', '<svg style="width:70px;height:26px"') : ''}</td><td class="r"><b>${q ? price(q.last) : '–'}</b><div class="${cls(q?.chp)}" style="font-size:12.5px">${q ? pct(q.chp) : 'noch keine Daten'}</div></td></tr>`).join('')}</tbody></table>`;
    $$('#wlist tr').forEach(tr => tr.onclick = () => { sym = s.sym = tr.dataset.s; $('#ovsym').innerHTML = J.symOptions(sym); J.store.save('settings'); loadMain(); });
    const ok = list.filter(x => x.q && isFinite(x.q.chp));
    if (ok.length) {
      const up = ok.filter(x => x.q.chp > 0).length; const best = [...ok].sort((a, b) => b.q.chp - a.q.chp);
      $('#breadth').innerHTML = `<div class="row nw" style="gap:16px"><div class="big ${up >= ok.length / 2 ? 'up' : 'dn'}">${up}/${ok.length}</div><div>Märkte deiner Watchlist liegen im Plus.<br><span class="note">Stärkster: <b class="up">${esc(J.short(best[0].s))} ${pct(best[0].q.chp)}</b> · Schwächster: <b class="dn">${esc(J.short(best[best.length - 1].s))} ${pct(best[best.length - 1].q.chp)}</b></span></div></div>`;
      const mx = Math.max(...ok.map(x => Math.abs(x.q.chp))) || 1;
      $('#strength').innerHTML = best.map(x => `<div class="row nw" style="gap:10px;margin:7px 0"><span style="width:62px;font-weight:600;font-size:13px">${esc(J.short(x.s))}</span><div style="flex:1;display:grid;grid-template-columns:1fr 1fr;height:12px"><div style="display:flex;justify-content:flex-end">${x.q.chp < 0 ? `<i style="display:block;height:12px;border-radius:4px 0 0 4px;background:var(--bear);width:${Math.abs(x.q.chp) / mx * 100}%"></i>` : ''}</div><div>${x.q.chp > 0 ? `<i style="display:block;height:12px;border-radius:0 4px 4px 0;background:var(--bull);width:${x.q.chp / mx * 100}%"></i>` : ''}</div></div><span class="${cls(x.q.chp)}" style="width:72px;text-align:right;font-size:13px">${pct(x.q.chp)}</span></div>`).join('');
    } else $('#strength').innerHTML = '<p class="note">Noch keine Kurse – Archiv- und Krypto-Märkte laden sofort, die übrigen nach dem ersten Lauf der GitHub-Aktion „Marktdaten für Jarvis“.</p>';
  };
  const loadW = async force => { rows = await J.loadDaily(J.S.watch, force); renderW(); };
  $('#ovsym').onchange = e => { sym = s.sym = e.target.value; J.store.save('settings'); loadMain(); };
  $$('#ovtf button').forEach(b => b.onclick = () => { tf = s.tf = b.dataset.tf; J.store.save('settings'); $$('#ovtf button').forEach(x => x.classList.toggle('on', x === b)); loadMain(); });
  $$('[data-ind]').forEach(b => b.onclick = () => { s.ind[b.dataset.ind] = !s.ind[b.dataset.ind]; b.classList.toggle('acc'); J.store.save('settings'); draw(); });
  $('#ovline').onclick = () => { lineMode = !lineMode; $('#ovline').classList.toggle('pri', lineMode); if (lineMode) J.toast('Tippe in den Chart, um die Linie zu setzen'); };
  $('#ovclr').onclick = () => { s.lines[sym] = []; J.store.save('settings'); draw(); };
  $('#ovcsv').onclick = async () => { const k = await J.pickCSV(); if (k) { sym = s.sym = k; $('#ovsym').innerHTML = J.symOptions(sym); loadMain(); } };
  $('#wref').onclick = () => { loadW(true); loadMain(true); };
  $('#wedit').onclick = () => editWatch(() => loadW());
  $('#ovja').onclick = async () => {
    const out = $('#ovjout'); out.style.display = 'block'; out.innerHTML = '<p class="note"><span class="spin"></span> Jarvis liest den Chart …</p>';
    try {
      if (!d) throw { code: 'nodata' }; const c = d.candles, v = TA.closes(c), L = c.length - 1; const e20 = TA.ema(v, 20), e50 = TA.ema(v, 50), e200 = TA.ema(v, 200), r = TA.rsi(v), a = TA.atr(c), reg = TA.regime(c);
      const ctx = { markt: J.name(sym), zeitrahmen: d.tf, quelle: d.src, letzterKurs: c[L].c, ema20: e20[L], ema50: e50[L], ema200: e200[L], rsi14: r[L], atr14: a[L], regime: reg[L] ? TA.REG[reg[L]][0] : null, hoch50: Math.max(...c.slice(-50).map(b => b.h)), tief50: Math.min(...c.slice(-50).map(b => b.l)), eigeneLinien: s.lines[sym] || [], kerzen: c.slice(-40).map(b => [new Date(b.t).toISOString().slice(0, 16), +b.o.toFixed(4), +b.h.toFixed(4), +b.l.toFixed(4), +b.c.toFixed(4)]) };
      const t = await Jarvis.think(`${Jarvis.persona()}\n\nAnalysiere diesen Chart als Price-Action-Trader. Struktur: ### Trend & Struktur, ### Wichtige Zonen (nur aus den Daten), ### Long-Szenario, ### Short-Szenario (je Trigger, Stop, Ziel in Kurs und R), ### Was den Plan ungültig macht. Kurz halten.\n\nDaten (JSON): ${JSON.stringify(ctx)}`, { onText: ({ text }) => out.innerHTML = J.md(text) });
      out.innerHTML = J.md(t); Jarvis.speak(t);
    } catch (e) { out.innerHTML = `<p class="note">${esc(e?.code === 'nodata' ? 'Erst Kurse laden.' : Jarvis.err(e))}</p>`; }
  };
  $('#ovj').onclick = async () => {
    const out = $('#ovjo2'); const data = J.S.watch.map(x => { const dd = rows[x]; if (!dd) return null; const q = J.quote(dd); return `${J.name(x)}: ${q.last.toFixed(2)} | 1T ${q.chp?.toFixed(2)}% | 1W ${J.chg(dd.candles, 5)?.toFixed(2)}% | 1M ${J.chg(dd.candles, 21)?.toFixed(2)}% (${dd.src})`; }).filter(Boolean);
    if (!data.length) { out.innerHTML = '<p class="note">Erst Kurse laden.</p>'; return; }
    out.innerHTML = '<p class="note"><span class="spin"></span> Jarvis denkt …</p>';
    try { const t = await Jarvis.think(`${Jarvis.persona()}\n\nGib mir in 4–6 kurzen Stichpunkten eine Einschätzung der Marktlage NUR auf Basis dieser echten Daten. Nenne Risk-on/Risk-off-Signale, Divergenzen und worauf ich heute achten sollte. Ende mit einer Frage an mich.\n\n${data.join('\n')}`, { onText: ({ text }) => out.innerHTML = J.md(text) }); out.innerHTML = J.md(t); Jarvis.speak(t); }
    catch (e) { out.innerHTML = `<p class="note">${esc(Jarvis.err(e))}</p>`; }
  };
  loadMain(); loadW();
  return () => ch.destroy();
};
  const editWatch = done => {
  const cur = new Set(J.S.watch);
  J.modal('Watchlist bearbeiten', `<p class="note">Wähle bis zu 16 Märkte.</p><div style="columns:2 220px;gap:16px">${J.SYM.map(s => `<label class="row nw" style="margin:6px 0;break-inside:avoid"><input type="checkbox" value="${esc(s[0])}" ${cur.has(s[0]) ? 'checked' : ''}><span>${esc(s[2])} <span class="note">${esc(s[1])}</span></span></label>`).join('')}</div><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn pri" id="wsave">Speichern</button></div>`, (b, close) => {
    b.querySelector('#wsave').onclick = () => { J.S.watch = [...b.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value).slice(0, 16); J.store.save('watch'); close(); done(); };
  });
};

/* ===================== Morning Briefing ===================== */
V.briefing = el => {
  const list = J.S.briefings;
  const show = b => b ? `<div class="row"><span class="chip gold">Jarvis</span><span class="note">${J.dt(b.t)}</span><div class="sp"></div><button class="btn sm" id="bspeak">${J.icon('speaker')}Vorlesen</button><button class="btn sm ghost" id="bcopy">Kopieren</button></div><div class="md" id="btext" style="margin-top:8px">${J.md(b.text)}</div>${b.sources?.length ? `<div class="hr"></div><div class="note">Quellen der Nachrichten:</div><ul class="note" style="margin:6px 0;padding-left:18px">${b.sources.slice(0, 10).map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(String(s.title).slice(0, 110))}</a>${s.src ? ' · ' + esc(s.src) : ''}</li>`).join('')}</ul>` : ''}` : `<div class="empty"><b>Noch kein Briefing</b><span>Jarvis nimmt die echten Kurse deiner Watchlist, die neuesten Schlagzeilen und die Wirtschaftstermine von heute und schreibt dir daraus deinen Tagesplan.</span></div>`;
  el.innerHTML = `<div class="page-hd"><div><h1>Morning Briefing</h1><p class="mut">Dein Tagesplan von Jarvis</p></div></div>
  <div class="split"><div class="card glass" style="min-height:420px"><h3>Dein Briefing <span class="sp"></span><button class="btn gold" id="bgo">Briefing erstellen</button></h3>${J.brainHint()}<div id="bsteps"></div><div id="bout">${show(list[0])}</div></div>
  <div class="grid" style="align-content:start"><div class="card"><h3>Termine heute <small id="calsrc"></small></h3><div id="bcal" class="note">Lade …</div></div>
  <div class="card"><h3>Frühere Briefings</h3><div id="bhist">${list.length ? list.map((b, i) => `<button class="btn ghost sm" style="width:100%;justify-content:flex-start" data-i="${i}">${J.dt(b.t)}</button>`).join('') : '<p class="note">Noch keine.</p>'}</div></div></div></div>`;
  const bind = b => { const sp = $('#bspeak'); if (sp) sp.onclick = () => Jarvis.speak(b.text, true).then(ok => ok || J.toast('Sprachausgabe ist hier nicht verfügbar.')); const cp = $('#bcopy'); if (cp) cp.onclick = () => navigator.clipboard.writeText(b.text).then(() => J.toast('Kopiert', 'good')).catch(() => J.toast('Kopieren nicht erlaubt')); };
  bind(list[0]);
  $$('#bhist [data-i]').forEach(x => x.onclick = () => { const b = list[+x.dataset.i]; $('#bout').innerHTML = show(b); bind(b); });
  let todays = [];
  J.calendar().then(c => { if (!c) { $('#bcal').textContent = 'Kalender wird von der GitHub-Aktion geladen (stündlich).'; return; } const td = J.today(); todays = (c.events || []).filter(e => J.dayOf(Date.parse(e.date) / 1000) === td); $('#calsrc').textContent = c.source || ''; $('#bcal').innerHTML = todays.length ? todays.map(e => `<div class="row nw" style="margin:6px 0"><span style="width:52px">${new Date(e.date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}</span><span class="chip ${e.impact === 'High' ? 'dn' : e.impact === 'Medium' ? 'warn' : ''}">${esc(e.country)}</span><span style="flex:1;color:var(--text)">${esc(e.title)}</span></div>`).join('') : 'Heute keine Termine im Kalender.'; });
  $('#bgo').onclick = async () => {
    const btn = $('#bgo'); btn.disabled = true;
    const st = (i, m) => { const L = ['Kurse laden', 'Nachrichten', 'Jarvis schreibt']; $('#bsteps').innerHTML = `<div class="row" style="margin-bottom:10px">${L.map((l, k) => `<span class="chip ${k < i ? 'up' : k === i ? 'acc' : ''}">${k === i ? '<span class="spin" style="width:10px;height:10px"></span>' : k < i ? '✓' : ''} ${l}</span>`).join('')}</div>${m ? `<p class="note">${esc(m)}</p>` : ''}`; };
    try {
      st(0); const rows = await J.loadDaily(J.S.watch);
      const lines = J.S.watch.map(x => { const d = rows[x]; if (!d) return null; const c = d.candles, q = J.quote(d), pd = c[c.length - 2]; return `- ${J.name(x)}: letzter Kurs ${q.last.toFixed(2)}, 1T ${q.chp?.toFixed(2)}%, 1W ${J.chg(c, 5)?.toFixed(2)}%, 1M ${J.chg(c, 21)?.toFixed(2)}%; Vortag Hoch ${pd?.h.toFixed(2)} / Tief ${pd?.l.toFixed(2)} / Schluss ${pd?.c.toFixed(2)}; 20-Tage-Hoch ${Math.max(...c.slice(-20).map(b => b.h)).toFixed(2)}, -Tief ${Math.min(...c.slice(-20).map(b => b.l)).toFixed(2)} (letzte Kerze ${J.dt(q.t)})`; }).filter(Boolean);
      st(1); let news = [];
      try { news = Jarvis.mcp ? await Jarvis.webSearch('Wichtigste Börsen- und Wirtschaftsnachrichten von heute: US-Indizes, Nasdaq, DAX, Fed, Zinsen, Krypto, Öl, Termine', ['stock market news today', 'Börse heute DAX Nasdaq', 'Fed rates news today']) : (await Jarvis.news('alle')).items; } catch (e) { st(1, 'Keine Nachrichten verfügbar.'); }
      const nctx = news.slice(0, 14).map((n, i) => `[${i + 1}] ${n.title} (${n.src || ''}, ${n.date || ''}) ${n.url}\n${(n.text || '').slice(0, 500)}`).join('\n');
      const cal = todays.map(e => `${new Date(e.date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr · ${e.country} · ${e.title} · Wichtigkeit ${e.impact}${e.forecast ? ' · Prognose ' + e.forecast : ''}${e.previous ? ' · vorher ' + e.previous : ''}`).join('\n');
      st(2);
      const prompt = `${Jarvis.persona()}\n\nErstelle Elianos Morning Briefing für heute. Nutze AUSSCHLIESSLICH die Daten unten. Struktur mit ### Überschriften:\n### Lage in drei Sätzen\n### Treiber & Nachrichten (mit Quellenlink [Titel](URL))\n### Termine heute (aus dem Kalender, Uhrzeiten deutsche Zeit)\n### Levels für heute (Vortageshoch/-tief und 20-Tage-Hoch/-Tief der wichtigsten Märkte)\n### Plan & Risiko (Wenn-dann-Szenarien)\n### Zwei Fragen an Eliano\nMaximal ca. 380 Wörter.\n\nKURSE:\n${lines.join('\n') || 'keine'}\n\nTERMINE HEUTE:\n${cal || 'keine im Kalender'}\n\nNACHRICHTEN:\n${nctx || 'keine'}`;
      $('#bout').innerHTML = '<div class="md" id="btext"></div>';
      const text = await Jarvis.think(prompt, { onText: ({ text }) => { const b = $('#btext'); if (b) b.innerHTML = J.md(text); } });
      const b = { t: Date.now(), text, sources: news.slice(0, 10).map(n => ({ title: n.title, url: n.url, src: n.src })) };
      J.S.briefings.unshift(b); J.S.briefings = J.S.briefings.slice(0, 12); J.store.save('briefings');
      $('#bsteps').innerHTML = ''; $('#bout').innerHTML = show(b); bind(b); Jarvis.speak(text);
    } catch (e) { $('#bsteps').innerHTML = `<p class="note">${esc(Jarvis.err(e))}</p>`; }
    btn.disabled = false;
  };
};

/* ===================== Markt-Explorer ===================== */
  const UNIV = {
  sek: ['US-Sektoren', [['XLK', 'Technologie'], ['SMH', 'Halbleiter'], ['XLC', 'Kommunikation'], ['XLY', 'Zyklischer Konsum'], ['XLF', 'Finanzen'], ['XLI', 'Industrie'], ['XLV', 'Gesundheit'], ['XLP', 'Basiskonsum'], ['XLE', 'Energie'], ['XLB', 'Grundstoffe'], ['XLU', 'Versorger'], ['XLRE', 'Immobilien']]],
  mega: ['Mega Caps', [['NVDA', 'Nvidia'], ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['AMZN', 'Amazon'], ['GOOGL', 'Alphabet'], ['META', 'Meta'], ['AVGO', 'Broadcom'], ['TSLA', 'Tesla'], ['NFLX', 'Netflix'], ['AMD', 'AMD'], ['PLTR', 'Palantir'], ['JPM', 'JPMorgan']]],
  asset: ['Assetklassen', [['SPY', 'US-Aktien'], ['QQQ', 'Nasdaq 100'], ['IWM', 'US Small Caps'], ['EFA', 'Industrieländer ex US'], ['EEM', 'Schwellenländer'], ['TLT', 'US-Anleihen 20J+'], ['HYG', 'Hochzinsanleihen'], ['GLD', 'Gold'], ['SLV', 'Silber'], ['USO', 'Öl'], ['UUP', 'US-Dollar'], ['BTCUSDT', 'Bitcoin']]],
  arch: ['Dein Archiv', [['ar:NAS100', 'Nasdaq 100'], ['ar:US500', 'S&P 500'], ['ar:US30', 'Dow Jones'], ['ar:GER40', 'DAX 40'], ['ar:XAUUSD', 'Gold']]],
  de: ['Deutschland', [['^GDAXI', 'DAX'], ['SAP.DE', 'SAP'], ['SIE.DE', 'Siemens'], ['ALV.DE', 'Allianz'], ['RHM.DE', 'Rheinmetall'], ['DTE.DE', 'Telekom'], ['MBG.DE', 'Mercedes-Benz'], ['BMW.DE', 'BMW'], ['BAS.DE', 'BASF'], ['DBK.DE', 'Deutsche Bank'], ['IFX.DE', 'Infineon'], ['ADS.DE', 'Adidas']]]
};
V.explorer = el => {
  let u = 'sek', sort = ['m1', -1], data = {};
  el.innerHTML = `<div class="page-hd"><div><h1>Markt-Explorer</h1><p class="mut">Wer ist stark, wer schwach – relative Stärke über mehrere Zeiträume</p></div></div>
  <div class="card"><h3><div class="seg" id="xu">${Object.entries(UNIV).map(([k, v]) => `<button data-u="${k}" class="${k === u ? 'on' : ''}">${v[0]}</button>`).join('')}</div></h3><div class="scroll" id="xt"><p class="note">Lade …</p></div><p class="note" style="margin-top:8px">Echte Tagesschlusskurse. RS = 3-Monats-Performance minus S&P 500 (SPY). Zeile antippen öffnet den Markt im Marktüberblick.</p></div>
  <div class="card" style="margin-top:16px"><h3>Rotation · 1 Monat</h3><div id="xrot"></div></div>`;
  const cols = [['d1', '1T'], ['w1', '1W'], ['m1', '1M'], ['m3', '3M'], ['ytd', 'YTD'], ['y1', '1J'], ['rs', 'RS vs SPY']];
  const heat = v => { if (v == null) return 'background:var(--bg);color:var(--faint)'; const a = Math.min(1, Math.abs(v) / 12); return `background:${v >= 0 ? `rgba(47,207,159,${.12 + a * .55})` : `rgba(239,93,120,${.12 + a * .55})`}`; };
  const render = () => {
    const spy = data['SPY']; const spy3 = spy ? J.chg(spy.candles, 63) : null;
    const rows = UNIV[u][1].map(([s, n]) => { const c = data[s]?.candles; return { s, n, d1: c ? J.chg(c, 1) : null, w1: c ? J.chg(c, 5) : null, m1: c ? J.chg(c, 21) : null, m3: c ? J.chg(c, 63) : null, ytd: c ? J.ytd(c) : null, y1: c ? J.chg(c, 252) : null, rs: c && spy3 != null ? J.chg(c, 63) - spy3 : null, last: c ? c[c.length - 1].c : null }; });
    rows.sort((a, b) => ((a[sort[0]] ?? -1e9) - (b[sort[0]] ?? -1e9)) * sort[1]);
    $('#xt').innerHTML = `<table class="heat"><thead><tr><th>Markt</th><th class="r">Kurs</th>${cols.map(([k, l]) => `<th class="r" style="cursor:pointer" data-k="${k}">${l}${sort[0] === k ? (sort[1] < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="click" data-s="${esc(r.s)}"><td><b>${esc(J.short(r.s).replace('^', ''))}</b> <span class="note">${esc(r.n)}</span></td><td class="r">${price(r.last)}</td>${cols.map(([k]) => `<td class="hc" style="${heat(r[k])}">${r[k] == null ? '–' : pct(r[k], 1)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $$('#xt th[data-k]').forEach(th => th.onclick = () => { sort = [th.dataset.k, sort[0] === th.dataset.k ? -sort[1] : -1]; render(); });
    $$('#xt tr[data-s]').forEach(tr => tr.onclick = () => { J.S.settings.sym = tr.dataset.s; J.store.save('settings'); J.go('markt'); });
    const ok = rows.filter(r => r.m1 != null).sort((a, b) => b.m1 - a.m1); const mx = Math.max(...ok.map(r => Math.abs(r.m1)), 1);
    $('#xrot').innerHTML = ok.length ? ok.map(r => `<div class="row nw" style="margin:6px 0"><span style="width:150px;font-size:13px;overflow:hidden;text-overflow:ellipsis">${esc(r.n)}</span><div class="bar" style="flex:1;background:none"><i style="width:${Math.abs(r.m1) / mx * 100}%;background:${r.m1 >= 0 ? 'var(--bull)' : 'var(--bear)'}"></i></div><span class="${cls(r.m1)}" style="width:70px;text-align:right;font-size:13px">${pct(r.m1, 1)}</span></div>`).join('') : '<p class="note">Noch keine Daten – die GitHub-Aktion „Marktdaten für Jarvis“ lädt sie stündlich.</p>';
  };
  const load = async () => { $('#xt').innerHTML = '<p class="note"><span class="spin"></span> Lade Märkte …</p>'; Object.assign(data, await J.loadDaily([...UNIV[u][1].map(([s]) => s), 'SPY'])); render(); };
  $$('#xu button').forEach(b => b.onclick = () => { u = b.dataset.u; $$('#xu button').forEach(x => x.classList.toggle('on', x === b)); load(); });
  load();
};

/* ===================== News Intelligence ===================== */
  const TOPICS = { alle: 'Alle', markt: 'Markt', fed: 'Fed & Wirtschaft', tech: 'Tech & KI', krypto: 'Krypto', dax: 'DAX & Deutschland', rohstoff: 'Rohstoffe' };
V.news = el => {
  let topic = 'alle', items = [], ana = null;
  el.innerHTML = `<div class="page-hd"><div><h1>News Intelligence</h1><p class="mut" id="nupd">Schlagzeilen aus Finanz-Feeds, stündlich aktualisiert</p></div></div>
  <div class="card"><div class="row"><div class="seg" id="nt">${Object.entries(TOPICS).map(([k, v]) => `<button data-t="${k}" class="${k === topic ? 'on' : ''}">${v}</button>`).join('')}</div><div class="sp"></div><form id="nf" class="row nw" style="min-width:min(100%,360px)"><input id="nq" placeholder="Thema filtern oder Jarvis im Web fragen"><button class="btn">Filtern</button><button class="btn gold" type="button" id="nweb">Web</button></form></div></div>
  <div id="nweb-out" class="card md" style="margin-top:16px;display:none"></div>
  <div class="split" style="margin-top:16px"><div class="card"><h3>Nachrichten <span class="sp"></span><button class="btn gold sm" id="na">Jarvis-Analyse</button></h3><div id="nl" class="news"></div></div>
  <div class="grid" style="align-content:start"><div class="card"><h3>Stimmung</h3><div id="ns" class="mut">Die Jarvis-Analyse ordnet jede Meldung nach Stimmung, betroffenen Märkten und Relevanz ein.</div>${J.brainHint()}</div></div></div>`;
  const render = () => {
    const A = ana?.meldungen || [];
    $('#nl').innerHTML = items.length ? items.slice(0, 30).map((n, i) => { const a = A.find(x => x.nr === i + 1); return `<article><div class="row nw" style="align-items:flex-start"><a href="${esc(n.url)}" target="_blank" rel="noopener" style="flex:1">${esc(n.title)}</a>${a ? `<span class="chip ${a.stimmung === 'bullish' ? 'up' : a.stimmung === 'bearish' ? 'dn' : ''}">${esc(a.stimmung)}</span>` : ''}</div><div class="note">${esc(n.src || '')}${n.date ? ' · ' + esc(n.date) : ''}</div>${n.text ? `<p>${esc(n.text.slice(0, 220))}${n.text.length > 220 ? ' …' : ''}</p>` : ''}${a ? `<div class="row" style="margin-top:8px">${(a.maerkte || []).slice(0, 4).map(m => `<span class="chip">${esc(m)}</span>`).join('')}<span class="chip warn">Relevanz ${esc(a.relevanz)}/5</span></div><p style="color:var(--text)">${esc(a.fazit || '')}</p>` : ''}</article>`; }).join('') : '<p class="note">Keine Meldungen für diesen Filter.</p>';
    if (ana?.gesamt) { const b = A.filter(x => x.stimmung === 'bullish').length, r = A.filter(x => x.stimmung === 'bearish').length, n = A.length - b - r, t = A.length || 1;
      $('#ns').innerHTML = `<div class="row nw" style="height:14px;border-radius:9px;overflow:hidden;gap:0"><i style="height:100%;width:${b / t * 100}%;background:var(--bull)"></i><i style="height:100%;width:${n / t * 100}%;background:var(--faint)"></i><i style="height:100%;width:${r / t * 100}%;background:var(--bear)"></i></div><div class="row" style="margin:8px 0"><span class="chip up">${b} bullish</span><span class="chip">${n} neutral</span><span class="chip dn">${r} bearish</span></div><p style="color:var(--text)"><b>${esc(ana.gesamt.stimmung || '')}</b> – ${esc(ana.gesamt.zusammenfassung || '')}</p>`; }
  };
  const load = async (q) => {
    ana = null; $('#nl').innerHTML = '<p class="note"><span class="spin"></span> Lade …</p>';
    try {
      if (Jarvis.mcp && q) items = (await Jarvis.webSearch('Aktuelle Nachrichten zu: ' + q, [q, q + ' news'])).slice(0, 12);
      else { const r = await Jarvis.news(topic, q); items = r.items; $('#nupd').textContent = 'Schlagzeilen aus Finanz-Feeds · Stand ' + J.dt(Date.parse(r.updated)); }
      render();
    } catch (e) { $('#nl').innerHTML = `<p class="note">${esc(e?.code === 'missing' ? 'Die Nachrichten-Datei entsteht beim ersten Lauf der GitHub-Aktion „Marktdaten für Jarvis“ (stündlich).' : J.errText(e))}</p>`; }
  };
  $$('#nt button').forEach(b => b.onclick = () => { topic = b.dataset.t; $('#nq').value = ''; $$('#nt button').forEach(x => x.classList.toggle('on', x === b)); load(); });
  $('#nf').onsubmit = e => { e.preventDefault(); load($('#nq').value.trim()); };
  $('#nweb').onclick = async () => {
    const q = $('#nq').value.trim(); if (!q) return J.toast('Schreib ein Thema ins Feld');
    const out = $('#nweb-out'); out.style.display = 'block'; out.innerHTML = '<p class="note"><span class="spin"></span> Jarvis sucht im Web …</p>';
    try { const t = await Jarvis.think(`${Jarvis.persona()}\n\nSuche im Web nach aktuellen Nachrichten zu „${q}“ und fasse zusammen: ### Was passiert ist, ### Was das für Indizes/Futures/Krypto heißt, ### Worauf ich achten sollte. Nenne die Quellen.`, { search: true, onText: ({ text }) => out.innerHTML = J.md(text), tools: Jarvis.canTools() ? Jarvis.tools().filter(x => x.name === 'web_suche') : undefined }); out.innerHTML = J.md(t); }
    catch (e) { out.innerHTML = `<p class="note">${esc(Jarvis.err(e))}</p>`; }
  };
  $('#na').onclick = async () => {
    if (!items.length) return J.toast('Erst Nachrichten laden');
    $('#ns').innerHTML = '<p class="note"><span class="spin"></span> Jarvis ordnet ein …</p>';
    try { ana = await Jarvis.think(`Ordne diese Finanznachrichten für einen Daytrader (Nasdaq/S&P-Futures, DAX, Gold, Krypto) ein. Antworte NUR mit JSON: {"meldungen":[{"nr":1,"stimmung":"bullish|bearish|neutral","maerkte":["z. B. Nasdaq"],"relevanz":1-5,"fazit":"ein Satz auf Deutsch"}],"gesamt":{"stimmung":"Risk-on|Risk-off|gemischt","zusammenfassung":"zwei Sätze auf Deutsch"}}. Nutze nur die Inhalte unten.\n\n${items.slice(0, 20).map((n, i) => `${i + 1}. ${n.title} (${n.src || ''})\n${(n.text || '').slice(0, 300)}`).join('\n\n')}`, { json: true }); render(); }
    catch (e) { $('#ns').innerHTML = `<p class="note">${esc(Jarvis.err(e))}</p>`; }
  };
  load();
};

/* ===================== Makroökonomie ===================== */
V.makro = el => {
  const M = [['^IRX', 'US 3 Monate', '%'], ['^FVX', 'US 5 Jahre', '%'], ['^TNX', 'US 10 Jahre', '%'], ['^TYX', 'US 30 Jahre', '%'], ['DX-Y.NYB', 'Dollar-Index', ''], ['^VIX', 'VIX', ''], ['CL=F', 'WTI Öl', '$'], ['GC=F', 'Gold', '$'], ['HG=F', 'Kupfer', '$'], ['EURUSD=X', 'EUR/USD', '']];
  el.innerHTML = `<div class="page-hd"><div><h1>Makroökonomie</h1><p class="mut">Zinsen, Dollar, Volatilität, Rohstoffe und Termine</p></div></div>
  <div class="grid g4" id="mt">${M.map(m => `<div class="tile"><div class="nm"><span>${m[1]}</span></div><div class="pr skel">0000</div></div>`).join('')}</div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h3>US-Zinskurve <small>heute vs. vor 3 Monaten vs. vor 1 Jahr</small></h3><div id="mcurve" style="height:250px;position:relative"><p class="note">Lade …</p></div><div id="mspread" class="note"></div></div>
  <div class="card"><h3>Kupfer/Gold-Verhältnis <small>Konjunktur-Barometer · 1 Jahr</small></h3><div class="fig" id="mcg" style="min-height:240px"></div><p class="note">Steigt das Verhältnis, preist der Markt eher Wachstum ein; fällt es, eher Vorsicht.</p></div></div>
  <div class="card" style="margin-top:16px"><h3>Wirtschaftstermine dieser Woche <span class="sp"></span><small id="mcals"></small><button class="btn gold sm" id="mj">Jarvis: Makro-Einordnung</button></h3><div id="mjout" class="md"></div><div id="mcal" class="scroll note">Lade …</div></div>`;
  let data = {}; const offs = [];
  const at = (c, back) => c[Math.max(0, c.length - 1 - back)]?.c;
  (async () => {
    data = await J.loadDaily(M.map(m => m[0]));
    $('#mt').innerHTML = M.map(([s, n, u]) => { const d = data[s]; if (!d) return `<div class="tile"><div class="nm"><span>${n}</span></div><div class="note">noch keine Daten</div></div>`; const c = d.candles, q = J.quote(d); const isY = u === '%'; const ch = isY ? (q.last - q.prev) * 100 : q.chp;
      return `<div class="tile" data-s="${esc(s)}"><div class="nm"><span>${n}</span><span class="${cls(ch)}">${isY ? (ch > 0 ? '+' : '') + num(ch, 1) + ' Bp' : pct(q.chp)}</span></div><div class="pr">${isY ? num(q.last, 3) + ' %' : price(q.last)}</div><div class="note">1M ${isY ? num((q.last - at(c, 21)) * 100, 0) + ' Bp' : pct(J.chg(c, 21), 1)} · 1J ${isY ? num((q.last - at(c, 252)) * 100, 0) + ' Bp' : pct(J.chg(c, 252), 1)}</div>${Spark(c.slice(-60).map(b => b.c), '#6f8dff')}</div>`; }).join('');
    $$('#mt [data-s]').forEach(t => t.onclick = () => { J.S.settings.sym = t.dataset.s; J.store.save('settings'); J.go('markt'); });
    const pts = ['^IRX', '^FVX', '^TNX', '^TYX'].map(s => data[s]?.candles);
    if (pts.every(Boolean)) {
      const lab = ['3M', '5J', '10J', '30J'], now = pts.map(c => c[c.length - 1].c), m3 = pts.map(c => at(c, 63)), y1 = pts.map(c => at(c, 252));
      const all = [...now, ...m3, ...y1].filter(isFinite), lo = Math.min(...all) - .2, hi = Math.max(...all) + .2;
      const host = $('#mcurve'); const draw = () => { const W = host.clientWidth, H = 230; if (!W) return; const X = i => 40 + i / 3 * (W - 80), Y = v => 16 + (hi - v) / (hi - lo) * (H - 52);
        const path = (a, c, w, dash) => `<polyline points="${a.map((v, i) => X(i) + ',' + Y(v)).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}" ${dash ? 'stroke-dasharray="5 4"' : ''}/>${a.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="${w + 1.5}" fill="${c}"/>`).join('')}`;
        host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px">${lab.map((l, i) => `<text x="${X(i)}" y="${H - 8}" fill="#7c88a4" font-size="12" text-anchor="middle">${l}</text>`).join('')}${path(y1, '#66728e', 1.5, true)}${path(m3, '#8b6cff', 1.5, true)}${path(now, '#f2c14e', 2.5)}${now.map((v, i) => `<text x="${X(i)}" y="${Y(v) - 10}" fill="#e8edf7" font-size="12" font-weight="600" text-anchor="middle">${num(v, 2)}</text>`).join('')}</svg><div class="row note"><span><i style="display:inline-block;width:14px;height:3px;background:#f2c14e;vertical-align:middle"></i> heute</span><span><i style="display:inline-block;width:14px;height:3px;background:#8b6cff;vertical-align:middle"></i> vor 3 M.</span><span><i style="display:inline-block;width:14px;height:3px;background:#66728e;vertical-align:middle"></i> vor 1 J.</span></div>`; };
      draw(); const ro = new ResizeObserver(draw); ro.observe(host); offs.push(() => ro.disconnect());
      const sp = (now[2] - now[0]) * 100; $('#mspread').innerHTML = `Spread 10J – 3M: <b class="${sp < 0 ? 'dn' : 'up'}">${num(sp, 0)} Bp</b> · Kurve ${sp < 0 ? '<b class="dn">invertiert</b> (historisch ein Rezessionssignal)' : '<b class="up">normal</b>'}`;
    } else $('#mcurve').innerHTML = '<p class="note">Zinsdaten kommen mit dem ersten Lauf der GitHub-Aktion „Marktdaten für Jarvis“.</p>';
    const cu = data['HG=F']?.candles, au = data['GC=F']?.candles;
    if (cu && au) { const m = new Map(au.map(b => [new Date(b.t).toDateString(), b.c])); const r = cu.slice(-252).map(b => m.has(new Date(b.t).toDateString()) ? b.c / m.get(new Date(b.t).toDateString()) * 1000 : NaN); offs.push(LineChart($('#mcg'), [{ v: r, color: '#f2c14e', fill: '#f2c14e33' }], { fmt: x => num(x, 2) })); }
    else $('#mcg').innerHTML = '<p class="note" style="position:static">Kommt mit den Marktdaten.</p>';
  })();
  J.calendar().then(c => {
    if (!c) { $('#mcal').textContent = 'Der Kalender entsteht beim ersten Lauf der GitHub-Aktion „Marktdaten für Jarvis“.'; return; }
    $('#mcals').textContent = (c.source || '') + ' · Stand ' + J.dt(Date.parse(c.updated));
    const ev = (c.events || []).filter(e => e.impact === 'High' || e.impact === 'Medium');
    $('#mcal').innerHTML = ev.length ? `<table><thead><tr><th>Tag</th><th>Zeit</th><th>Land</th><th>Ereignis</th><th class="r">Prognose</th><th class="r">Vorher</th></tr></thead><tbody>${ev.map(e => { const d = new Date(e.date); return `<tr style="${J.dayOf(d / 1000) === J.today() ? 'background:var(--raise)' : ''}"><td>${d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })}</td><td>${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}</td><td><span class="chip ${e.impact === 'High' ? 'dn' : 'warn'}">${esc(e.country)}</span></td><td style="white-space:normal;color:var(--text)">${esc(e.title)}</td><td class="r">${esc(e.forecast || '')}</td><td class="r">${esc(e.previous || '')}</td></tr>`; }).join('')}</tbody></table>` : 'Keine wichtigen Termine diese Woche.';
  });
  $('#mj').onclick = async () => {
    const out = $('#mjout'); out.innerHTML = '<p class="note"><span class="spin"></span> Jarvis denkt …</p>';
    const ctx = M.map(([s, n]) => { const d = data[s]; if (!d) return null; const c = d.candles; return `${n}: ${c[c.length - 1].c.toFixed(3)} (vor 1M ${at(c, 21)?.toFixed(3)}, vor 3M ${at(c, 63)?.toFixed(3)}, vor 1J ${at(c, 252)?.toFixed(3)})`; }).filter(Boolean).join('\n');
    if (!ctx) { out.innerHTML = '<p class="note">Noch keine Makrodaten.</p>'; return; }
    try { const t = await Jarvis.think(`${Jarvis.persona()}\n\nOrdne das Makro-Bild ein (nur diese echten Daten): Zinsen & Kurve, Dollar, Volatilität, Rohstoffe. Was heißt das für Nasdaq-/S&P-Futures und Gold in den nächsten Wochen? Szenarien statt Prognosen. Max. 220 Wörter.\n\n${ctx}`, { onText: ({ text }) => out.innerHTML = J.md(text) }); out.innerHTML = J.md(t); Jarvis.speak(t); }
    catch (e) { out.innerHTML = `<p class="note">${esc(Jarvis.err(e))}</p>`; }
  };
  return () => offs.forEach(f => f());
};
}
