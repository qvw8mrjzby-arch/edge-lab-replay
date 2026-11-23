/* KI-Auswertung (Nov 2026): Jarvis wertet Journal-Auswahl, Tagebuch (Plan & Tag) und täglich dein Trading aus.
   Denkt mit Claude (in claude.ai) oder dem eigenen Gemini/OpenRouter-Key – wie der Copilot. */
'use strict';
const JAI = (() => {
  const r2 = (x) => (x == null || !isFinite(x)) ? null : +(+x).toFixed(2);
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const brainOk = async () => { try { if (!Jarvis.brain()) await Jarvis.ready; return !!Jarvis.brain(); } catch { return false; } };
  const persona = () => { try { return Jarvis.persona(); } catch { return 'Du bist Jarvis, mein Trading-Coach. Antworte auf Deutsch, klar und knapp.'; } };
  const think = (prompt, on) => Jarvis.think(prompt, on ? { onText: ({ text }) => on(text) } : {});
  const created = () => new Map((App.sessions || []).map((s) => [s.replayId, s.created]));
  const dayOf = (t) => { const d = new Date(t * 1000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const slim = (j) => ({ markt: j.sym, richtung: j.side > 0 ? 'L' : 'S', strategie: j.setup || '', r: r2(j.r), pnl: r2(j.pnl), ausstieg: j.reason, stopVerschoben: j.slFinal != null && j.sl != null && j.slFinal !== j.sl, merkmale: Array.isArray(j.tags) ? j.tags : [], sterne: j.grade || null, notiz: (j.note || '').slice(0, 140) });

  /* Tagebuch kompakt für die KI (auch vom Coaching genutzt) */
  J.diaryCtx = (n = 14) => {
    const D = (App.settings && App.settings.diary) || {};
    return Object.keys(D).sort().reverse().slice(0, n).map((k) => { const e = D[k] || {}; return { tag: k, bias: e.bias || null, verfassung: e.mood ? +e.mood : null, plan: (e.plan || '').slice(0, 300), level: (e.levels || '').slice(0, 160), regelnEingehalten: e.rules || null, tagesnote: e.grade ? +e.grade : null, rueckblick: (e.review || '').slice(0, 300), lektion: (e.lesson || '').slice(0, 200) }; }).filter((x) => x.plan || x.rueckblick || x.lektion || x.bias);
  };
  const noBrain = '<p class="note">Jarvis ist noch nicht verbunden. Öffne die App in claude.ai oder trage im <a href="#copilot">Copilot</a> deinen kostenlosen Gemini-Key ein.</p>';

  /* ---------- Journal: aktuelle Auswahl auswerten ---------- */
  function journalAi() {
    const T = UI.journalList(); if (T.length < 3) return J.toast('Für eine Auswertung braucht Jarvis mindestens 3 Trades in der Auswahl.');
    const F = App.settings.jf || {}, S = (typeof JX !== 'undefined' && JX.S) || {};
    const filter = { markt: F.sym || 'alle', strategie: F.strat || 'alle', ergebnis: F.res || 'alle', richtung: S.side || 'alle', merkmal: S.tag || 'alle', suche: S.q || '', tag: S.day || 'alle' };
    J.jvAsk('Jarvis wertet deine Auswahl aus', (on) => think(`${persona()}\n\nWerte diese Auswahl aus meinem Trading-Journal aus (Filter siehe unten). Prozess vor Ergebnis, nur was die Daten zeigen. Struktur: ### Kurzfazit (2 Sätze), ### Was funktioniert (mit Zahlen), ### Teuerste Muster (Merkmale/Gefühle, Uhrzeiten, Strategien, Ausstiege – mit $ und R), ### Psychologie (was die Merkmale & Sterne über mich sagen), ### 3 messbare Regeln, ### Stichprobe: reicht sie für Schlüsse? Max. 320 Wörter.\n\n${JSON.stringify({ filter, statistik: J.deepStats(T), letzteTrades: T.slice().sort((a, b) => (b.entryT || 0) - (a.entryT || 0)).slice(0, 25).map(slim), tagebuch: J.diaryCtx(10) })}`, on), T.length + ' Trades in der Auswahl');
  }

  /* ---------- Tagebuch: Plan prüfen & Tag auswerten (Antwort direkt im Tagebuch) ---------- */
  async function diaryAi(kind, box) {
    const out = box.querySelector('.jx-ai-out');
    out.hidden = false; out.innerHTML = '<p class="note"><span class="spin"></span> Jarvis denkt …</p>';
    if (!(await brainOk())) { out.innerHTML = noBrain; return; }
    const k = (typeof JX !== 'undefined' && JX.S.diaryDay) || todayKey();
    const D = App.settings.diary = App.settings.diary || {}; const e = D[k] || {};
    const cr = created();
    const done = App.visibleJournal().filter((j) => { const t = j.src === 'desk' ? j.exitT : cr.get(j.replay); return t && dayOf(t) === k; });
    let events = [];
    try { const c = await J.getJSON('calendar.json'); events = (c.events || []).filter((x) => (x.impact === 'High' || x.impact === 'Medium') && J.dayOf(Date.parse(x.date) / 1000) === k).map((x) => ({ zeit: new Date(x.date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }), land: x.country, titel: x.title, wirkung: x.impact })); } catch { }
    const strat = (App.strategies || []).map((s) => ({ name: s.name, regeln: (s.rules || '').split('\n').filter(Boolean).slice(0, 12) }));
    const all = J.journal();
    const stats = all.length >= 3 ? J.deepStats(all) : null;
    const ctx = { tag: k, eintrag: { bias: e.bias, verfassung: e.mood, plan: e.plan, level: e.levels, regelnEingehalten: e.rules, tagesnote: e.grade, rueckblick: e.review, lektion: e.lesson }, tradesAnDiesemTag: done.map(slim), termine: events, strategien: strat, statistikGesamt: stats && { gesamt: stats.gesamt, nachStunde: stats.nachStunde, nachMerkmal: stats.nachMerkmal }, fruehereLektionen: J.diaryCtx(7).map((x) => x.lektion).filter(Boolean) };
    const prompt = kind === 'plan'
      ? `${persona()}\n\nPrüfe meinen Handelsplan für heute, BEVOR ich handle. Struktur: ### Klarheit (ist der Plan konkret genug? Einstieg, Stop, Ausstieg, Tageslimit), ### Passt er zu meinen Strategie-Regeln?, ### Risiken heute (Termine mit Uhrzeit, meine schwachen Uhrzeiten/Merkmale aus der Statistik, Verfassung), ### 3 Wenn-Dann-Regeln für heute. Max. 220 Wörter. Wenn kein Plan eingetragen ist, hilf mir in 5 Fragen, einen zu schreiben.\n\n${JSON.stringify(ctx)}`
      : `${persona()}\n\nWerte meinen Handelstag aus: Plan vs. was ich wirklich getan habe (Trades, Merkmale, Sterne) vs. mein Rückblick. Ehrlich, fair, Prozess vor Ergebnis. Struktur: ### Note für den Tag (A–F, ein Satz), ### Plan eingehalten?, ### Was gut war, ### Was mich Geld oder Disziplin gekostet hat, ### Muster über die letzten Tage (aus früheren Lektionen). Schreibe als allerletzte Zeile genau: LEKTION: <eine messbare Regel für morgen, max. 20 Wörter>. Max. 250 Wörter.\n\n${JSON.stringify(ctx)}`;
    try {
      const t = await think(prompt, (x) => { out.innerHTML = J.md(x); });
      const m = t.match(/LEKTION:\s*(.+)\s*$/i);
      out.innerHTML = J.md(t.replace(/LEKTION:\s*(.+)\s*$/i, '**Lektion:** $1')) + (m ? '<div class="jx-ai-act"><button type="button" class="btn sm" data-take>Als Lektion übernehmen</button></div>' : '');
      const b = out.querySelector('[data-take]');
      if (b) b.onclick = () => { e.lesson = m[1].trim(); D[k] = e; App.saveSettings(); const ta = document.querySelector('textarea[data-df="lesson"]'); if (ta) ta.value = e.lesson; J.toast('Lektion übernommen', 'good'); };
    } catch (err) { out.innerHTML = '<p class="note">' + J.esc(Jarvis.err(err)) + '</p>'; }
  }

  /* ---------- Dashboard: tägliches Insight + Wochenrückblick ---------- */
  const INS = 'jx.insight';
  const getIns = () => { try { return JSON.parse(localStorage.getItem(INS) || 'null'); } catch { return null; } };
  const setIns = (v) => { try { localStorage.setItem(INS, JSON.stringify(v)); } catch { } };
  function weekCtx() {
    const cr = created(), t0 = Date.now() / 1000;
    const T = App.visibleJournal().filter((j) => { const t = j.src === 'desk' ? j.exitT : cr.get(j.replay); return t && t > t0 - 7 * 86400; });
    const all = J.journal();
    return { letzte7Tage: { trades: T.length, netto: r2(T.reduce((a, j) => a + j.pnl, 0)), sessions: (App.sessions || []).filter((s) => s.created > t0 - 7 * 86400).length, trades_detail: T.slice(-30).map(slim) }, statistikGesamt: all.length >= 3 ? J.deepStats(all) : { trades: all.length }, tagebuch: J.diaryCtx(7), passLevel: (typeof Pass !== 'undefined' && Pass.last) ? Pass.last.level : null };
  }
  let busy = false;
  async function insight(force) {
    const box = document.getElementById('jxIns'); if (!box || busy) return;
    const body = box.querySelector('.jx-ins-b'), meta = box.querySelector('.jx-ins-m');
    const c = getIns();
    if (c && c.day === todayKey() && !force) { body.innerHTML = J.md(c.text); meta.textContent = 'Heute um ' + new Date(c.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' ausgewertet'; return; }
    if (!(await brainOk())) { body.innerHTML = noBrain; meta.textContent = ''; return; }
    if (App.journal.length + (App.sessions || []).length === 0) { body.innerHTML = '<p class="note">Sobald du Trades oder Sessions hast, wertet Jarvis hier jeden Tag automatisch für dich aus.</p>'; return; }
    busy = true; body.innerHTML = '<p class="note"><span class="spin"></span> Jarvis wertet dein Trading aus …</p>';
    try {
      const t = await think(`${persona()}\n\nGib mir mein tägliches Trading-Insight für das Dashboard. Nur was die Daten zeigen, konkret mit Zahlen. Format genau so (Markdown, max. 110 Wörter): **Fokus heute:** <ein Satz>\\n\\n- **Stärke:** …\\n- **Leck:** …\\n- **Regel für heute:** … (messbar)\\n\\nWenn die Stichprobe klein ist, sag das kurz.\n\n${JSON.stringify(weekCtx())}`, (x) => { body.innerHTML = J.md(x); });
      setIns({ day: todayKey(), t: Date.now(), text: t }); body.innerHTML = J.md(t); meta.textContent = 'Gerade ausgewertet';
    } catch (err) { body.innerHTML = '<p class="note">' + J.esc(Jarvis.err(err)) + '</p>'; }
    busy = false;
  }
  function weekly() {
    J.jvAsk('Jarvis: dein Wochenrückblick', (on) => think(`${persona()}\n\nSchreib meinen Trading-Wochenrückblick (letzte 7 Tage im Vergleich zu meiner Gesamtstatistik). Struktur: ### Die Woche in Zahlen, ### Bester Moment, ### Teuerster Fehler (mit $ und R), ### Psychologie (Merkmale, Sterne, Verfassung im Tagebuch), ### Fortschritt vs. frühere Lektionen, ### Plan für nächste Woche (3 messbare Ziele). Max. 330 Wörter.\n\n${JSON.stringify(weekCtx())}`, on));
  }

  /* ---------- Einbau ---------- */
  const orbs = '<span class="jt-orb" aria-hidden="true"></span>';
  const baseJ = UI.renderJournal.bind(UI);
  UI.renderJournal = async function () {
    const r = await baseJ();
    const bar = document.getElementById('jxBar');
    if (bar && !document.getElementById('jxAi')) bar.insertAdjacentHTML('beforeend', '<button type="button" class="btn jt-gold jx-ai-btn" id="jxAi" title="Jarvis wertet die aktuell gefilterten Trades aus">' + orbs + 'KI-Auswertung</button>');
    const ai = document.getElementById('jxAi'); if (ai) ai.onclick = journalAi;
    const dy = document.querySelector('.jx-dy');
    if (dy && !dy.querySelector('.jx-ai')) {
      dy.querySelector('.jx-cal-h').insertAdjacentHTML('afterend', '<div class="jx-ai">' + orbs + '<span><b>Jarvis</b> prüft deinen Plan vor dem Handel und wertet den Tag danach aus.</span><span class="hspace"></span><button type="button" class="btn sm" data-ai="plan">Plan prüfen</button><button type="button" class="btn sm jt-gold" data-ai="day">Tag auswerten</button><div class="jx-ai-out md" hidden></div></div>');
      const box = dy.querySelector('.jx-ai');
      box.querySelectorAll('[data-ai]').forEach((b) => b.onclick = () => diaryAi(b.dataset.ai === 'plan' ? 'plan' : 'day', box));
    }
    return r;
  };
  const baseS = App.renderStart;
  App.renderStart = function () {
    const r = baseS.apply(this, arguments);
    try {
      const tiles = document.querySelector('#stBody .dz-tiles');
      if (tiles && !document.getElementById('jxIns')) {
        tiles.insertAdjacentHTML('afterend', '<section class="card jx-ins" id="jxIns"><div class="card-h"><h3>' + orbs + ' Jarvis-Insight</h3><span class="hint jx-ins-m"></span></div><div class="jx-ins-b md"></div><div class="jx-ai-act"><button type="button" class="btn sm" data-ins="again">Neu auswerten</button><button type="button" class="btn sm jt-gold" data-ins="week">Wochenrückblick</button><a class="btn sm" href="#journal">Journal</a></div></section>');
        const box = document.getElementById('jxIns');
        box.querySelector('[data-ins="again"]').onclick = () => insight(true);
        box.querySelector('[data-ins="week"]').onclick = weekly;
        insight(false);
      }
    } catch (e) { console.warn('Jarvis-Insight', e); }
    return r;
  };
  return { insight, journalAi, weekly };
})();
