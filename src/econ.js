/* Edge Lab Replay — Wichtige US-Wirtschaftstermine (statisch, 2020-01 bis 2026-10).
   Quellen (offizielle Veröffentlichungsarchive, Abruf 29.10.2026):
   - CPI:  https://www.bls.gov/bls/news-release/cpi.htm     (Archiv-Dateien cpi_MMDDYYYY = Veröffentlichungstag)
   - NFP:  https://www.bls.gov/bls/news-release/empsit.htm  (Employment Situation, empsit_MMDDYYYY)
   - FOMC: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm (2021–2026, Statement-Links monetaryYYYYMMDDa)
           https://www.federalreserve.gov/newsevents/pressreleases/2020-press-fomc.htm (2020 inkl. außerplanmäßiger Statements;
           Uhrzeiten 3.3.2020 10:00, 15.3.2020 17:00, 23.3.2020 8:00 ET laut Pressemitteilung bzw. Sitzungsseite)
   Oktober 2025: CPI und Arbeitsmarktbericht wurden wegen des US-Haushaltsstillstands nicht veröffentlicht (laut BLS).
   PPI, Einzelhandelsumsätze und PCE sind bewusst nicht enthalten.
   Termin-Zeitpunkte sind vorab bekannt; sie zu zeigen ist kein Blick in die Kurs-Zukunft. */
'use strict';
(function (root) {
  const CoreRef = typeof Core !== 'undefined' ? Core : (typeof require === 'function' ? require('./core.js') : null);
  /* Jahr → MMDD-Liste (Veröffentlichungstage) */
  const RAW = {
    CPI: {
      2020: '0114 0213 0311 0410 0512 0610 0714 0812 0911 1013 1112 1210',
      2021: '0113 0210 0310 0413 0512 0610 0713 0811 0914 1013 1110 1210',
      2022: '0112 0210 0310 0412 0511 0610 0713 0810 0913 1013 1110 1213',
      2023: '0112 0214 0314 0412 0510 0613 0712 0810 0913 1012 1114 1212',
      2024: '0111 0213 0312 0410 0515 0612 0711 0814 0911 1010 1113 1211',
      2025: '0115 0212 0312 0410 0513 0611 0715 0812 0911 1024 1218',
      2026: '0113 0213 0311 0410 0512 0610 0714 0812 0911 1014'
    },
    NFP: {
      2020: '0110 0207 0306 0403 0508 0605 0702 0807 0904 1002 1106 1204',
      2021: '0108 0205 0305 0402 0507 0604 0702 0806 0903 1008 1105 1203',
      2022: '0107 0204 0304 0401 0506 0603 0708 0805 0902 1007 1104 1202',
      2023: '0106 0203 0310 0407 0505 0602 0707 0804 0901 1006 1103 1208',
      2024: '0105 0202 0308 0405 0503 0607 0705 0802 0906 1004 1101 1206',
      2025: '0110 0207 0307 0404 0502 0606 0703 0801 0905 1120 1216',
      2026: '0109 0211 0306 0403 0508 0605 0702 0807 0904 1002'
    },
    FOMC: {
      2020: '0129 0303@1000 0315@1700 0323@0800 0429 0610 0729 0916 1105 1216',
      2021: '0127 0317 0428 0616 0728 0922 1103 1215',
      2022: '0126 0316 0504 0615 0727 0921 1102 1214',
      2023: '0201 0322 0503 0614 0726 0920 1101 1213',
      2024: '0131 0320 0501 0612 0731 0918 1107 1218',
      2025: '0129 0319 0507 0618 0730 0917 1029 1210',
      2026: '0128 0318 0429 0617 0729 0916 1028'
    }
  };
  const KINDS = {
    CPI: { abbr: 'CPI', name: 'US-Verbraucherpreise (CPI)', hh: 8, mm: 30, warn: 30 },
    NFP: { abbr: 'NFP', name: 'US-Arbeitsmarktbericht (NFP)', hh: 8, mm: 30, warn: 30 },
    FOMC: { abbr: 'FOMC', name: 'Fed-Zinsentscheid', hh: 14, mm: 0, warn: 120 }
  };
  const ET = 'America/New_York';
  /* Märkte mit US-Bezug (instKey aus dem Datensatz) */
  const RELEVANT = new Set(['ARCHIV', 'CRYPTO', 'FOREX', 'NQ', 'MNQ', 'ES', 'MES', 'YM', 'MYM', 'RTY', 'M2K', 'GC', 'MGC', 'CL', 'MCL']);
  let LIST = null, TIMES = null, DAYS = null;

  const E = {
    KINDS, ET, RAW,
    FIRST: '2020-01', LAST: '2026-10',
    /* Alle Termine, aufsteigend: { t (UTC-Sekunden), kind, y, m, d, hh, mm } */
    events() {
      if (LIST) return LIST;
      const out = [];
      for (const kind of Object.keys(RAW)) {
        const K = KINDS[kind];
        for (const y of Object.keys(RAW[kind])) {
          for (const tok of RAW[kind][y].split(/\s+/)) {
            if (!tok) continue;
            const m = +tok.slice(0, 2), d = +tok.slice(2, 4);
            let hh = K.hh, mm = K.mm;
            const at = tok.indexOf('@');
            if (at > 0) { hh = +tok.slice(at + 1, at + 3); mm = +tok.slice(at + 3, at + 5); }
            out.push({ t: CoreRef.zonedToUtc(+y, m, d, hh, mm, 0, ET), kind, y: +y, m, d, hh, mm });
          }
        }
      }
      out.sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind));
      LIST = out; TIMES = out.map((e) => e.t);
      DAYS = new Set(out.map((e) => E.dayKey(e.y, e.m, e.d)));
      return LIST;
    },
    dayKey(y, m, d) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); },
    /* erster Index mit t >= x */
    lower(x) { this.events(); let lo = 0, hi = TIMES.length; while (lo < hi) { const k = (lo + hi) >> 1; if (TIMES[k] < x) lo = k + 1; else hi = k; } return lo; },
    /* Termine im Zeitraum [a, b] */
    between(a, b) { const L = this.events(); const out = []; for (let i = this.lower(a); i < L.length && L[i].t <= b; i++) out.push(L[i]); return out; },
    /* Nächster Termin (t > now) – alle Termine zum selben Zeitpunkt */
    next(now) { const L = this.events(); let i = this.lower(now + 1e-6); if (i >= L.length) return null; const t = L[i].t, g = []; while (i < L.length && L[i].t === t) g.push(L[i++]); return { t, list: g }; },
    /* Letzter Termin (t <= now) */
    prev(now) { const L = this.events(); let i = this.lower(now + 1e-6) - 1; if (i < 0) return null; const t = L[i].t, g = []; while (i >= 0 && L[i].t === t) g.unshift(L[i--]); return { t, list: g }; },
    /* Tag (ET-Kalendertag) mit mindestens einem Termin */
    hasEventOn(y, m, d) { this.events(); return DAYS.has(this.dayKey(y, m, d)); },
    relevant(instKey) { return !!instKey && RELEVANT.has(instKey); },
    /* Kontext für das Journal: Minuten bis zum nächsten / seit dem letzten Termin (max. 7 Tage), Art des näheren Termins */
    ctxAt(now) {
      const n = this.next(now), p = this.prev(now), LIM = 7 * 86400;
      const to = n && n.t - now <= LIM ? Math.round((n.t - now) / 60) : null;
      const since = p && now - p.t <= LIM ? Math.round((now - p.t) / 60) : null;
      if (to == null && since == null) return null;
      const near = to == null ? p : since == null ? n : (n.t - now < now - p.t ? n : p);
      return { minutesTo: to, minutesSince: since, kind: near.list.map((e) => e.kind).join('+') };
    },
    /* „News-Trade“: Einstieg ≤ 15 Min vor bis ≤ 30 Min nach einem Termin */
    isNewsTrade(news) { return !!news && ((news.minutesTo != null && news.minutesTo <= 15) || (news.minutesSince != null && news.minutesSince <= 30)); },
    etLabel(e) { return e.hh + ':' + String(e.mm).padStart(2, '0') + ' ET'; },
    fmtIn(min) { if (min < 60) return 'In ' + min + ' Min'; const h = Math.floor(min / 60), r = min % 60; return 'In ' + h + ' Std' + (r ? ' ' + r + ' Min' : ''); },
    /* Vorwarnung: Text oder null. now = Ende der zuletzt sichtbaren Kerze. */
    warning(now, blind) {
      const n = this.next(now); if (!n) return null;
      const win = Math.max(...n.list.map((e) => KINDS[e.kind].warn)) * 60;
      if (n.t - now > win) return null;
      const min = Math.max(1, Math.ceil((n.t - now) / 60)), e0 = n.list[0];
      if (blind) return { t: n.t, min, text: this.fmtIn(min) + ': Hochrelevanter US-Termin um ' + this.etLabel(e0) };
      const names = n.list.map((e) => KINDS[e.kind].name).join(' + ');
      return { t: n.t, min, text: this.fmtIn(min) + ': ' + names + ' · ' + this.etLabel(e0) };
    },
    /* Prüfung der Liste: Wochentage und Uhrzeiten plausibel (für Tests/Konsole) */
    check() {
      const L = this.events(), warn = [], count = {};
      for (const e of L) {
        count[e.kind] = (count[e.kind] || 0) + 1;
        const p = CoreRef.localParts(e.t, ET);
        if (p.y !== e.y || p.m !== e.m || p.d !== e.d || p.h !== e.hh || p.mi !== e.mm) warn.push('Umrechnung falsch: ' + e.kind + ' ' + this.dayKey(e.y, e.m, e.d));
        if (p.wd === 0 || p.wd === 6) {
          if (!(e.kind === 'FOMC' && e.hh !== 14)) warn.push('Wochenende: ' + e.kind + ' ' + this.dayKey(e.y, e.m, e.d));
        }
        if (e.kind === 'NFP' && p.wd !== 5) warn.push('NFP nicht Freitag (' + ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][p.wd] + '): ' + this.dayKey(e.y, e.m, e.d));
        if (e.kind === 'FOMC' && e.hh === 14 && p.wd !== 3) warn.push('FOMC nicht Mittwoch: ' + this.dayKey(e.y, e.m, e.d));
      }
      const ymin = L[0], ymax = L[L.length - 1];
      return { n: L.length, count, warn, first: this.dayKey(ymin.y, ymin.m, ymin.d), last: this.dayKey(ymax.y, ymax.m, ymax.d) };
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
  else root.Econ = E;
})(typeof self !== 'undefined' ? self : this);
