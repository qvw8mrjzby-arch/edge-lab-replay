/* Jarvis-Terminal — Jarvis in deinen bisherigen Bereichen: Charts & Replay (ohne Blick in die Zukunft), Journal, Statistik, Analyse */
'use strict';
{
  const esc = J.esc;
  const ask = (title, run, sub) => J.modal(title, `${sub ? `<p class="note">${esc(sub)}</p>` : ''}<div class="md" id="jhout"><p class="note"><span class="spin"></span> Jarvis denkt …</p></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn sm" id="jhcopy">Kopieren</button><button class="btn sm" id="jhspeak">${J.icon('speaker')}Vorlesen</button></div>`, async (b) => {
    const o = b.querySelector('#jhout');
    if (!Jarvis.brain()) { await Jarvis.ready; if (!Jarvis.brain()) { o.innerHTML = J.keyForm || `<p class="note">${esc(Jarvis.err({ code: 'nobrain' }))}</p><a class="btn pri sm" href="#copilot">Zum Copilot</a>`; return; } }
    try {
      const t = await run(text => { o.innerHTML = J.md(text); });
      o.innerHTML = J.md(t);
      b.querySelector('#jhspeak').onclick = () => Jarvis.speak(t, true).then(ok => ok || J.toast('Sprachausgabe ist hier nicht verfügbar.'));
      b.querySelector('#jhcopy').onclick = () => navigator.clipboard.writeText(t).then(() => J.toast('Kopiert', 'good')).catch(() => J.toast('Kopieren nicht erlaubt'));
      Jarvis.speak(t);
    } catch (e) { o.innerHTML = `<p class="note">${esc(Jarvis.err(e))}</p>`; }
  });
  J.jvAsk = (...x) => ask(...x);
  const bar = (host, id, html) => { if (!host) return null; let el = host.querySelector('#' + id); if (el) return el; host.insertAdjacentHTML('afterbegin', `<div class="jt jt-bar" id="${id}"><span class="jt-orb" aria-hidden="true"></span>${html}</div>`); return host.querySelector('#' + id); };
  const r2 = x => (x == null || !isFinite(x)) ? null : +(+x).toFixed(2);
  const f4 = x => (x == null || !isFinite(x)) ? null : +(+x).toPrecision(7);
  const berlin = t => new Date(t * 1000).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  const stratRules = name => { const s = (App.strategies || []).find(x => x.name === name); return s ? { name: s.name, beschreibung: s.desc || '', regeln: (s.rules || '').split('\n').filter(Boolean) } : null; };
  const toB64 = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => res(null); r.readAsDataURL(blob); });

  /* ---------- Statistik über dein Journal (für Coaching & Analyse) ---------- */
  const deepStats = (T) => {
    const by = (f) => { const m = {}; for (const t of T) { const k = f(t); if (k == null || k === '') continue; (m[k] = m[k] || []).push(t); } return Object.fromEntries(Object.entries(m).map(([k, L]) => { const s = TA.journalStats(L); return [k, { trades: s.n, netto: r2(s.net), trefferquote: r2(s.winRate), avgR: r2(s.avgR), pf: s.pf === Infinity ? 'unendlich' : r2(s.pf) }]; })); };
    const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const hb = t => +new Date(t.entryT * 1000).toLocaleString('de-DE', { hour: '2-digit', hour12: false, timeZone: 'Europe/Berlin' });
    const g = TA.journalStats(T);
    const mfeR = T.filter(t => t.mfeR != null), maeR = T.filter(t => t.maeR != null);
    const moved = T.filter(t => t.slFinal != null && t.sl != null && t.slFinal !== t.sl).length;
    return {
      gesamt: { trades: g.n, netto: r2(g.net), trefferquote: r2(g.winRate), pf: g.pf === Infinity ? 'unendlich' : r2(g.pf), avgR: r2(g.avgR), maxDrawdown: r2(g.maxDD), laengsteVerlustserie: g.maxLossStreak, regeltreueProzent: r2(g.rulePct) },
      nachStrategie: by(t => t.setup || 'ohne Strategie'), nachMarkt: by(t => t.sym), nachRichtung: by(t => t.side > 0 ? 'Long' : 'Short'),
      nachStunde: by(t => t.entryT ? hb(t) + ' Uhr' : null), nachWochentag: by(t => t.entryT ? WD[new Date(t.entryT * 1000).getDay()] : null), nachAusstieg: by(t => t.reason), nachQuelle: by(t => t.src === 'desk' ? 'Handels-Desk' : 'Replay/Backtest'),
      regeln: by(t => t.rulesTotal ? (t.rulesOk ? 'alle Regeln erfüllt' : 'Regeln verletzt') : null),
      mfeMae: { avgMfeR: r2(mfeR.reduce((a, t) => a + t.mfeR, 0) / (mfeR.length || 1)), avgMaeR: r2(maeR.reduce((a, t) => a + t.maeR, 0) / (maeR.length || 1)), stopVerschobenAnzahl: moved },
      ohneNotiz: T.filter(t => !(t.note || '').trim()).length, ohneStop: T.filter(t => t.sl == null).length,
      nachMerkmal: (() => { const m = {}; for (const t of T) for (const x of (Array.isArray(t.tags) ? t.tags : [])) (m[x] = m[x] || []).push(t); return Object.fromEntries(Object.entries(m).map(([k, L]) => { const s = TA.journalStats(L); return [k, { trades: s.n, netto: r2(s.net), trefferquote: r2(s.winRate), avgR: r2(s.avgR) }]; })); })(),
      nachAusfuehrungSterne: by(t => t.grade ? t.grade + ' Sterne' : null),
      bewertetProzent: T.length ? r2(T.filter(t => t.grade).length / T.length * 100) : 0
    };
  };
  J.deepStats = deepStats;

  /* ---------- Charts & Replay: nur Kerzen bis zur aktuellen Replay-Kerze ---------- */
  const replayRead = () => {
    if (!App.base || !App.base.length) return J.toast('Lade zuerst Daten oder starte eine Session.');
    const cur = App.replay.active ? App.cursor : App.base.length - 1;
    const raw = App.base.slice(Math.max(0, cur - 3000), cur + 1).map(b => ({ t: b.t * 1000, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }));
    const blind = App.isBlind ? App.isBlind() : false;
    const step = raw.length > 1 ? (raw[raw.length - 1].t - raw[raw.length - 2].t) / 1000 : 60;
    const agg = (sec) => { if (step >= sec) return raw; const out = []; let cur2 = null, key = null; for (const b of raw) { const k = Math.floor(b.t / 1000 / sec); if (k !== key) { cur2 && out.push(cur2); cur2 = { ...b }; key = k; } else { cur2.h = Math.max(cur2.h, b.h); cur2.l = Math.min(cur2.l, b.l); cur2.c = b.c; cur2.v += b.v; } } cur2 && out.push(cur2); return out; };
    const m5 = agg(300), m15 = agg(900);
    const sess = (App.sess && App.sess.tz) || 'America/New_York';
    const off = (() => { try { const d = new Date(raw[raw.length - 1].t); const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: sess, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map(x => [x.type, x.value])); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(d.getTime() / 60000) * 60000) / 1000; } catch { return 0; } })();
    const vw = TA.vwap(raw, off); const v15 = TA.closes(m15); const e21 = TA.ema(v15, 21), e50 = TA.ema(v15, 50), at = TA.atr(m15, 14); const L = m15.length - 1;
    const tl = (b, i, arr) => blind ? `K-${arr.length - 1 - i}` : new Date(b.t).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    const ctx = {
      markt: App.symbol, quelle: App.source, blindModus: blind, aktuelleKerze: blind ? 'jetzt' : berlin(raw[raw.length - 1].t / 1000), letzterKurs: f4(raw[raw.length - 1].c),
      sessionVWAP: f4(vw[vw.length - 1]), ema21_15m: f4(e21[L]), ema50_15m: f4(e50[L]), atr14_15m: f4(at[L]),
      hoch_letzte_6h: f4(Math.max(...raw.slice(-360).map(b => b.h))), tief_letzte_6h: f4(Math.min(...raw.slice(-360).map(b => b.l))),
      kerzen15m: m15.slice(-32).map((b, i, a) => [tl(b, i, a), f4(b.o), f4(b.h), f4(b.l), f4(b.c)]),
      kerzen5m: m5.slice(-36).map((b, i, a) => [tl(b, i, a), f4(b.o), f4(b.h), f4(b.l), f4(b.c)]),
      offenePositionen: (App.engine && App.engine.open ? App.engine.open() : []).map(o => ({ richtung: o.side > 0 ? 'Long' : 'Short', einstieg: f4(o.entryPrice), stop: f4(o.sl), ziel: f4(o.tp), menge: o.qty })),
      strategie: stratRules(App.settings.ticket && App.settings.ticket.setup)
    };
    ask('Jarvis liest den Chart', (on) => Jarvis.think(`${Jarvis.persona()}\n\nDu bist mein Backtest-Coach im Bar-Replay. WICHTIG: Du siehst nur Kerzen bis zur aktuellen Replay-Kerze – spekuliere nicht über die Zukunft und verrate nichts über spätere Kurse oder das Datum${blind ? ' (Blind-Modus: kein Datum, keine Wochentage nennen)' : ''}. Struktur: ### Was der Chart gerade zeigt (Struktur, VWAP, Trend), ### Zonen, ### Wenn-dann für die nächsten Kerzen (Long/Short mit Trigger, Stop, Ziel in R), ${ctx.offenePositionen.length ? '### Deine offene Position (Stop/Ziel sinnvoll? Regeln?), ' : ''}### Passt das zu deiner Strategie? Max. 220 Wörter.\n\nDaten (JSON): ${JSON.stringify(ctx)}`, { onText: ({ text }) => on(text) }), 'Nur Daten bis zur aktuellen Kerze – kein Blick in die Zukunft.');
  };

  /* ---------- Journal: einzelner Trade & letzte Trades ---------- */
  const reviewTrade = async (j) => {
    if (!j) return;
    const photos = []; try { if (typeof Photos !== 'undefined' && Photos.ok) for (const p of (await Photos.list(j.id)).slice(0, 2)) { const b64 = await toB64(p.blob); if (b64) photos.push({ mime: (p.blob && p.blob.type) || 'image/jpeg', b64 }); } } catch { }
    const ctx = { markt: j.sym, richtung: j.side > 0 ? 'Long' : 'Short', merkmale: Array.isArray(j.tags) ? j.tags : [], ausfuehrungSterne: j.grade || null, quelle: j.src, einstieg: f4(j.entryPrice), ausstieg: f4(j.avgExit || j.exitPrice), stopStart: f4(j.sl), stopEnde: f4(j.slFinal), ziel: f4(j.tp), grund: j.reason, pnl: r2(j.pnl), r: r2(j.r), risiko: r2(j.risk), dauerMin: j.exitT && j.entryT ? Math.round((j.exitT - j.entryT) / 60) : null, maeR: r2(j.maeR), mfeR: r2(j.mfeR), geplantesR: r2(j.plannedR), regeln: j.rulesTotal ? `${j.rulesChecked || 0}/${j.rulesTotal} abgehakt` : 'keine Checkliste', notiz: j.note || '', strategie: stratRules(j.setup) || j.setup || 'keine', fotos: photos.length };
    const useImg = photos.length && Jarvis.brain() === 'gemini';
    ask('Jarvis bewertet den Trade', (on) => Jarvis.think(`${Jarvis.persona()}\n\nBewerte diesen einen Trade wie ein strenger, fairer Coach – Prozess vor Ergebnis. ${useImg ? 'Die angehängten Bilder sind die Chart-Fotos bei Ein- und Ausstieg.' : ''} Struktur: ### Note für den Prozess (A–F, ein Satz warum), ### Was gut war, ### Was du anders machen solltest (konkret, mit Zahlen wie MAE/MFE und R), ### Regel für den nächsten Trade. Max. 200 Wörter.\n\nTrade (JSON): ${JSON.stringify(ctx)}`, { onText: ({ text }) => on(text), images: useImg ? photos : undefined }), photos.length ? (useImg ? `Mit ${photos.length} Chart-Foto(s).` : 'Fotos können nur mit Gemini mitgeschickt werden.') : '');
  };
  const reviewRecent = () => {
    const T = J.journal().slice().sort((a, b) => (a.exitT || 0) - (b.exitT || 0)).slice(-20);
    if (!T.length) return J.toast('Noch keine Trades im Journal.');
    const list = T.map(j => ({ merkmale: Array.isArray(j.tags) ? j.tags : [], sterne: j.grade || null, markt: j.sym, richtung: j.side > 0 ? 'L' : 'S', r: r2(j.r), pnl: r2(j.pnl), grund: j.reason, strategie: j.setup || '', stopVerschoben: j.slFinal != null && j.sl != null && j.slFinal !== j.sl, regelnOk: j.rulesTotal ? !!j.rulesOk : null, maeR: r2(j.maeR), mfeR: r2(j.mfeR), notiz: (j.note || '').slice(0, 120) }));
    ask('Jarvis: deine letzten Trades', (on) => Jarvis.think(`${Jarvis.persona()}\n\nWerte meine letzten ${T.length} Trades aus (Prozess vor Ergebnis). Struktur: ### Muster, die sich wiederholen, ### Stärkster Trade & warum, ### Größtes Leck (mit Zahlen), ### Drei Regeln für die nächste Session, ### Eine Frage an mich. Max. 250 Wörter.\n\n${JSON.stringify(list)}`, { onText: ({ text }) => on(text) }));
  };
  /* ---------- Statistik & Analyse ---------- */
  const coach = () => {
    const T = J.journal(); if (T.length < 3) return J.toast('Für ein Coaching braucht Jarvis mindestens 3 Trades.');
    ask('Jarvis-Coaching', (on) => Jarvis.think(`${Jarvis.persona()}\n\nDu bist mein Trading-Coach. Werte meine Journal-Statistik aus. Struktur: ### Was funktioniert (mit Zahlen), ### Größte Leaks (Strategie, Uhrzeit, Wochentag, Richtung, Ausstiege – nur was die Daten zeigen), ### Edge-Check (reicht die Stichprobe?), ### 3 konkrete Regeln für nächste Woche, ### Eine Frage an mich. Beziehe mein Tagebuch (Plan, Regeltreue, Verfassung, Lektionen) und die Merkmale (Gefühle/Fehler) ein, wenn vorhanden. Max. 280 Wörter.\n\n${JSON.stringify({ statistik: deepStats(T), tagebuch: J.diaryCtx ? J.diaryCtx(14) : [] })}`, { onText: ({ text }) => on(text) }));
  };
  const explainAnalysis = () => {
    const txt = (document.getElementById('aBody')?.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 7000);
    if (!txt.trim()) return J.toast('Die Analyse ist noch leer.');
    ask('Jarvis erklärt deine Fehler-Analyse', (on) => Jarvis.think(`${Jarvis.persona()}\n\nHier ist die automatische Fehler-Analyse meiner Backtest-App (Text) plus meine Statistik. Erkläre die 3 teuersten Muster einfach, warum sie passieren (psychologisch und technisch) und gib mir für jedes eine messbare Gegen-Regel, die ich als Checkliste in meine Strategie schreiben kann. Struktur: ### 1. …, ### 2. …, ### 3. …, ### Meine neue Checkliste (3–6 Zeilen, „- “). Max. 300 Wörter.\n\nANALYSE:\n${txt}\n\nSTATISTIK: ${JSON.stringify(deepStats(J.journal()).gesamt)}`, { onText: ({ text }) => on(text) }));
  };

  /* ---------- Einbau in die Seiten ---------- */
  const D = {
    charts() {
      if (document.getElementById('btnJarvis')) return;
      const cb = document.getElementById('chartBar'); if (!cb) return;
      const b = document.createElement('button'); b.id = 'btnJarvis'; b.type = 'button'; b.title = 'Jarvis liest den Chart (nur bis zur aktuellen Kerze)'; b.setAttribute('aria-label', 'Jarvis: Chart lesen');
      b.innerHTML = '<span class="jt-orb" aria-hidden="true"></span><span class="jl">Jarvis</span>';
      b.onclick = replayRead;
      const bd = document.getElementById('btnData'); bd && bd.nextSibling ? cb.insertBefore(b, bd.nextSibling) : cb.append(b);
    },
    journal() {
      const host = document.querySelector('#view-journal .page-in'); const el = bar(host, 'jhJournal', `<span><b>Jarvis</b> bewertet deine Trades – tippe einen Trade an und dann „Jarvis bewerten“, oder lass alle letzten Trades prüfen.</span><span class="sp"></span><button class="btn gold sm" data-j="recent">Letzte 20 Trades bewerten</button>`);
      if (el) { const h = host.querySelector('.page-h'); if (h && el.previousElementSibling !== h) h.after(el); el.querySelector('[data-j="recent"]').onclick = reviewRecent; }
    },
    stats() {
      const host = document.querySelector('#view-stats .page-in'); const el = bar(host, 'jhStats', `<span><b>Jarvis-Coaching</b>: Was funktioniert, wo deine Leaks sind und welche Regeln du nächste Woche brauchst.</span><span class="sp"></span><button class="btn gold sm" data-j="coach">Coaching starten</button>`);
      if (el) { const h = host.querySelector('.page-h'); if (h && el.previousElementSibling !== h) h.after(el); el.querySelector('[data-j="coach"]').onclick = coach; }
    },
    analyse() {
      const host = document.querySelector('#view-analyse .page-in'); const el = bar(host, 'jhAnalyse', `<span><b>Jarvis</b> erklärt die gefundenen Fehler-Muster und schreibt dir daraus eine Checkliste für deine Strategie.</span><span class="sp"></span><button class="btn gold sm" data-j="explain">Fehler erklären</button>`);
      if (el) { const h = host.querySelector('.page-h'); const sub = document.getElementById('aSub'); const after = sub || h; if (after && el.previousElementSibling !== after) after.after(el); el.querySelector('[data-j="explain"]').onclick = explainAnalysis; }
    }
  };
  let lastTerm = 'charts';
  J.updateTabs = v => {
    const tab = v === 'brain' ? 'brain' : v === 'copilot' ? 'jarvis' : v === 'start' ? 'dash' : 'term';
    if (tab === 'term' && v) lastTerm = v;
    document.querySelectorAll('#jvTabs [data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    const tt = document.getElementById('jvtTerm'); if (tt) tt.setAttribute('href', '#' + lastTerm);
    document.body.classList.toggle('jv-full', tab === 'jarvis');
  };
  J.decorate = v => { try { D[v] && D[v](); } catch (e) { console.warn('Jarvis-Einbau', e); } };
  J.lightOn = () => { try { return localStorage.getItem('elr.light') !== '0'; } catch { return true; } };
  J.initHooks = () => {
    /* Glas-Design (Standard an) und Second Brain beim Öffnen ohne Unterseite */
    /* Privater Import deines Second Brains per Link (#brainimport=…): der Teil nach # verlässt nie dein Gerät */
    if (location.hash.startsWith('#brainimport=')) {
      try { const b64 = location.hash.slice(13).replace(/-/g, '+').replace(/_/g, '/'); const txt = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); const data = JSON.parse(txt); if (!Array.isArray(data.areas)) throw 0; J.loadState(); J.S.brain = { areas: data.areas, imported: Date.now() }; J.store.save('brain'); setTimeout(() => J.toast(`Second Brain geladen: ${data.areas.length} Lebensbereiche`, 'good'), 900); }
      catch (e) { setTimeout(() => J.toast('Import-Link ungültig', 'bad'), 900); }
      history.replaceState(null, '', '#brain');
    }
    /* Helles Apple-Design ist Standard (elr.light = '0' schaltet zurück auf dunkel/Glas); Start = Dashboard, das Universum ist nur noch ein Tab */
    if (J.lightOn()) { document.documentElement.setAttribute('data-light', ''); try { readColors(); App.requestRender(); } catch { } }
    if (typeof Space !== 'undefined') { if (Space.glassOn() && !J.lightOn()) Space.setGlass(true); if (!location.hash || location.hash === '#') history.replaceState(null, '', '#start'); }
    document.querySelector('header.top .brand')?.addEventListener('click', () => { location.hash = '#start'; });
    const f = document.querySelector('#tradeModal .dlg-f');
    if (f && !document.getElementById('tdJarvis')) { const b = document.createElement('button'); b.className = 'btn jt-gold'; b.id = 'tdJarvis'; b.type = 'button'; b.textContent = 'Jarvis bewerten'; b.onclick = () => reviewTrade(UI._trade); const show = document.getElementById('tdShow'); show ? f.insertBefore(b, show) : f.append(b); }
    D.charts();
    /* Jarvis als Hülle: Tabs oben (Second Brain · Jarvis · Trading Terminal) */
    if (!document.getElementById('jvTabs')) {
      const t = document.createElement('div'); t.id = 'jvTabs'; t.setAttribute('role', 'tablist'); t.setAttribute('aria-label', 'Jarvis');
      t.innerHTML = `<div class="jvt-brand"><canvas></canvas><b>JARVIS</b></div><div class="jvt-tabs"><a href="#start" data-tab="dash" role="tab">Dashboard</a><a href="#charts" data-tab="term" role="tab" id="jvtTerm">Trading Terminal</a><a href="#copilot" data-tab="jarvis" role="tab">Jarvis</a><a href="#brain" data-tab="brain" role="tab" class="jvt-minor">Universum</a></div><button type="button" class="jvt-mode" id="jvMode" title="Hell / Dunkel umschalten" aria-label="Hell oder Dunkel umschalten"><svg class="mo-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg><svg class="mo-moon" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></button><div class="jvt-right"><span id="jvtClock"></span></div>`;
      document.body.insertBefore(t, document.body.firstChild); document.body.classList.add('jv-tabs');
      try { Jarvis.orb(t.querySelector('canvas'), false); } catch { }
      const clock = () => { const el2 = document.getElementById('jvtClock'); if (el2) el2.textContent = new Date().toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }); };
      clock(); setInterval(clock, 20000);
    }
    /* Jarvis-Orb auf jeder Seite */
    if (!document.getElementById('jvFab')) {
      const a = document.createElement('a'); a.id = 'jvFab'; a.href = '#copilot'; a.className = 'jt-fab'; a.title = 'Jarvis'; a.setAttribute('aria-label', 'Jarvis öffnen');
      a.innerHTML = '<canvas></canvas><span>Jarvis</span>'; document.body.append(a);
      try { Jarvis.orb(a.querySelector('canvas'), false); } catch { }
    }
  };
}
