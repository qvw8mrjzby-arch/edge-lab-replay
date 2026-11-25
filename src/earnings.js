/* Quartalszahlen (Earnings) der Nasdaq-Schwergewichte — Daten aus data/earnings.json (tools/fetch-earnings.mjs, GitHub Action earnings.yml).
   Quellen: Nasdaq (Gewinn- und Verlustrechnung, EPS vs. Erwartung, Kalender), Yahoo (Kursreaktion). Nichts wird geschätzt: fehlt ein Wert, steht „–“. */
'use strict';
{
  const { esc } = J;
  const V = J.V;
  const big = n => { if (n == null || !isFinite(n)) return '–'; const a = Math.abs(n); return a >= 1e12 ? J.num(n / 1e12, 2) + ' Bio. $' : a >= 1e9 ? J.num(n / 1e9, a >= 1e11 ? 1 : 2) + ' Mrd. $' : a >= 1e6 ? J.num(n / 1e6, 0) + ' Mio. $' : J.num(n, 0) + ' $'; };
  const pc = (a, b) => (a == null || b == null || !b) ? null : (a / Math.abs(b) - 1) * 100;
  const MN = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const qLabel = q => q.fp ? `${q.fp} GJ${String(q.fy).slice(2)}` : 'Quartal';
  const qRange = q => { const m = +q.end.slice(5, 7), y = +q.end.slice(0, 4); const s = (m + 9) % 12; return s > m - 1 ? `${MN[s]} ${y - 1}–${MN[m - 1]} ${y}` : `${MN[s]}–${MN[m - 1]} ${y}`; };
  const calQ = q => `Q${Math.ceil(+q.end.slice(5, 7) / 3)} ${q.end.slice(0, 4)}`;
  const last = c => [...c.q].reverse().find(q => q.est || q.rev != null);
  const prevOf = (c, q) => { const i = c.q.indexOf(q); return i > 0 ? c.q[i - 1] : null; };
  const chip = (v, d = 1) => v == null ? '<span class="mut">–</span>' : `<b class="${J.cls(v)}">${J.pct(v, d)}</b>`;
  let DATA = null, at = 0;
  const load = async (force) => { if (!DATA || force || Date.now() - at > 15 * 60e3) { DATA = await J.getJSON('earnings.json'); at = Date.now(); } return DATA; };
  J.earnings = load;

  const persona = () => { try { return Jarvis.persona(); } catch { return 'Du bist Jarvis, mein Trading-Coach. Antworte auf Deutsch, klar und knapp.'; } };
  const r2 = x => x == null || !isFinite(x) ? null : +(+x).toFixed(2);
  const compact = c => ({ firma: c.name, symbol: c.sym, naechsterTermin: c.next?.date || null, quartale: c.q.slice(-6).map(q => ({ quartal: q.fp ? qLabel(q) : null, kalender: calQ(q), ende: q.end, umsatzMrd: q.rev != null ? r2(q.rev / 1e9) : null, nettogewinnMrd: q.ni != null ? r2(q.ni / 1e9) : null, bruttogewinnMrd: q.gp != null ? r2(q.gp / 1e9) : null, operativMrd: q.oi != null ? r2(q.oi / 1e9) : null, eps: q.est?.eps ?? null, epsErwartung: q.est?.cons ?? null, ueberraschungPct: q.est?.surp ?? null, gemeldet: q.est?.date || null, reaktionAktiePct: q.react?.stock?.pct ?? null, reaktionNasdaq100Pct: q.react?.ndx?.pct ?? null })) });
  const askCo = c => J.jvAsk(`Jarvis: ${c.name}`, on => Jarvis.think(`${persona()}\n\nAnalysiere die Quartalszahlen von ${c.name} (${c.sym}) für mich als Nasdaq-100-Daytrader. Nur die Daten unten, nichts erfinden; fehlt etwas, sag es. EPS = bereinigter Gewinn je Aktie laut Nasdaq, Erwartung = Analystenkonsens. Kursreaktion = Schluss Vortag bis Schluss Folgetag. Struktur: ### Kurzfazit, ### Umsatz & Gewinn (Trend über die Quartale, Margen), ### Erwartung vs. Ergebnis, ### Wie hat der Markt reagiert (Aktie und Nasdaq 100), ### Was heißt das für meinen NAS100-Handel (nächster Termin, worauf achten).\n\nDaten (JSON):\n${JSON.stringify(compact(c))}`, { onText: ({ text }) => on(text) }), `Stand ${J.dt(Date.parse(DATA.updated))}`);
  const askSeason = (cos, cal) => J.jvAsk('Jarvis: Earnings-Saison & NAS100', on => Jarvis.think(`${persona()}\n\nGib mir einen Überblick über die aktuelle Earnings-Saison der Nasdaq-Schwergewichte und was sie für meinen NAS100-Handel bedeutet. Nur die Daten unten, nichts erfinden. Struktur: ### Kurzfazit, ### Wer hat überzeugt / enttäuscht (EPS vs. Erwartung, Umsatztrend), ### Marktreaktion (Aktien und Nasdaq 100 rund um die Termine), ### Kommende Termine, die den NAS100 bewegen können, ### Konkrete Hinweise für meine Trading-Tage.\n\nFirmen:\n${JSON.stringify(cos.map(c => { const x = compact(c); x.quartale = x.quartale.slice(-3); return x; }))}\n\nKalender (nächste 14 Tage, Firmen ab 20 Mrd. $):\n${JSON.stringify(cal.slice(0, 40).map(e => ({ datum: e.date, firma: e.name, symbol: e.sym, zeit: e.time, epsErwartung: e.est, epsVorjahr: e.last })))}`, { onText: ({ text }) => on(text) }), 'Quartalszahlen + Kalender');

  J.earnCtx = async () => { const d = await load(); return { stand: d.updated, firmen: (d.companies || []).map(c => { const x = compact(c); x.quartale = x.quartale.slice(-3); return x; }), kalender14Tage: (d.calendar || []).slice(0, 30).map(e => ({ datum: e.date, firma: e.name, symbol: e.sym, zeit: e.time, epsErwartung: e.est })) }; };
  V.earnings = el => {
    let alive = true;
    el.innerHTML = `<div class="page-hd"><div><h1>Quartalszahlen</h1><p class="mut">Earnings der Nasdaq-Schwergewichte – Umsatz, Gewinn, Erwartung, Marktreaktion</p></div></div><div class="card"><p class="note"><span class="spin"></span> Lade Quartalszahlen …</p></div>`;
    const render = d => {
      const cos = (d.companies || []).filter(c => c.q && c.q.length), cal = d.calendar || [], today = J.today();
      const L = cos.map(c => [c, last(c)]).filter(x => x[1]);
      const rep = L.filter(([, q]) => q.est && q.est.eps != null && q.est.cons != null);
      const beats = rep.filter(([, q]) => q.est.eps > q.est.cons).length;
      const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
      const aS = avg(rep.map(([, q]) => q.est.surp).filter(isFinite)), aR = avg(L.map(([, q]) => q.react?.stock?.pct).filter(isFinite)), aN = avg(L.map(([, q]) => q.react?.ndx?.pct).filter(isFinite));
      const upcoming = cos.filter(c => c.next?.date && c.next.date >= today).sort((a, b) => a.next.date.localeCompare(b.next.date));
      const byDay = {}; cal.forEach(e => (byDay[e.date] = byDay[e.date] || []).push(e));
      el.innerHTML = `<div class="page-hd"><div><h1>Quartalszahlen</h1><p class="mut">Earnings der Nasdaq-Schwergewichte – Umsatz, Gewinn, Erwartung, Marktreaktion · Stand ${J.dt(Date.parse(d.updated))}</p></div></div>
      <div class="row" style="margin-bottom:14px;gap:8px"><button class="btn pri" id="erAi">Jarvis: Saison & NAS100</button><button class="btn ghost" id="erRe">${J.icon('refresh')}Neu laden</button></div>
      <div class="kpis" style="margin-bottom:14px">
        <div class="kpi"><span>Erwartung geschlagen</span><b>${rep.length ? `${beats} von ${rep.length}` : '–'}</b><small>letztes Quartal je Firma (bereinigter EPS)</small></div>
        <div class="kpi"><span>Ø Überraschung</span><b class="${J.cls(aS)}">${aS == null ? '–' : J.pct(aS, 1)}</b><small>EPS über/unter Konsens</small></div>
        <div class="kpi"><span>Ø Kursreaktion Aktie</span><b class="${J.cls(aR)}">${aR == null ? '–' : J.pct(aR, 1)}</b><small>Vortag → Folgetag</small></div>
        <div class="kpi"><span>Ø Reaktion Nasdaq 100</span><b class="${J.cls(aN)}">${aN == null ? '–' : J.pct(aN, 2)}</b><small>gleicher Zeitraum</small></div>
        <div class="kpi"><span>Nächster großer Termin</span><b>${upcoming[0] ? esc(upcoming[0].sym) : '–'}</b><small>${upcoming[0] ? J.date(upcoming[0].next.date) + (upcoming[0].next.time ? ' · ' + upcoming[0].next.time : '') : 'noch kein Termin bekannt'}</small></div>
      </div>
      <div class="grid g2" style="margin-bottom:14px">
        <div class="card"><h3>Termine nächste 14 Tage <small class="mut">(ab 20 Mrd. $ Börsenwert)</small></h3>${Object.keys(byDay).length ? `<div class="scroll" style="max-height:340px"><table class="dm-tbl"><tbody>${Object.entries(byDay).map(([dt, E]) => `<tr><th colspan="4" style="padding-top:10px">${dt === today ? '<span class="chip acc">Heute</span> ' : ''}${new Date(dt + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' })}</th></tr>${E.map(e => `<tr><td><b>${esc(e.sym)}</b> <span class="mut">${esc(e.name || '')}</span></td><td>${esc(e.time || '')}</td><td class="r">${e.est != null ? 'EPS-Erw. ' + J.num(e.est, 2) : ''}</td><td class="r mut">${e.mcap ? big(e.mcap) : ''}</td></tr>`).join('')}`).join('')}</tbody></table></div>` : '<p class="note">Keine Termine großer Firmen in den nächsten 14 Tagen gefunden.</p>'}</div>
        <div class="card"><h3>Nächste Termine deiner Schwergewichte</h3>${upcoming.length ? `<table class="dm-tbl"><tbody>${upcoming.map(c => `<tr><td><b>${esc(c.sym)}</b> <span class="mut">${esc(c.name)}</span></td><td class="r">${J.date(c.next.date)}</td><td>${esc(c.next.time || '')}</td></tr>`).join('')}</tbody></table>` : ''}<p class="note">Für Firmen ohne Eintrag hat Nasdaq noch keinen Termin veröffentlicht.</p></div>
      </div>
      <div class="er-grid">${L.map(([c, q]) => { const p = prevOf(c, q); const rs = c.q.filter(x => x.rev != null).slice(-6); const mx = Math.max(...rs.map(x => x.rev), 1); const beat = q.est && q.est.eps != null && q.est.cons != null ? q.est.eps > q.est.cons : null;
        return `<div class="card er-card" data-co="${esc(c.sym)}"><div class="row nw"><div><b class="er-sym">${esc(c.sym)}</b><div class="note">${esc(c.name)}</div></div><div class="sp"></div><div style="text-align:right"><span class="chip">${qLabel(q)}</span><div class="note">${qRange(q)}</div></div></div>
          <div class="er-kv"><div><span>Umsatz</span><b>${big(q.rev)}</b><small>${q.rev != null && p?.rev != null ? 'zum Vorquartal ' + J.pct(pc(q.rev, p.rev), 1) : q.rev == null ? 'noch nicht in den Daten' : ''}</small></div><div><span>Nettogewinn</span><b>${big(q.ni)}</b><small>${q.ni != null && q.rev ? 'Marge ' + J.num(q.ni / q.rev * 100, 1) + ' %' : ''}</small></div>
          <div><span>EPS vs. Erwartung</span><b>${q.est?.eps != null ? J.num(q.est.eps, 2) + ' $' : '–'}</b><small>${q.est?.cons != null ? `Konsens ${J.num(q.est.cons, 2)} · ` : ''}${beat == null ? '' : beat ? '<span class="up">geschlagen</span>' : '<span class="dn">verfehlt</span>'}${q.est?.surp != null ? ` (${J.pct(q.est.surp, 1)})` : ''}</small></div>
          <div><span>Reaktion Aktie / NDX</span><b>${chip(q.react?.stock?.pct)} <span class="mut">/</span> ${chip(q.react?.ndx?.pct, 2)}</b><small>${q.est?.date ? 'gemeldet ' + J.date(q.est.date) : ''}</small></div></div>
          ${rs.length > 1 ? `<div class="er-bars" title="Umsatz der letzten Quartale">${rs.map(x => `<i style="height:${(x.rev / mx * 100).toFixed(0)}%" title="${qLabel(x)}: ${big(x.rev)}"></i>`).join('')}</div>` : ''}
          <div class="note" style="margin-top:6px">${c.next?.date ? `Nächster Termin: <b>${J.date(c.next.date)}</b>${c.next.time ? ' · ' + c.next.time : ''}` : 'Nächster Termin: noch nicht bekannt'}</div></div>`; }).join('')}</div>
      <p class="note" style="margin-top:12px">Quellen: Nasdaq (Gewinn- und Verlustrechnung, bereinigter EPS & Analystenkonsens, Kalender), Yahoo Finance (Kurse). GJ = Geschäftsjahr der Firma (z. B. NVIDIA: Q3 GJ27 = Aug–Okt 2026). Kursreaktion = Schlusskurs Vortag bis Schlusskurs Folgetag.</p>`;
      J.$('#erAi', el).onclick = () => askSeason(cos, cal);
      J.$('#erRe', el).onclick = () => go(true);
      J.$$('[data-co]', el).forEach(x => x.onclick = () => detail(cos.find(c => c.sym === x.dataset.co)));
    };
    const detail = c => {
      const Q = [...c.q].reverse();
      J.modal(`${c.name} (${c.sym})`, `<div class="scroll"><table class="dm-tbl"><thead><tr><th>Quartal</th><th class="r">Umsatz</th><th class="r">Brutto</th><th class="r">Operativ</th><th class="r">Netto</th><th class="r">EPS</th><th class="r">Konsens</th><th class="r">Überr.</th><th class="r">Aktie</th><th class="r">NDX</th></tr></thead><tbody>${Q.map(q => `<tr><td><b>${qLabel(q)}</b><div class="note">${qRange(q)}${q.est?.date ? ' · ' + J.date(q.est.date) : ''}</div></td><td class="r">${big(q.rev)}</td><td class="r">${big(q.gp)}</td><td class="r">${big(q.oi)}</td><td class="r">${big(q.ni)}</td><td class="r">${q.est?.eps != null ? J.num(q.est.eps, 2) : '–'}</td><td class="r">${q.est?.cons != null ? J.num(q.est.cons, 2) : '–'}</td><td class="r">${chip(q.est?.surp)}</td><td class="r">${chip(q.react?.stock?.pct)}</td><td class="r">${chip(q.react?.ndx?.pct, 2)}</td></tr>`).join('')}</tbody></table></div>
        <p class="note">${c.next?.date ? `Nächster Termin: ${J.date(c.next.date)}${c.next.time ? ' · ' + c.next.time : ''}` : 'Nächster Termin noch nicht veröffentlicht.'} Umsatz/Gewinn = berichtete Zahlen (GAAP), EPS = bereinigt laut Nasdaq.</p>
        <div class="row" style="justify-content:flex-end"><button class="btn pri" id="erCo">Jarvis analysiert ${esc(c.sym)}</button></div>`, (b, close) => { b.querySelector('#erCo').onclick = () => { close(); askCo(c); }; });
    };
    const go = force => load(force).then(d => { if (alive) render(d); }).catch(e => { if (alive) el.innerHTML = `<div class="page-hd"><div><h1>Quartalszahlen</h1></div></div><div class="card empty"><b>Quartalszahlen konnten nicht geladen werden</b><span>${esc(J.errText ? J.errText(e) : (e?.message || e?.code || 'Fehler'))}</span></div>`; });
    go();
    return () => { alive = false; };
  };
}
