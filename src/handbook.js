/* Edge Lab Replay — Trading-Handbuch: Inhalte (statisch), eigene Schaubilder (SVG, Theme-Farben), Lese-Ansicht mit Suche und Lesefortschritt */
'use strict';

/* ---------- Schaubilder: aus echten Formeln berechnet (VWAP, Value Area), Farben über CSS-Klassen ---------- */
const HBFig = {
  P(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(''); },
  wrap(svg, cap, label) { return '<figure class="hb-fig"><svg viewBox="0 0 560 230" role="img" aria-label="' + label + '">' + svg + '</svg><figcaption>' + cap + '</figcaption></figure>'; },
  t(x, y, s, cls, anchor) { return '<text x="' + x + '" y="' + y + '"' + (cls ? ' class="' + cls + '"' : '') + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + s + '</text>'; },
  vwap() {
    const R = Core.rng(5), n = 70, px = [], vw = [], sd = [];
    let pv = 0, pv2 = 0, vol = 0, p = 100;
    for (let i = 0; i < n; i++) {
      p = 100 + 5 * Math.sin(i / 8) + i * 0.09 + (R() - 0.5) * 1.6;
      const v = 40 + R() * 80 * (i < 12 ? 1.6 : 1);
      pv += p * v; pv2 += p * p * v; vol += v;
      const m = pv / vol; px.push(p); vw.push(m); sd.push(Math.sqrt(Math.max(0, pv2 / vol - m * m)));
    }
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { lo = Math.min(lo, px[i], vw[i] - 2 * sd[i]); hi = Math.max(hi, px[i], vw[i] + 2 * sd[i]); }
    const X = (i) => 30 + i * (440 / (n - 1)), Y = (v) => 20 + (hi - v) / (hi - lo) * 190;
    const line = (k, cls) => '<path class="' + cls + '" d="' + this.P(vw.map((m, i) => [X(i), Y(m + k * sd[i])])) + '"/>';
    const fill = '<path class="bdf" d="' + this.P(vw.map((m, i) => [X(i), Y(m + 2 * sd[i])]).concat(vw.map((m, i) => [X(i), Y(m - 2 * sd[i])]).reverse())) + 'Z"/>';
    const L = n - 1, lab = (k, s) => this.t(478, Y(vw[L] + k * sd[L]) + 4, s, k ? 'tb' : 'tv');
    return this.wrap(fill + line(2, 'bd') + line(1, 'bd') + line(-1, 'bd') + line(-2, 'bd') + '<path class="px" d="' + this.P(px.map((v, i) => [X(i), Y(v)])) + '"/>' + line(0, 'vw') +
      lab(2, '+2σ') + lab(1, '+1σ') + lab(0, 'VWAP') + lab(-1, '−1σ') + lab(-2, '−2σ') + this.t(30, 14, 'Session-Beginn: Bänder starten eng und weiten sich mit dem Volumen', 'tm'),
    'VWAP (gold) mit ±1σ- und ±2σ-Bändern, berechnet aus Kerzen mit Volumen. Zu Beginn der Session ist der VWAP noch „leicht“ – wenige Kerzen bewegen ihn stark.', 'VWAP mit Standardabweichungs-Bändern');
  },
  profile() {
    const v = [2, 4, 3, 6, 10, 16, 24, 30, 37, 44, 41, 34, 24, 14, 7, 3, 2, 3, 8, 15, 20, 17, 10, 5, 2];
    const va = Core.valueArea({ r0: 0, row: 1, v: Float64Array.from(v) }, 0.7);
    const n = v.length, mx = Math.max(...v), rowH = 7.8, top = 14, X0 = 60, BW = 250;
    const Y = (i) => top + (n - 1 - i) * rowH, W = (i) => v[i] / mx * BW;
    let s = '';
    for (let i = 0; i < n; i++) {
      const cls = i === va.pocIdx ? 'pocb' : i >= va.loIdx && i <= va.hiIdx ? 'vab' : 'ob';
      s += '<rect class="' + cls + '" x="' + X0 + '" y="' + (Y(i) + 1).toFixed(1) + '" width="' + W(i).toFixed(1) + '" height="' + (rowH - 1.6) + '" rx="1"/>';
    }
    const ln = (y, cls, lbl) => '<path class="' + cls + '" d="M' + X0 + ' ' + y.toFixed(1) + 'H350"/>' + this.t(356, y + 4, lbl, cls === 'pocl' ? 'tp' : 'tm');
    s += ln(Y(va.hiIdx), 'val', 'VAH') + ln(Y(va.pocIdx) + rowH / 2, 'pocl', 'POC') + ln(Y(va.loIdx) + rowH, 'val', 'VAL');
    s += this.t(392, Y(va.hiIdx) + 4, 'Value Area (70 %)', 'tm') + '<path class="val" d="M386 ' + Y(va.hiIdx) + 'V' + (Y(va.loIdx) + rowH) + '"/>';
    s += this.t(X0 + W(16) + 10, Y(16) + 6, '← LVN: wenig Volumen', 'tw') + this.t(X0 + W(20) + 10, Y(20) + 6, '← HVN: zweiter Knoten', 'tw');
    s += this.t(16, Y(va.pocIdx) + 8, 'Preis', 'tm');
    return this.wrap(s, 'Volume Profile: Volumen je Preisstufe. Der POC (gelb) ist die Stufe mit dem meisten Volumen, die Value Area (heller) enthält 70 % des Volumens – hier mit dem CBOT-Verfahren berechnet. Darüber liegt ein LVN zwischen zwei Volumen-Knoten.', 'Volume Profile mit POC, VAH, VAL, LVN und HVN');
  },
  footprint() {
    const rows = [['21.001,00', 8, 14], ['21.000,75', 5, 42], ['21.000,50', 9, 20], ['21.000,25', 16, 11], ['21.000,00', 22, 6]];
    let s = this.t(196, 20, 'Bid', 'tm', 'middle') + this.t(276, 20, 'Ask', 'tm', 'middle') + this.t(150, 20, 'Preis', 'tm', 'end');
    rows.forEach((r, i) => {
      const y = 30 + i * 36;
      s += this.t(150, y + 23, r[0], 'tm', 'end');
      s += '<rect class="' + (i === 2 ? 'cellr' : 'cell') + '" x="160" y="' + y + '" width="72" height="32" rx="3"/><rect class="' + (i === 1 ? 'cellg' : 'cell') + '" x="240" y="' + y + '" width="72" height="32" rx="3"/>';
      s += this.t(196, y + 21, String(r[1]), i === 2 ? 'tn' : 'tw', 'middle') + this.t(276, y + 21, String(r[2]), i === 1 ? 'tg' : 'tw', 'middle');
    });
    s += '<path class="arr" d="M262 76 L214 100"/><path class="arrh" d="M214 100 l9 -1 l-4 -7z"/>';
    s += this.t(330, 70, 'Ask 42 auf 21.000,75', 'tw') + this.t(330, 88, 'gegen Bid 9 eine Stufe tiefer:', 'tm') + this.t(330, 108, '42 ≥ 3 × 9 = 27', 'tg') + this.t(330, 126, '→ Kauf-Imbalance', 'tg');
    s += this.t(330, 170, 'Diagonal vergleichen, nicht', 'tm') + this.t(330, 186, 'waagerecht: Ask und Bid', 'tm') + this.t(330, 202, 'liegen eine Stufe auseinander.', 'tm');
    return this.wrap(s, 'Footprint-Zellen (Bid × Ask je Preis, NQ in 0,25-Schritten). Diagonale Imbalance mit Faktor 3 – der Standard in Edge Lab, einstellbar.', 'Footprint mit diagonaler Kauf-Imbalance');
  },
  divergence() {
    const pr = [[30, 120], [70, 96], [110, 104], [150, 70], [175, 52], [200, 74], [240, 92], [280, 86], [320, 78], [360, 60], [395, 40], [420, 34], [445, 58], [480, 82], [520, 96]];
    const cv = [[30, 205], [70, 188], [110, 192], [150, 170], [175, 150], [200, 166], [240, 178], [280, 176], [320, 172], [360, 166], [395, 160], [420, 162], [445, 176], [480, 190], [520, 198]];
    let s = '<path class="ax" d="M20 128H540M20 214H540"/>' + this.t(24, 16, 'Preis', 'tm') + this.t(24, 142, 'CVD (kumuliertes Delta)', 'tm');
    s += '<path class="px" d="' + this.P(pr) + '"/><path class="cvd" d="' + this.P(cv) + '"/>';
    s += '<path class="dvu" d="M175 52 L420 34"/><path class="dvd" d="M175 150 L395 160"/>';
    s += '<circle class="dot" cx="175" cy="52" r="3.5"/><circle class="dot" cx="420" cy="34" r="3.5"/><circle class="dot" cx="175" cy="150" r="3.5"/><circle class="dot" cx="395" cy="160" r="3.5"/>';
    s += this.t(300, 30, 'höheres Hoch', 'tw', 'middle') + this.t(300, 150, 'tieferes Hoch', 'tr', 'middle');
    return this.wrap(s, 'Delta-Divergenz am Hoch: Der Preis steigt weiter, aber die aggressiven Käufe (CVD) lassen nach. Ein Hinweis auf Erschöpfung – kein Signal für sich allein.', 'Delta-Divergenz zwischen Preis und CVD');
  },
  ib() {
    const ibh = 92, ibl = 138, rng = ibl - ibh;
    const pr = [[30, 120], [45, 100], [60, 130], [75, 94], [90, 136], [105, 110], [120, 104], [150, 112], [180, 96], [200, 90], [230, 76], [260, 82], [290, 66], [320, 70], [350, 72], [390, 60], [420, 74], [460, 70], [500, 78]];
    let s = '<rect class="ibbox" x="30" y="' + ibh + '" width="90" height="' + rng + '"/>' + this.t(75, ibl + 16, '1. Stunde', 'tm', 'middle');
    const ln = (y, cls, lbl) => '<path class="' + cls + '" d="M30 ' + y + 'H470"/>' + this.t(476, y + 4, lbl, 'tm');
    s += ln(ibh - rng, 'ext', '+100 %') + ln(ibh - rng / 2, 'ext', '+50 %') + ln(ibh, 'ibl', 'IB-Hoch') + ln(ibl, 'ibl', 'IB-Tief') + ln(ibl + rng / 2, 'ext', '−50 %') + ln(ibl + rng, 'ext', '−100 %');
    s += '<path class="px" d="' + this.P(pr) + '"/>' + this.t(330, ibh + 20, '↑ Ausbruch über das IB-Hoch', 'tw', 'middle');
    return this.wrap(s, 'Initial Balance (Spanne der ersten Handelsstunde ab 9:30 ET) und Erweiterungen um 50 % und 100 % der IB-Spanne – Orientierungsmarken, keine Garantie.', 'Initial Balance mit Erweiterungen');
  },
  rmult() {
    const e = 106, st = 142, t1 = 70, t2 = 34;
    let s = '<rect class="zw" x="40" y="' + t2 + '" width="240" height="' + (e - t2) + '"/><rect class="zl" x="40" y="' + e + '" width="240" height="' + (st - e) + '"/>';
    const ln = (y, cls, lbl) => '<path class="' + cls + '" d="M40 ' + y + 'H280"/>' + this.t(288, y + 4, lbl, 'tw');
    s += ln(t2, 'lg', 'Ziel 2R: 21.030 (+30 Pkt)') + ln(t1, 'lgd', '1R: 21.015') + ln(e, 'le', 'Einstieg 21.000') + ln(st, 'lr', 'Stop 20.985 (−15 Pkt = 1R)');
    s += this.t(40, 176, 'Risiko je NQ: 15 Pkt × 20 $ = 300 $', 'tm') + this.t(40, 194, 'Geplantes Risiko 300 $ → 300 ÷ 300 = 1 NQ', 'tw') + this.t(40, 212, 'oder 10 MNQ: 300 ÷ (15 Pkt × 2 $) = 10 Kontrakte', 'tm');
    return this.wrap(s, 'R-Multiple und Positionsgröße: 1R ist der Abstand zum Stop mal Punktwert mal Menge. Das Ziel wird in Vielfachen davon geplant.', 'R-Multiple und Positionsgröße am Beispiel NQ');
  },
  equity() {
    const eq = [50000, 50400, 50900, 50600, 51300, 51800, 51200, 50500, 50000, 50300, 50900, 51600, 52100, 52400];
    const lo = 47500, hi = 52500, X = (i) => 40 + i * (420 / (eq.length - 1)), Y = (v) => 18 + (hi - v) / (hi - lo) * 190;
    let peak = eq[0];
    const floor = eq.map((v) => { peak = Math.max(peak, v); return Math.min(50000, peak - 2000); });
    const step = []; floor.forEach((f, i) => { if (i) step.push([X(i), Y(floor[i - 1])]); step.push([X(i), Y(f)]); });
    let s = '<path class="ax" d="M40 ' + Y(50000) + 'H470"/>' + this.t(476, Y(50000) + 4, 'Start 50.000', 'tm');
    s += '<path class="fl" d="' + this.P(step) + '"/>' + this.t(44, Y(floor[0]) + 16, 'Verlustgrenze (2.000 $ unter dem Tagesschluss-Hoch)', 'tr');
    s += '<path class="eqf" d="' + this.P(eq.map((v, i) => [X(i), Y(v)])) + 'L' + X(eq.length - 1) + ' 208L40 208Z"/><path class="eq" d="' + this.P(eq.map((v, i) => [X(i), Y(v)])) + '"/>';
    s += '<circle class="dot" cx="' + X(5) + '" cy="' + Y(51800) + '" r="4"/><circle class="dotr" cx="' + X(8) + '" cy="' + Y(50000) + '" r="4"/>';
    s += '<path class="dd" d="M' + (X(8) + 14) + ' ' + Y(51800) + 'V' + Y(50000) + '"/><path class="ddt" d="M' + (X(5) + 4) + ' ' + Y(51800) + 'H' + (X(8) + 20) + '"/>';
    s += this.t(X(8) + 22, (Y(51800) + Y(50000)) / 2 + 4, 'Max. Drawdown −1.800 $', 'tr');
    s += this.t(X(8) + 22, Y(49800) + 16, 'Puffer am Tief: nur 200 $', 'tm');
    return this.wrap(s, 'Kontokurve mit Drawdown (Hoch 51.800 → Tief 50.000) und nachziehender Verlustgrenze bei 2.000 $ Max-Drawdown auf Tagesschluss-Basis, gedeckelt beim Startkapital.', 'Kontokurve mit Drawdown und Trailing-Grenze');
  }
};

/* ---------- „Im Chart zeigen“: welche Anzeigen eingeschaltet werden ---------- */
const HB_SHOW = {
  vwap: { ind: { vwap: true, bands: true }, label: 'VWAP mit σ-Bändern' },
  profil: { ind: { vp: true, prev: true }, label: 'Volume Profile und Vortages-Level' },
  rth: { ind: { rth: true }, label: 'RTH-Levels (Overnight, Opening Range, Initial Balance)' },
  footprint: { ind: { fp: true, lower: 'delta' }, label: 'Footprint und Delta' },
  cvd: { ind: { lower: 'cvd' }, label: 'CVD im unteren Fenster' },
  sessions: { ind: { sessions: true }, label: 'Session-Zeiten' }
};
const hbBtns = (show) => '<div class="hb-acts">' + (show ? '<button type="button" class="btn sm" data-hb-show="' + show + '">Im Chart zeigen</button>' : '') + '<button type="button" class="btn sm ghost" data-hb-practice>Üben im Replay</button></div>';
const hbBox = (k, html) => '<div class="hb-box ' + k + '"><b>' + ({ merke: 'Merke', faust: 'Faustregel', praxis: 'In Edge Lab', achtung: 'Achtung' }[k]) + '</b>' + html + '</div>';
const hbSetup = (rows) => '<dl class="hb-setup">' + rows.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('') + '</dl>';
const hbL = (id, txt) => '<a href="#handbuch-' + id + '">' + txt + '</a>';

/* ---------- Inhalte ---------- */
const HB = [
  { id: 'einleitung', titel: 'Einleitung', kurz: 'Wofür dieses Handbuch da ist und wie du es mit Edge Lab nutzt.', abschnitte: [
    { id: 'ueber-das-handbuch', titel: 'Wofür dieses Handbuch da ist', html:
      '<p>Dieses Handbuch erklärt die Werkzeuge, mit denen viele Futures- und Orderflow-Trader arbeiten: Risiko in R, Prop-Firm-Regeln, VWAP, Volume Profile, Delta und Footprint, Session-Zeiten und typische Setups. Jedes Kapitel folgt demselben Aufbau: <b>Was ist das?</b> – <b>Wie wird es berechnet?</b> – <b>Wie lesen Profis es?</b> – <b>Typische Setups und Fehler</b> – <b>Praxis in Edge Lab</b>.</p>' +
      '<p>Die Inhalte sind bewusst nüchtern. Kein Werkzeug funktioniert immer, und keine Regel ersetzt deinen eigenen, sauberen Backtest. Wo etwas eine Faustregel ist, steht es dabei.</p>' },
    { id: 'so-nutzt-du-es', titel: 'So nutzt du es', html:
      '<ul><li><b>Lesen, dann üben:</b> Unter vielen Kapiteln schaltet „Im Chart zeigen“ den passenden Indikator ein, „Üben im Replay“ startet eine neue Backtest-Session.</li>' +
      '<li><b>Aus Fehlern lernen:</b> Die ' + '<a href="#analyse">Analyse</a> verlinkt jeden Befund auf den passenden Abschnitt – zum Beispiel „Stop verschoben“ oder „Revenge-Trade“.</li>' +
      '<li><b>Suchen:</b> Das Suchfeld durchsucht alle Kapitel. Treffer werden im Text markiert.</li>' +
      '<li><b>Fortschritt:</b> Unten in jedem Kapitel kannst du es als gelesen markieren. Der Haken erscheint im Inhaltsverzeichnis.</li></ul>' },
    { id: 'hinweis', titel: 'Wichtiger Hinweis', html:
      hbBox('achtung', '<p>Dieses Handbuch ist Lernmaterial und keine Anlageberatung. Trading mit Hebelprodukten wie Futures birgt ein hohes Verlustrisiko; Verluste können schnell und in großer Höhe entstehen. Ergebnisse aus Backtests – auch aus Edge Lab – sind keine Garantie für zukünftige Ergebnisse.</p>') +
      '<p>Kontraktspezifikationen, Handelszeiten und vor allem Prop-Firm-Regeln können sich ändern. Prüfe die aktuellen Angaben immer direkt bei Börse, Broker oder Firma.</p>' }
  ] },

  { id: 'risiko', titel: 'Risiko & Positionsgröße', kurz: 'R-Multiple, Positionsgröße, Kontrakte, Erwartungswert, Drawdown und Verlustserien.', abschnitte: [
    { id: 'r-multiple', titel: 'R-Multiple: Ergebnisse in Risiko messen', html:
      '<p><b>Was ist das?</b> 1R ist der Betrag, den du bei einem Trade planmäßig riskierst: Abstand vom Einstieg zum Stop × Punktwert × Menge. Jedes Ergebnis lässt sich als Vielfaches davon ausdrücken.</p>' +
      '<div class="hb-f">R = Ergebnis ÷ anfängliches Risiko</div>' +
      '<p>Beispiel: Du riskierst 200 $ und gewinnst 500 $ → +2,5R. Du verlierst 260 $ → −1,3R (der Stop wurde mit Slippage gefüllt oder vergrößert).</p>' +
      '<p><b>Warum Profis in R denken:</b> R macht Trades mit unterschiedlicher Größe und unterschiedlichen Märkten vergleichbar. Eine Strategie mit Ø +0,3R je Trade bleibt +0,3R, egal ob du 1 MNQ oder 3 NQ handelst.</p>' + HBFig.rmult() },
    { id: 'positionsgroesse', titel: 'Positionsgröße berechnen', html:
      '<div class="hb-f">Kontrakte = Risiko ($) ÷ (Stop-Abstand in Punkten × Punktwert)</div>' +
      '<p>Immer <b>abrunden</b> – aufrunden heißt, mehr zu riskieren als geplant. Beispiel: 300 $ Risiko, Stop 15 Punkte im NQ (20 $ je Punkt): 300 ÷ (15 × 20) = 1 Kontrakt. Im MNQ (2 $ je Punkt): 300 ÷ (15 × 2) = 10 Kontrakte. Bei 18 Punkten Stop: 300 ÷ 360 = 0,83 → 0 NQ, aber 8 MNQ (288 $ Risiko).</p>' +
      '<table class="hb-t"><thead><tr><th>Kontrakt</th><th>Tick</th><th>Tickwert</th><th>Punktwert</th></tr></thead><tbody>' +
      '<tr><td>NQ – E-mini Nasdaq-100</td><td>0,25</td><td>5,00 $</td><td>20 $</td></tr>' +
      '<tr><td>MNQ – Micro E-mini Nasdaq-100</td><td>0,25</td><td>0,50 $</td><td>2 $</td></tr>' +
      '<tr><td>ES – E-mini S&amp;P 500</td><td>0,25</td><td>12,50 $</td><td>50 $</td></tr>' +
      '<tr><td>MES – Micro E-mini S&amp;P 500</td><td>0,25</td><td>1,25 $</td><td>5 $</td></tr>' +
      '<tr><td>GC – Gold</td><td>0,10</td><td>10,00 $</td><td>100 $</td></tr></tbody></table>' +
      '<p class="hb-small">Quelle: Kontraktspezifikationen der CME Group. Vor dem Handel beim Broker prüfen.</p>' +
      hbBox('praxis', '<p>Im Order-Ticket gibst du das Risiko in $ oder % und den Stop in Punkten ein. Bei „Größe nach Risiko“ rechnet Edge Lab die Menge genau nach dieser Formel – inklusive Slippage beim Einstieg.</p>') },
    { id: 'erwartungswert', titel: 'Erwartungswert: Was ein Trade im Schnitt bringt', html:
      '<div class="hb-f">Erwartung = Trefferquote × Ø Gewinn − Verlustquote × Ø Verlust</div>' +
      '<p>In R: Bei 40 % Treffern, Ø Gewinn +2R und Ø Verlust −1R ist die Erwartung 0,4 × 2 − 0,6 × 1 = <b>+0,2R je Trade</b>. Über 100 Trades sind das rechnerisch +20R – vor Schwankungen, die erheblich sein können.</p>' +
      '<p><b>Warum die Trefferquote allein nichts sagt:</b> 70 % Treffer mit Ø +0,4R Gewinn und Ø −1,2R Verlust ergeben 0,7 × 0,4 − 0,3 × 1,2 = −0,08R – ein Verlustsystem trotz hoher Trefferquote.</p>' +
      '<p>Die <b>Break-even-Trefferquote</b> (ohne Kosten) hängt nur vom Chance-Risiko-Verhältnis ab:</p>' +
      '<div class="hb-f">Break-even-Trefferquote = 1 ÷ (1 + R:R)</div>' +
      '<table class="hb-t"><thead><tr><th>Chance : Risiko</th><th>Break-even-Trefferquote</th></tr></thead><tbody>' +
      '<tr><td>0,5 : 1</td><td>66,7 %</td></tr><tr><td>1 : 1</td><td>50,0 %</td></tr><tr><td>1,5 : 1</td><td>40,0 %</td></tr><tr><td>2 : 1</td><td>33,3 %</td></tr><tr><td>3 : 1</td><td>25,0 %</td></tr><tr><td>4 : 1</td><td>20,0 %</td></tr></tbody></table>' +
      '<p>Gebühren und Slippage verschieben diese Werte nach oben. Bei kleinen Zielen (wenige Ticks) fallen Kosten besonders ins Gewicht.</p>' },
    { id: 'drawdown', titel: 'Drawdown-Mathematik', html:
      '<p>Ein Drawdown ist der Rückgang vom höchsten Kontostand bis zum folgenden Tief. Verluste und Gewinne sind nicht symmetrisch:</p>' +
      '<div class="hb-f">nötiger Gewinn zur Erholung = Verlust ÷ (1 − Verlust)</div>' +
      '<table class="hb-t"><thead><tr><th>Verlust</th><th>nötiger Gewinn</th></tr></thead><tbody>' +
      '<tr><td>−10 %</td><td>+11,1 %</td></tr><tr><td>−20 %</td><td>+25,0 %</td></tr><tr><td>−30 %</td><td>+42,9 %</td></tr><tr><td>−50 %</td><td>+100 %</td></tr><tr><td>−75 %</td><td>+300 %</td></tr></tbody></table>' +
      HBFig.equity() + '<p>Bei Prop-Firmen zählt nicht nur der Drawdown in Prozent, sondern der Abstand zur Verlustgrenze in Dollar – siehe ' + hbL('trailing-drawdown', 'Trailing-Drawdown') + '.</p>' },
    { id: 'verlustserien', titel: 'Verlustserien einplanen', html:
      '<p>Die Wahrscheinlichkeit, dass die nächsten k Trades alle verlieren, ist (1 − Trefferquote)<sup>k</sup>. Bei 50 % Treffern: 5 Verluste in Folge = 0,5<sup>5</sup> ≈ 3,1 %. Das klingt selten – über viele Trades sind solche Serien aber fast sicher.</p>' +
      hbBox('faust', '<p>Längste zu erwartende Verlustserie in n Trades ≈ log(n × p) ÷ log(1 ÷ (1 − p)), mit p = Trefferquote. Bei 50 % und 100 Trades sind das etwa 5–6 Verluste in Folge, bei 40 % etwa 7.</p>') +
      '<p>Plane dein Risiko so, dass du mehrere solcher Serien übersteht. Die Monte-Carlo-Simulation in der ' + '<a href="#stats">Statistik</a> zeigt die Verlustserie, die in 95 % der Durchläufe nicht überschritten wurde.</p>' },
    { id: 'stopp-setzen', titel: 'Stops setzen: Struktur statt Wunschbetrag', html:
      '<p>Ein Stop gehört an die Stelle, an der deine Trade-Idee widerlegt ist – hinter ein Swing-Hoch oder -Tief, jenseits einer Value-Area-Kante oder eines Levels – plus ein kleiner Puffer gegen das bloße Antesten. Erst <b>danach</b> folgt die Größe aus der Formel oben.</p>' +
      '<p>Der häufigste Fehler ist der umgekehrte Weg: „Ich will 2 NQ handeln, also passt nur ein 7-Punkte-Stop.“ Solche Stops liegen oft mitten im normalen Rauschen.</p>' +
      hbBox('faust', '<p>Als Orientierung für das Rauschen dient die ATR (durchschnittliche Kerzenspanne). Ein Stop deutlich unter 1 ATR des Einstiegs-Timeframes wird häufig zufällig ausgelöst.</p>') +
      hbBox('praxis', '<p>„Stop aus ATR setzen“ im Order-Ticket setzt den Abstand auf 1,5 × ATR(14) des aktiven Charts. Die Analyse meldet „Stop zu eng“, wenn Verlierer vorher schon 1R im Plus lagen oder nach dem Stopp noch ins Ziel liefen.</p>') },
    { id: 'ziele', titel: 'Ziele und Teilausstieg', html:
      '<p>Ziele an feste R-Vielfache zu hängen ist einfach zu testen, ignoriert aber den Markt. Viele Trader legen Ziele an das nächste relevante Level: VWAP-Band, POC, Value-Area-Kante, Vortageshoch/-tief oder eine IB-Erweiterung.</p>' +
      '<p><b>Teilausstieg</b> (z. B. 50 % bei 1R, Rest mit Stop auf Einstand) glättet die Kontokurve und erhöht die Trefferquote. Er kostet aber Erwartung, wenn dein volles Ziel oft erreicht wird. Ob er sich lohnt, zeigt nur dein Journal: Wie viele Trades erreichten 1R, aber nicht das Ziel (MFE)?</p>' +
      hbBox('praxis', '<p>Teilausstieg, Stop auf Einstand und Trailing-Stop stellst du im Order-Ticket unter „Teilausstieg &amp; Stop-Management“ ein. Die Analyse rechnet beim Befund „Ziel oft knapp verfehlt“ aus, was 50 % bei 1R netto gebracht hätten.</p>') }
  ] },

  { id: 'prop', titel: 'Prop-Firm-Regeln', kurz: 'Trailing-Drawdown, Tagesverlust-Limit, Konsistenzregeln und die typischen Fehler in der Challenge.', abschnitte: [
    { id: 'prop-ablauf', titel: 'Wie eine Prop-Challenge funktioniert', html:
      '<p>Eine Prop-Firm stellt Kapital (meist zunächst ein Prüfungskonto) unter festen Regeln zur Verfügung. Typisch sind: ein <b>Gewinnziel</b>, eine <b>maximale Verlustgrenze</b> (oft als Trailing-Drawdown), ein <b>Tagesverlust-Limit</b>, eine Höchstzahl an Kontrakten, teils <b>Mindest-Handelstage</b> und <b>Konsistenzregeln</b>. Wer eine Grenze verletzt, verliert das Konto – egal, wie gut die Woche davor war.</p>' +
      hbBox('achtung', '<p>Die Regeln sind je Firma unterschiedlich und ändern sich regelmäßig. Lies immer die aktuellen Regeln deiner Firma, bevor du handelst – dieses Kapitel erklärt nur die Mechanik.</p>') },
    { id: 'trailing-drawdown', titel: 'Trailing-Drawdown: Tagesschluss vs. intraday', html:
      '<p>Beim Trailing-Drawdown liegt die Verlustgrenze einen festen Betrag unter dem bisher höchsten Kontostand – und zieht mit, wenn das Konto steigt. Entscheidend ist, <b>welcher</b> Höchststand zählt:</p>' +
      '<ul><li><b>End-of-Day (Tagesschluss):</b> Die Grenze zieht nur mit dem Kontostand bei Handelsschluss nach. Schwankungen während des Tages verschieben sie nicht.</li>' +
      '<li><b>Intraday (Echtzeit):</b> Die Grenze zieht mit dem höchsten Stand während des Tages nach – häufig inklusive unrealisierter Gewinne. Ein Trade, der +1.500 $ im Plus war und mit +200 $ endet, hat die Grenze trotzdem um 1.500 $ angehoben.</li></ul>' +
      '<p>Beispiel mit 50.000 $ Konto und 2.000 $ Drawdown: Startgrenze 48.000 $. Ein Tag mit Höchststand 51.500 $ (unrealisiert) und Schluss bei 50.200 $ ergibt intraday eine Grenze von 49.500 $, auf Tagesschluss-Basis 48.200 $.</p>' +
      '<p>Bei vielen Firmen hört das Nachziehen auf, sobald die Grenze das Startkapital erreicht – auch das ist je Firma geregelt.</p>' },
    { id: 'tagesverlust', titel: 'Tagesverlust-Limit und Konsistenzregeln', html:
      '<p>Das <b>Tagesverlust-Limit</b> begrenzt den Verlust eines Handelstages. Je nach Firma zählen nur realisierte oder auch offene Verluste, und ein Verstoß beendet entweder nur den Tag oder das ganze Konto.</p>' +
      '<p><b>Konsistenzregeln</b> sollen verhindern, dass ein einziger Glückstag die Prüfung entscheidet. Beispiel einer 40-%-Regel: Bei 3.000 $ Gesamtgewinn darf kein einzelner Tag mehr als 1.200 $ beitragen. Die Prozentsätze und Details unterscheiden sich je Firma.</p>' },
    { id: 'prop-fehler', titel: 'Typische Fehler in der Challenge', html:
      '<ul><li><b>Zu große Positionen für den Drawdown.</b> Bei 2.000 $ Drawdown und 500 $ Risiko je Trade beenden vier Verluste in Folge das Konto. Faustregel: Risiko je Trade so wählen, dass mehrere ' + hbL('verlustserien', 'Verlustserien') + ' hineinpassen.</li>' +
      '<li><b>Gewinne zurückgeben bei Intraday-Trailing:</b> Offene Gewinne heben die Grenze an. Wer große Gewinne wieder laufen lässt, verliert Puffer, ohne Geld verloren zu haben.</li>' +
      '<li><b>Weiterhandeln nahe am Tageslimit</b> – meist mit größerer Position, um den Tag zu „retten“ (' + hbL('revenge', 'Revenge') + ').</li>' +
      '<li><b>News-Regeln ignorieren:</b> Manche Firmen verbieten Positionen rund um bestimmte Termine.</li>' +
      '<li><b>Zeitdruck:</b> Mindest- oder Höchstzahl an Tagen verleitet zu Trades ohne Setup.</li></ul>' +
      hbBox('praxis', '<p>Unter Einstellungen → Prop-Regeln legst du Max-Drawdown (Tagesschluss-Basis, gedeckelt beim Startkapital), Tageslimit und Ziel fest. Jede Backtest-Session wird als eigenes Konto geprüft. Die Monte-Carlo-Simulation in der Statistik schätzt, wie oft deine Trades das Ziel vor der Grenze erreicht hätten.</p>') }
  ] },

  { id: 'vwap', titel: 'VWAP', show: 'vwap', kurz: 'Volumengewichteter Durchschnittspreis, Standardabweichungs-Bänder, Anchored VWAP und Setups.', abschnitte: [
    { id: 'vwap-was', titel: 'Was ist der VWAP?', html:
      '<p>Der VWAP (Volume Weighted Average Price) ist der volumengewichtete Durchschnittspreis seit Beginn der Session. Er zeigt, zu welchem Preis im Schnitt gehandelt wurde – Preise mit viel Volumen zählen stärker.</p>' +
      '<div class="hb-f">VWAP = Σ (typischer Preis × Volumen) ÷ Σ Volumen<br>typischer Preis = (Hoch + Tief + Schluss) ÷ 3 je Kerze</div>' +
      '<p>Die Summen laufen ab Session-Beginn und werden dann zurückgesetzt. In Edge Lab beginnt die Session bei Index-Futures um 18:00 New Yorker Zeit (CME-Handelstag). Manche Plattformen setzen den VWAP erst zur US-Eröffnung um 9:30 ET zurück – dann weichen die Werte ab. Wichtig ist, dass du beim Backtest und live dieselbe Definition nutzt.</p>' + HBFig.vwap() },
    { id: 'vwap-baender', titel: 'Standardabweichungs-Bänder', html:
      '<p>Die Bänder zeigen, wie weit der Preis volumengewichtet um den VWAP streut:</p>' +
      '<div class="hb-f">σ = √( Σ(tp² × v) ÷ Σv − VWAP² )<br>Bänder: VWAP ± 1σ, ± 2σ (± 3σ)</div>' +
      '<p>Am ruhigen Tag pendelt der Kurs meist zwischen den ±1σ-Bändern um den VWAP. Am Trendtag läuft er am 1σ- oder 2σ-Band entlang, und Rücksetzer enden oft am VWAP oder am 1σ-Band.</p>' },
    { id: 'anchored-vwap', titel: 'Anchored VWAP', html:
      '<p>Ein Anchored VWAP beginnt nicht zum Session-Start, sondern an einem selbst gewählten Punkt – etwa an der US-Eröffnung, einem markanten Hoch oder Tief, einer News-Kerze oder dem Beginn eines Ausbruchs. Er zeigt den Durchschnittspreis aller, die seit diesem Ereignis gehandelt haben.</p>' +
      '<p>Lesart: Hält der Kurs über einem vom Tief verankerten VWAP, liegen die Käufer seit diesem Tief im Schnitt im Gewinn.</p>' +
      hbBox('praxis', '<p>Werkzeug „Anchored VWAP“ (Taste V) wählen und auf die Ankerkerze klicken. Rechtsklick auf den Knopf entfernt ihn.</p>') },
    { id: 'vwap-lesen', titel: 'Wie Profis den VWAP lesen', html:
      '<ul><li><b>Fairer Preis des Tages:</b> Über dem VWAP haben Käufer seit Session-Beginn im Schnitt Gewinn, darunter Verkäufer.</li>' +
      '<li><b>Benchmark:</b> Viele institutionelle Orders werden am VWAP gemessen oder per Algorithmus über den Tag verteilt. Deshalb reagiert der Kurs dort häufig.</li>' +
      '<li><b>Steigung und Abstand:</b> Ein steigender VWAP mit Kurs darüber spricht für Käuferkontrolle. Weit entfernte Kurse (2σ und mehr) sind gedehnt – Fortsetzung ist möglich, Einstiege dort haben aber einen weiten Weg zum Stop.</li></ul>' },
    { id: 'vwap-setups', titel: 'Setups: Rückeroberung, Ablehnung, Band-Fade, Band-Trend', html:
      '<ul><li><b>Rückeroberung (Reclaim):</b> Kurs fällt unter den VWAP, findet keine Anschlussverkäufe und schließt wieder darüber – Long mit Stop unter dem Tief. Details im ' + hbL('setup-vwap-reclaim', 'Setup') + '.</li>' +
      '<li><b>Ablehnung (Reject):</b> Rücklauf von unten an den VWAP, Verkäufer verteidigen ihn – Short mit Stop über dem Ablehnungshoch.</li>' +
      '<li><b>Band-Fade:</b> Am Balance-Tag am ±2σ-Band gegen die Bewegung, Ziel VWAP. Gefährlich am Trendtag.</li>' +
      '<li><b>Band-Trend:</b> Am Trendtag Rücksetzer zum VWAP oder 1σ-Band in Trendrichtung handeln.</li></ul>' +
      '<p>Woran erkennst du den Tagestyp? Hinweise sind eine Eröffnung außerhalb der Vortages-Value-Area, eine früh weite ' + hbL('initial-balance', 'Initial Balance') + ' und ein klar steigender oder fallender VWAP.</p>' },
    { id: 'vwap-fehler', titel: 'Typische Fehler mit dem VWAP', html:
      '<ul><li>Gegen einen klar steigenden VWAP shorten (oder gegen einen fallenden kaufen), ohne Level und Orderflow als Grund.</li>' +
      '<li>Band-Fades am Trendtag: Das 2σ-Band ist dann kein Widerstand, sondern die Laufbahn.</li>' +
      '<li>Den VWAP in den ersten Minuten der Session überbewerten – mit wenig Volumen springt er stark.</li>' +
      '<li>Unterschiedliche Reset-Zeiten mischen (18:00 ET vs. 9:30 ET).</li></ul>' +
      hbBox('praxis', '<p>Die Analyse speichert beim Platzieren, ob du über oder unter dem Session-VWAP eingestiegen bist, und vergleicht deine Ergebnisse mit und gegen den VWAP.</p>') + hbBtns('vwap') }
  ] },

  { id: 'profil', titel: 'Volume Profile & Market Profile', show: 'profil', kurz: 'POC, Value Area, HVN/LVN, Profilformen, 80-%-Regel, Initial Balance, Overnight und Opening Range.', abschnitte: [
    { id: 'volume-profile', titel: 'Volume Profile: POC und Value Area', html:
      '<p>Ein Volume Profile zeigt, wie viel Volumen auf jeder Preisstufe gehandelt wurde – über einen Zeitraum, nicht über die Zeit. Daraus ergeben sich:</p>' +
      '<ul><li><b>POC</b> (Point of Control): die Preisstufe mit dem meisten Volumen.</li>' +
      '<li><b>Value Area</b>: der Bereich um den POC, in dem 70 % des Volumens gehandelt wurden. Die 70 % sind eine Konvention, angelehnt an eine Standardabweichung (≈ 68 %).</li>' +
      '<li><b>VAH / VAL</b>: Ober- und Unterkante der Value Area.</li></ul>' +
      '<p><b>Berechnung (CBOT-Verfahren):</b> Vom POC ausgehend werden jeweils die zwei nächsten Preisstufen oberhalb und unterhalb verglichen. Die Seite mit mehr Volumen wird hinzugenommen. Das wiederholt sich, bis 70 % des Gesamtvolumens erreicht sind.</p>' + HBFig.profile() },
    { id: 'hvn-lvn', titel: 'HVN und LVN', html:
      '<p><b>HVN</b> (High Volume Node): Bereiche mit viel Volumen – der Markt hat diese Preise akzeptiert, der Kurs verweilt dort gern. <b>LVN</b> (Low Volume Node): Bereiche mit wenig Volumen – Preise, die abgelehnt wurden. Der Kurs läuft oft schnell durch LVNs, und sie trennen häufig zwei Verteilungen.</p>' +
      hbBox('faust', '<p>LVNs sind gute Orte für Stops (dahinter) und Ziele (davor). HVNs sind eher Ziele als Einstiege, weil der Kurs dort häufig hin und her pendelt.</p>') },
    { id: 'profilformen', titel: 'Profilformen und Market Profile', html:
      '<ul><li><b>D-Form:</b> ausgewogene Verteilung mit POC in der Mitte – Balance.</li>' +
      '<li><b>P-Form:</b> dicker Bauch oben, dünner Schwanz unten – oft nach einem Anstieg mit Akzeptanz höherer Preise (z. B. durch Short-Eindeckungen).</li>' +
      '<li><b>b-Form:</b> dicker Bauch unten – das Gegenstück, oft nach Liquidation von Long-Positionen.</li>' +
      '<li><b>Dünnes, gestrecktes Profil:</b> Trendtag, wenig Akzeptanz auf einzelnen Preisen.</li></ul>' +
      '<p>Das <b>Market Profile</b> (TPO) arbeitet mit Zeit statt Volumen: Jede 30-Minuten-Periode bekommt einen Buchstaben auf allen Preisen, die sie erreicht hat. POC und Value Area werden dann aus der Zeit am Preis berechnet. Volume und Market Profile ähneln sich meist, weichen aber bei schnellen Bewegungen mit viel Volumen voneinander ab.</p>' },
    { id: 'vortag', titel: 'Vortages-Werte und die 80-%-Regel', html:
      '<p>VAH, VAL und POC des Vortages sind für viele Trader die ersten Referenzen des neuen Tages. Wichtig ist, wo der Markt eröffnet: innerhalb der Vortages-Value-Area (eher Balance) oder außerhalb (möglicher Richtungstag).</p>' +
      hbBox('faust', '<p><b>80-%-Regel</b> aus dem Market Profile: Eröffnet der Markt außerhalb der Vortages-Value-Area und kehrt in sie zurück (oft verlangt: zwei aufeinanderfolgende 30-Minuten-Perioden darin), läuft er häufig bis zur anderen Seite der Value Area. Der Name ist keine verlässliche Trefferquote – teste die Regel für deinen Markt selbst.</p>') },
    { id: 'initial-balance', titel: 'Initial Balance und Erweiterungen', html:
      '<p>Die <b>Initial Balance</b> (IB) ist die Spanne der ersten Handelsstunde der regulären Sitzung, bei US-Index-Futures 9:30–10:30 ET. Sie zeigt, wie weit sich Käufer und Verkäufer früh einig waren.</p>' + HBFig.ib() +
      hbBox('faust', '<p>Eine im Vergleich enge IB wird häufiger ausgedehnt, eine sehr weite IB spricht eher für Balance. Erweiterungen um 50 % und 100 % der IB-Spanne dienen vielen als Orientierungsziele.</p>') + hbBtns('rth') },
    { id: 'overnight-opening-range', titel: 'Overnight-Hoch/-Tief und Opening Range', html:
      '<p><b>Overnight-Hoch/-Tief</b> (ONH/ONL): Extremwerte des Handels zwischen 18:00 ET und der US-Eröffnung um 9:30 ET. Sie werden oft in der ersten Stunde getestet.</p>' +
      '<p><b>Opening Range</b>: die Spanne der ersten Minuten nach 9:30 ET (üblich sind 5, 15 oder 30 Minuten). Ausbrüche aus der Opening Range sind ein klassisches ' + hbL('setup-orb', 'Setup') + '.</p>' +
      hbBox('praxis', '<p>„RTH-Levels“ zeigt Overnight-Hoch/-Tief, RTH-Eröffnung, Opening Range (15 Minuten) und Initial Balance – immer nur aus Kerzen bis zum Cursor. „Vortag“ zeigt Hoch, Tief, Schluss, POC, VAH und VAL des Vortages, „Profil“ das Volume Profile des sichtbaren Bereichs.</p>') + hbBtns('profil') }
  ] },

  { id: 'orderflow', titel: 'Orderflow-Grundlagen', show: 'footprint', kurz: 'Bid/Ask, Aggressor, Delta, CVD, Footprint, Imbalances, Absorption, Exhaustion und die Grenzen der Daten.', abschnitte: [
    { id: 'bid-ask', titel: 'Bid, Ask und der Aggressor', html:
      '<p>Das <b>Bid</b> ist das höchste Kaufgebot, der <b>Ask</b> das niedrigste Verkaufsangebot. Wer sofort handeln will, schickt eine <b>Market-Order</b> und ist der <b>Aggressor</b>: Er kauft am Ask oder verkauft am Bid. Wer eine <b>Limit-Order</b> ins Orderbuch legt, handelt <b>passiv</b> und wartet, bis ein Aggressor kommt.</p>' +
      '<p>Jeder Trade hat einen Käufer und einen Verkäufer. Orderflow-Analyse fragt deshalb nicht „Wer hat gekauft?“, sondern „Wer war aggressiv?“.</p>' },
    { id: 'delta-cvd', titel: 'Delta und CVD', html:
      '<div class="hb-f">Delta = Volumen der Kauf-Aggressoren − Volumen der Verkauf-Aggressoren</div>' +
      '<p>Ein positives Delta je Kerze heißt: Mehr Volumen wurde aggressiv gekauft als verkauft. Das <b>CVD</b> (Cumulative Volume Delta) summiert das Delta fortlaufend – in Edge Lab standardmäßig ab Session-Beginn, einstellbar.</p>' +
      '<p>Delta allein sagt nicht, wohin der Kurs geht. Interessant wird es im Verhältnis zur Preisbewegung: Viel positives Delta ohne steigenden Preis kann auf passive Verkäufer hindeuten (' + hbL('absorption', 'Absorption') + ').</p>' + hbBtns('cvd') },
    { id: 'footprint', titel: 'Footprint und diagonale Imbalance', html:
      '<p>Ein <b>Footprint</b> zeigt je Preisstufe einer Kerze das Volumen am Bid (Verkauf-Aggressoren, links) und am Ask (Kauf-Aggressoren, rechts) – „Bid × Ask“.</p>' +
      '<p><b>Diagonale Imbalance:</b> Verglichen wird das Ask-Volumen auf Preis P mit dem Bid-Volumen <i>eine Stufe darunter</i> – denn zum selben Zeitpunkt liegen Bid und Ask eine Stufe auseinander. Ist das Ask-Volumen mindestens um einen Faktor größer, ist das eine Kauf-Imbalance; umgekehrt (Bid auf P gegen Ask eine Stufe darüber) eine Verkaufs-Imbalance.</p>' + HBFig.footprint() +
      '<p><b>Stacked Imbalances:</b> Mehrere Imbalances derselben Seite direkt übereinander (Faustregel: drei oder mehr) zeigen eine Zone mit einseitigem, aggressivem Druck. Solche Zonen werden später oft als Unterstützung oder Widerstand beobachtet.</p>' },
    { id: 'absorption', titel: 'Absorption und Exhaustion', html:
      '<p><b>Absorption:</b> Viel aggressives Volumen in eine Richtung, aber der Preis kommt nicht weiter – große passive Limit-Orders nehmen alles auf. Beispiel: Am Vortagestief wird stark aggressiv verkauft (tiefrotes Delta), der Kurs hält trotzdem. Kippt danach das Delta, ist das ein mögliches Long-' + hbL('setup-absorption', 'Setup') + '.</p>' +
      '<p><b>Exhaustion (Erschöpfung):</b> Eine Bewegung läuft aus, weil die Aggressoren fehlen – am Hoch oder Tief stehen auffallend kleine Volumina im Footprint. Der letzte Käufer hat gekauft.</p>' },
    { id: 'delta-divergenz', titel: 'Delta-Divergenz und große Trades', html:
      '<p>Eine <b>Delta-Divergenz</b> liegt vor, wenn der Preis ein neues Hoch macht, das Delta oder CVD aber nicht (oder umgekehrt am Tief). Die Aggression lässt nach, während der Preis noch läuft.</p>' + HBFig.divergence() +
      '<p><b>Große Trades</b> (große Einzelausführungen) fallen im Footprint auf. Vorsicht: Große Marktteilnehmer zerlegen ihre Orders meist in viele kleine – oder zeigen nur einen Teil (Iceberg-Orders). Ein großer Print ist kein Beweis für eine Richtung.</p>' },
    { id: 'orderflow-grenzen', titel: 'Grenzen: echte und geschätzte Daten', html:
      '<p>Echtes Delta und echte Footprints brauchen jeden einzelnen Trade mit Aggressor-Seite. Fehlen diese Daten, lässt sich Delta nur aus der Kerzenform schätzen (Schluss nahe am Hoch → eher Käufer). Das ist eine grobe Näherung.</p>' +
      '<ul><li><b>Index-Archiv in Edge Lab:</b> 1-Minuten-Kerzen eines Datenanbieters ohne Börsen-Einzeltrades. Delta ist geschätzt, Volumen ist Anbieter-Volumen und weicht vom CME-Volumen ab, kein Footprint.</li>' +
      '<li><b>Krypto (Binance):</b> echtes Taker-Kaufvolumen je Kerze, also echtes Delta. Mit „Trades laden“ auch echte Footprints.</li>' +
      '<li><b>CSV-Import:</b> Trade-Dateien mit Aggressor-Seite (z. B. Databento) liefern echtes Delta und Footprint.</li></ul>' +
      '<p>Das <b>Orderbuch (DOM)</b> zeigt wartende Limit-Orders. Es ändert sich ständig, Orders werden storniert und verschoben. Edge Lab enthält kein historisches Orderbuch.</p>' + hbBtns('footprint') }
  ] },

  { id: 'sessions', titel: 'Sessions & Zeitfenster', show: 'sessions', kurz: 'Asien, London, New York, CME-Handelstag, wichtige Uhrzeiten und Sommerzeit.', abschnitte: [
    { id: 'handelszeiten', titel: 'Der CME-Handelstag', html:
      '<p>US-Index-Futures wie NQ und ES sowie Gold (GC) werden auf CME Globex fast rund um die Uhr gehandelt: von Sonntag 18:00 bis Freitag 17:00 New Yorker Zeit (ET), mit einer täglichen Pause von 17:00 bis 18:00 ET. Ein neuer Handelstag beginnt also um 18:00 ET am Vorabend.</p>' +
      '<p>Die <b>reguläre Sitzung</b> (RTH) entspricht dem US-Aktienmarkt: 9:30–16:00 ET. Die übrige Zeit heißt ETH oder Overnight. In der RTH ist das Volumen in der Regel deutlich höher.</p>' },
    { id: 'drei-sessions', titel: 'Asien, London, New York', html:
      '<table class="hb-t"><thead><tr><th>Session</th><th>Ortszeit</th><th>Deutsche Zeit (Normalfall)</th></tr></thead><tbody>' +
      '<tr><td>Asien (Tokio)</td><td>9:00–15:30</td><td>1:00–7:30 (Winter) / 2:00–8:30 (Sommer)</td></tr>' +
      '<tr><td>London</td><td>8:00–16:30</td><td>9:00–17:30</td></tr>' +
      '<tr><td>New York (Kassa)</td><td>9:30–16:00 ET</td><td>15:30–22:00</td></tr></tbody></table>' +
      '<p>Japan kennt keine Sommerzeit, deshalb verschiebt sich die Tokio-Session aus deutscher Sicht um eine Stunde.</p>' },
    { id: 'wichtige-zeiten', titel: 'Wichtige Uhrzeiten', html:
      '<ul><li><b>8:30 ET (14:30 deutscher Zeit):</b> viele US-Wirtschaftsdaten, z. B. Arbeitsmarktbericht (meist erster Freitag im Monat), Verbraucherpreise (CPI), Erstanträge auf Arbeitslosenhilfe (donnerstags).</li>' +
      '<li><b>9:30 ET (15:30):</b> Eröffnung des US-Kassamarkts, Beginn von Opening Range und Initial Balance.</li>' +
      '<li><b>10:00 ET (16:00):</b> weitere Daten, z. B. ISM-Einkaufsmanagerindex, Verbrauchervertrauen, JOLTS.</li>' +
      '<li><b>14:00 ET (20:00):</b> Zinsentscheid der US-Notenbank (acht planmäßige Sitzungen im Jahr), Pressekonferenz 14:30 ET.</li>' +
      '<li><b>16:00 ET (22:00):</b> Schluss des Kassamarkts; Futures handeln bis 17:00 ET weiter.</li></ul>' +
      '<p>Termine schwanken; nutze einen Wirtschaftskalender. Im Blind-Modus kennst du das Datum nicht – genau deshalb lohnt es sich, Verhalten um 8:30 und 10:00 ET grundsätzlich vorsichtig zu üben.</p>' +
      '<h4>So nutzt du die Termin-Markierungen</h4>' +
      '<p>Edge Lab kennt die wichtigsten US-Termine von 2020 bis Oktober 2026: Verbraucherpreise (CPI) und Arbeitsmarktbericht jeweils 8:30 ET, Fed-Zinsentscheid 14:00 ET (2020 auch die außerplanmäßigen Statements). Quellen sind die offiziellen Archive von BLS und Federal Reserve.</p>' +
      '<ul><li><b>Vorwarnung:</b> 30 Minuten vor Daten (2 Stunden vor dem Zinsentscheid) erscheint oben im Chart ein Hinweis, z. B. „In 15 Min: …“. Im Live-Handel weißt du das auch – das ist kein Blick in die Zukunft.</li>' +
      '<li><b>Linie:</b> Ist der Termin vorbei, markiert eine gestrichelte Linie mit Kürzel (CPI, NFP, FOMC) den Zeitpunkt. Künftige Termine werden nie gezeichnet.</li>' +
      '<li><b>Blind-Modus:</b> Die Kürzel würden das Datum verraten. Deshalb steht dort nur „Hochrelevanter US-Termin um 8:30 ET“ bzw. „Termin“; die Art siehst du nach der Session.</li>' +
      '<li><b>Schalter:</b> Indikatoren → Wirtschaftsdaten. Gilt für Märkte mit US-Bezug (Indizes inkl. DAX, Gold, Krypto, Futures).</li>' +
      '<li><b>Auswertung:</b> Jeder Trade speichert den Abstand zum nächsten bzw. letzten Termin. Die Analyse vergleicht „News-Trades“ (15 Min davor bis 30 Min danach) mit den übrigen, sobald es mindestens fünf gibt.</li></ul>' },
    { id: 'sommerzeit', titel: 'Sommerzeit-Verschiebung', html:
      '<p>Die USA stellen am zweiten Sonntag im März auf Sommerzeit um und am ersten Sonntag im November zurück. Europa stellt am letzten Sonntag im März und am letzten Sonntag im Oktober um.</p>' +
      '<p>In den Wochen dazwischen beträgt der Abstand zwischen Deutschland und New York nur fünf statt sechs Stunden: Die US-Eröffnung liegt dann bei <b>14:30</b> statt 15:30 deutscher Zeit, die 8:30-Daten bei 13:30.</p>' +
      hbBox('praxis', '<p>Edge Lab rechnet Session-Zeiten intern in New Yorker Zeit und zeigt sie in deiner Anzeige-Zeitzone (Einstellungen → Konto). Sommerzeitwechsel sind berücksichtigt.</p>') },
    { id: 'zeitfenster', titel: 'Zeitfenster auswerten', html:
      '<p>Viele Strategien funktionieren nur in bestimmten Phasen – etwa in der ersten Stunde nach 9:30 ET. Die Statistik zeigt deine Ergebnisse nach Uhrzeit und Wochentag, die Analyse meldet Zeitfenster mit mindestens fünf Trades und negativem Ø R, wenn der Rest positiv ist.</p>' +
      hbBox('faust', '<p>Fünf Trades sind ein Hinweis, kein Beweis. Bevor du ein Zeitfenster sperrst, sammle mindestens 30 Trades darin – und prüfe, ob es an der Uhrzeit liegt oder an einem Setup, das du nur dann handelst.</p>') +
      hbBox('praxis', '<p>Im Dialog „Neue Session“ wählst du die Startzeit: New York 9:30 ET (Start 9:15), London 8:00, Asien 9:00 Tokio oder zufällig.</p>') + hbBtns('sessions') }
  ] },

  { id: 'setups', titel: 'Setups-Bibliothek', kurz: 'Sieben Setups mit Kontext, Auslöser, Stop, Ziel, Invalidierung und Backtest-Plan.', abschnitte: [
    { id: 'setups-intro', titel: 'So sind die Setups aufgebaut', html:
      '<p>Die folgenden Setups sind <b>Ausgangspunkte zum Testen</b>, keine Empfehlungen. Jedes ist gleich aufgebaut: Kontext (wann überhaupt), Auslöser (der genaue Einstieg), Stop, Ziel, Invalidierung (wann die Idee nicht mehr gilt) und wie du es in Edge Lab prüfst.</p>' +
      hbBox('praxis', '<p>Lege jedes Setup als Strategie an und schreibe die Regeln als Checkliste. Sie erscheinen vor jedem Einstieg im Order-Ticket, und die Analyse vergleicht Trades mit vollständig abgehakten Regeln mit den übrigen.</p>') },
    { id: 'setup-vwap-reclaim', titel: 'VWAP-Rückeroberung', html: hbSetup([
      ['Kontext', 'Kurs fällt unter den Session-VWAP, idealerweise an ein Level (Vortages-VAL, Overnight-Tief).'],
      ['Auslöser', 'Eine Kerze schließt wieder über dem VWAP, Delta der Kerze positiv.'],
      ['Stop', 'Unter dem Tief der Bewegung unter den VWAP.'],
      ['Ziel', '+1σ-Band oder nächstes Level (POC, VAH), alternativ 2R.'],
      ['Invalidierung', 'Kurs fällt direkt wieder unter den VWAP und schließt darunter.'],
      ['Backtest', 'Ergebnisse mit und ohne Level-Kontext getrennt notieren (z. B. als zwei Strategien).']]) + hbBtns('vwap') },
    { id: 'setup-fehlausbruch', titel: 'Fehlausbruch an VAH/VAL', html: hbSetup([
      ['Kontext', 'Eröffnung innerhalb der Vortages-Value-Area, Balance-Bedingungen.'],
      ['Auslöser', 'Kurs handelt über VAH (unter VAL), findet keine Anschlusskäufe (-verkäufe) und schließt wieder innerhalb der Value Area.'],
      ['Stop', 'Hinter das Extrem des Fehlausbruchs.'],
      ['Ziel', 'POC, danach die gegenüberliegende Kante (vgl. 80-%-Regel).'],
      ['Invalidierung', 'Akzeptanz außerhalb: mehrere Kerzen schließen jenseits der Kante.'],
      ['Backtest', 'Startzeit New York, „Vortag“ einschalten; Tage mit Eröffnung außerhalb der Value Area getrennt betrachten.']]) + hbBtns('profil') },
    { id: 'setup-ib-ausbruch', titel: 'Initial-Balance-Ausbruch', html: hbSetup([
      ['Kontext', 'Vergleichsweise enge Initial Balance, Kurs auf der Ausbruchsseite des VWAP.'],
      ['Auslöser', 'Schluss außerhalb von IB-Hoch oder -Tief nach 10:30 ET, Delta in Ausbruchsrichtung.'],
      ['Stop', 'Zurück in die IB, z. B. Mitte der IB oder unter die Ausbruchskerze.'],
      ['Ziel', 'IB-Erweiterung +50 % / +100 %.'],
      ['Invalidierung', 'Schneller Rücklauf in die IB (Fehlausbruch – möglicherweise ein Setup in Gegenrichtung).'],
      ['Backtest', '„RTH-Levels“ einschalten. Notiere die IB-Spanne in Punkten, um später enge und weite IBs zu vergleichen.']]) + hbBtns('rth') },
    { id: 'setup-orb', titel: 'Opening-Range-Breakout', html: hbSetup([
      ['Kontext', 'Erste 15 Minuten nach 9:30 ET, klare Spanne; Eröffnung nahe einem Vortages-Extrem erhöht die Bedeutung.'],
      ['Auslöser', 'Schluss außerhalb der Opening Range (oder Stop-Order knapp dahinter).'],
      ['Stop', 'Gegenüberliegende Seite oder Mitte der Opening Range.'],
      ['Ziel', 'Vielfaches der Spanne, Overnight-Extrem oder Vortages-Level.'],
      ['Invalidierung', 'Rückkehr in die Opening Range innerhalb weniger Kerzen.'],
      ['Backtest', 'Viele Fehlausbrüche sind normal – die Erwartung entscheidet, nicht die Trefferquote. Kosten realistisch ansetzen, weil Stop-Einstiege Slippage haben.']]) + hbBtns('rth') },
    { id: 'setup-absorption', titel: 'Absorption am Level', html: hbSetup([
      ['Kontext', 'Bekanntes Level (Vortageshoch/-tief, VAH/VAL, Overnight-Extrem).'],
      ['Auslöser', 'Starkes aggressives Volumen ins Level, aber kein Durchbruch; danach kippt das Delta in die Gegenrichtung.'],
      ['Stop', 'Wenige Ticks hinter das Level bzw. das Extrem der Absorption.'],
      ['Ziel', 'VWAP oder POC.'],
      ['Invalidierung', 'Durchbruch mit Anschluss – die passive Seite hat aufgegeben.'],
      ['Backtest', 'Braucht echte Trade-Daten (Krypto oder Trade-CSV). Mit geschätztem Delta nicht sinnvoll prüfbar.']]) + hbBtns('footprint') },
    { id: 'setup-delta-divergenz', titel: 'Delta-Divergenz am Hoch/Tief', html: hbSetup([
      ['Kontext', 'Ausgedehnte Bewegung bis an ein Level oder das 2σ-Band.'],
      ['Auslöser', 'Neues Hoch ohne neues CVD-Hoch, dann Bruch des letzten kleinen Tiefs.'],
      ['Stop', 'Über dem Hoch.'],
      ['Ziel', 'VWAP oder 1σ-Band.'],
      ['Invalidierung', 'Neues Hoch mit neuem CVD-Hoch.'],
      ['Backtest', 'Divergenzen gibt es viele – nur mit Level-Kontext zählen. CVD im unteren Fenster einschalten.']]) + hbBtns('cvd') },
    { id: 'setup-pullback', titel: 'Trend-Pullback zur EMA oder zum VWAP', html: hbSetup([
      ['Kontext', 'Klarer Trend: Kurs auf einer Seite des VWAP, steigender (fallender) VWAP, EMA 21 in Trendrichtung.'],
      ['Auslöser', 'Rücksetzer an EMA 21 oder VWAP, Umkehrkerze in Trendrichtung.'],
      ['Stop', 'Hinter das Pullback-Extrem.'],
      ['Ziel', 'Letztes Hoch (Tief) oder 2R; Rest laufen lassen mit Trailing-Stop.'],
      ['Invalidierung', 'Schluss auf der anderen Seite des VWAP.'],
      ['Backtest', 'Trendtage sind seltener als Balance-Tage. Prüfe, wie viele Verluste an Nicht-Trendtagen entstehen.']]) + hbBtns('vwap') }
  ] },

  { id: 'backtesten', titel: 'Sauber backtesten', kurz: 'Stichprobe, Look-ahead, Rosinenpicken, Kosten, Intrabar-Annahme, Overfitting und Kennzahlen.', abschnitte: [
    { id: 'stichprobe', titel: 'Stichprobengröße und Zufall', html:
      '<p>Wenige Trades sagen wenig. Die Unsicherheit der Trefferquote lässt sich abschätzen:</p>' +
      '<div class="hb-f">Standardfehler = √( p × (1 − p) ÷ n )</div>' +
      '<p>Bei 50 % Treffern und 30 Trades ist der Standardfehler etwa 9 Prozentpunkte – das 95-%-Intervall reicht ungefähr von 32 % bis 68 %. Bei 100 Trades schrumpft es auf etwa 40–60 %.</p>' +
      hbBox('faust', '<p>Ab etwa 30 Trades je Setup gibt es eine erste Tendenz, ab 100 eine belastbarere Aussage. Je seltener die großen Gewinner, desto mehr Trades brauchst du.</p>') },
    { id: 'lookahead', titel: 'Look-ahead und Rückschaufehler', html:
      '<p><b>Look-ahead:</b> Informationen nutzen, die zum Zeitpunkt der Entscheidung noch nicht existierten – etwa das Tageshoch, ein fertiges Tagesprofil oder eine Kerze, die noch läuft. <b>Rückschaufehler</b> (Hindsight): Im fertigen Chart sieht jedes Setup offensichtlich aus.</p>' +
      hbBox('praxis', '<p>Im Replay ist alles rechts vom Cursor unsichtbar; laufende Kerzen höherer Timeframes werden nur bis zum Cursor gebildet, Indikatoren rechnen nur mit Vergangenheit. Die Nachlauf-Prüfung der Analyse läuft erst nach dem Ende einer Session.</p>') },
    { id: 'rosinen', titel: 'Rosinenpicken und Blind-Modus', html:
      '<p>Wer sich die Tage aussucht, testet seine Erinnerung, nicht seine Strategie. Typisch: nur bekannte Trendtage oder „interessante“ Tage durchspielen.</p>' +
      '<p>Gegenmittel: zufällige Tage und der <b>Blind-Modus</b>, der Datum und Wochentag bis zum Ende der Session verbirgt. So handelst du ohne Wissen über Nachrichten oder den weiteren Verlauf.</p>' },
    { id: 'kosten', titel: 'Kosten realistisch ansetzen', html:
      '<p>Gebühren (Börse, Broker, Plattform) und Slippage entscheiden bei kurzfristigen Strategien oft über Gewinn oder Verlust. Rechne mit beiden – lieber etwas zu hoch.</p>' +
      '<ul><li>Market- und Stop-Orders werden mit Slippage gefüllt, Limit-Orders zum Limitpreis (dafür nicht immer).</li><li>Bei engen Stops und kleinen Zielen machen Kosten einen großen Teil von 1R aus.</li></ul>' +
      hbBox('praxis', '<p>Unter Einstellungen → Kosten legst du Slippage in Ticks und Gebühren je Seite fest. Alle R-Werte in Edge Lab sind netto, also nach Kosten.</p>') },
    { id: 'intrabar', titel: 'Intrabar-Annahme', html:
      '<p>Berührt eine Kerze sowohl Stop als auch Ziel, weiß niemand, was zuerst kam. Wer immer das Ziel annimmt, überschätzt seine Strategie.</p>' +
      hbBox('praxis', '<p>Standard ist „Konservativ: SL zuerst“. Mit 1-Minuten-Basisdaten kommt der Fall selten vor; bei größeren Basis-Timeframes häufiger.</p>') },
    { id: 'overfitting', titel: 'Overfitting und Out-of-Sample', html:
      '<p><b>Overfitting:</b> Regeln so lange anpassen, bis sie die Vergangenheit perfekt erklären – und dann live versagen. Warnzeichen sind viele Parameter, sehr spezifische Filter („nur dienstags zwischen 10:05 und 10:20“) und große Unterschiede zwischen ähnlichen Einstellungen.</p>' +
      '<p><b>Out-of-Sample:</b> Daten trennen. Beispiel: Regeln an 2021–2023 entwickeln, unverändert an 2024 prüfen. Erst wenn beide Teile ähnlich aussehen, ist das Ergebnis glaubwürdiger.</p>' },
    { id: 'kennzahlen', titel: 'Kennzahlen lesen', html:
      '<ul><li><b>Profit-Faktor:</b> Summe der Gewinne ÷ Summe der Verluste. Über 1 verdient die Strategie (netto), Werte deutlich über 1 sind robuster.</li>' +
      '<li><b>Erwartung:</b> Ø Ergebnis je Trade, in $ und in R – siehe ' + hbL('erwartungswert', 'Erwartungswert') + '.</li>' +
      '<li><b>Max. Drawdown:</b> größter Rückgang vom Hoch der Kontokurve.</li>' +
      '<li><b>Monte Carlo:</b> Trades zufällig neu ziehen, um zu sehen, wie verschieden derselbe Edge verlaufen kann – inklusive Drawdown und Prop-Ergebnis.</li></ul>' },
    { id: 'journal-routine', titel: 'Journal-Routine', html:
      '<ol><li>Vor der Session: Strategie wählen, Regeln lesen, Risiko festlegen.</li><li>Während: nur Trades mit abgehakten Regeln; Grund kurz notieren.</li><li>Nach der Session: Disziplin bewerten, Fehler markieren, ein Learning aufschreiben.</li><li>Wöchentlich: Analyse und Statistik ansehen, eine Sache gezielt verbessern.</li></ol>' }
  ] },

  { id: 'psychologie', titel: 'Psychologie & Fehler', kurz: 'Die Fehler aus der Analyse – woran du sie erkennst und was dagegen hilft.', abschnitte: [
    { id: 'sl-verschieben', titel: 'Stop verschieben', html:
      '<p><b>Was passiert:</b> Der Kurs nähert sich dem Stop, und du ziehst ihn weiter weg, „damit der Trade noch Luft hat“. Aus geplanten −1R werden −2R oder mehr. Manchmal dreht der Trade danach – das verstärkt die Gewohnheit, obwohl das Risiko jedes Mal größer war als geplant.</p>' +
      '<p><b>Gegenmaßnahmen:</b> Stop vor dem Einstieg an die Struktur legen (' + hbL('stopp-setzen', 'Stops setzen') + '), danach nur Richtung Gewinn bewegen. Brauchst du mehr Platz, war die Position zu groß – nächstes Mal kleiner handeln.</p>' },
    { id: 'zu-frueh-raus', titel: 'Zu früh aussteigen', html:
      '<p><b>Was passiert:</b> Ein Trade läuft ins Plus, die Angst, den Gewinn wieder zu verlieren, wird größer als der Plan. Du schließt bei +0,5R, obwohl das Ziel bei +2R lag. Bei einer Strategie, die auf wenigen großen Gewinnern beruht, zerstört das die Erwartung.</p>' +
      '<p><b>Gegenmaßnahmen:</b> Manuelle Ausstiege nur bei vorher festgelegten Gründen. Wer Gewinne sichern will, nutzt Teilausstieg oder Stop auf Einstand – geplant, nicht spontan.</p>' },
    { id: 'revenge', titel: 'Revenge-Trading', html:
      '<p><b>Was passiert:</b> Nach einem Verlust folgt sofort der nächste Trade, oft größer und ohne Setup – das Geld soll „zurück“. Revenge-Trades sind eine der häufigsten Ursachen für verletzte Tageslimits.</p>' +
      '<p><b>Gegenmaßnahmen:</b> Feste Pause nach jedem Verlust (z. B. 10 Minuten), Risiko nach Verlusten nie erhöhen, nach zwei Verlusten in Folge die Session beenden.</p>' },
    { id: 'overtrading', titel: 'Overtrading', html:
      '<p><b>Was passiert:</b> Mehr Trades als die Strategie hergibt – aus Langeweile, um Verluste aufzuholen oder weil gerade „etwas los ist“. Typisch: Die ersten Trades einer Session sind ordentlich, die späteren deutlich schlechter.</p>' +
      '<p><b>Gegenmaßnahmen:</b> Höchstzahl an Trades je Session festlegen und danach beenden. A-Setups aufschreiben und nur diese handeln.</p>' },
    { id: 'fomo', titel: 'FOMO – Angst, etwas zu verpassen', html:
      '<p><b>Was passiert:</b> Der Kurs läuft ohne dich los, du springst spät hinterher – weit weg vom Level, mit großem Stop oder schlechtem Chance-Risiko-Verhältnis.</p>' +
      '<p><b>Gegenmaßnahmen:</b> Verpasste Trades notieren statt nachlaufen. Einstiege nur an vorher markierten Levels oder mit Limit-Order auf den Rücksetzer.</p>' },
    { id: 'groesse', titel: 'Positionsgröße', html:
      '<p><b>Was passiert:</b> Die Größe schwankt mit dem Gefühl: nach Gewinnen größer, nach Verlusten aus Trotz ebenfalls größer. Ein einzelner zu großer Verlust kann dann die Arbeit von Wochen kosten – oder ein Prop-Konto.</p>' +
      '<p><b>Gegenmaßnahmen:</b> Festes Risiko je Trade (in $ oder % vom Konto), Größe immer aus Risiko und Stop rechnen (' + hbL('positionsgroesse', 'Formel') + '). Größe nur nach einer vorher festgelegten Regel erhöhen, etwa nach 100 Trades mit positiver Erwartung.</p>' },
    { id: 'verlierer-halten', titel: 'Verlierer halten, Gewinner abschneiden', html:
      '<p><b>Was passiert:</b> Verluste realisieren tut weh, also bleiben Verlierer offen, „bis sie zurückkommen“. Gewinner werden dagegen schnell geschlossen. Das Ergebnis: viele kleine Gewinne, wenige große Verluste.</p>' +
      '<p><b>Gegenmaßnahmen:</b> Zeit-Stop festlegen (läuft der Trade nach X Kerzen nicht, raus), Stop nie entfernen, Ziele planen.</p>' },
    { id: 'checkliste', titel: 'Ohne Plan handeln', html:
      '<p><b>Was passiert:</b> Trades ohne zugeordnete Strategie oder mit nicht erfüllten Regeln. Sie lassen sich weder auswerten noch verbessern.</p>' +
      '<p><b>Gegenmaßnahmen:</b> Jede Strategie als Checkliste aufschreiben. Erst wenn alle Punkte erfüllt sind, wird gehandelt. Kein passendes Setup bedeutet: kein Trade.</p>' },
    { id: 'gegenmassnahmen', titel: 'Konkrete Gegenmaßnahmen im Überblick', html:
      '<ul><li><b>Regeln schriftlich:</b> Strategie mit Checkliste, Risiko je Trade, Höchstzahl Trades.</li>' +
      '<li><b>Tageslimit:</b> fester Maximalverlust je Session – erreicht, Session beenden.</li>' +
      '<li><b>Pause nach zwei Verlusten</b> in Folge, mindestens bis zur nächsten Stunde oder bis zum nächsten Tag.</li>' +
      '<li><b>Vorher entscheiden:</b> Stop, Ziel und Ausstiegsgründe stehen vor dem Einstieg fest.</li>' +
      '<li><b>Wöchentliche Auswertung:</b> den teuersten Befund der Analyse auswählen und genau den eine Woche lang gezielt angehen.</li></ul>' }
  ] },

  { id: 'glossar', titel: 'Glossar', kurz: 'Begriffe von A bis Z, kurz erklärt und verlinkt.', abschnitte: [] }
];

const HB_GLOSSAR = [
  ['80-%-Regel', 'Faustregel aus dem Market Profile: Rückkehr in die Vortages-Value-Area führt häufig zur anderen Kante.', 'vortag'],
  ['Absorption', 'Viel aggressives Volumen, aber kein Fortschritt im Preis – passive Orders nehmen es auf.', 'absorption'],
  ['Aggressor', 'Die Seite, die mit einer Market-Order sofort handelt: Käufer am Ask, Verkäufer am Bid.', 'bid-ask'],
  ['Anchored VWAP', 'VWAP ab einem selbst gewählten Startpunkt statt ab Session-Beginn.', 'anchored-vwap'],
  ['Ask', 'Niedrigstes Verkaufsangebot im Orderbuch.', 'bid-ask'],
  ['ATR', 'Average True Range: durchschnittliche Kerzenspanne inklusive Lücken, Maß für das Rauschen.', 'stopp-setzen'],
  ['Bid', 'Höchstes Kaufgebot im Orderbuch.', 'bid-ask'],
  ['Blind-Modus', 'Datum und Wochentag bleiben bis zum Session-Ende verborgen.', 'rosinen'],
  ['Break-even-Trefferquote', 'Trefferquote, bei der eine Strategie bei gegebenem Chance-Risiko-Verhältnis ohne Kosten genau null verdient.', 'erwartungswert'],
  ['CME Globex', 'Elektronische Handelsplattform der CME Group, auf der NQ, ES und GC gehandelt werden.', 'handelszeiten'],
  ['CVD', 'Cumulative Volume Delta: fortlaufend summiertes Delta.', 'delta-cvd'],
  ['Delta', 'Kauf-Aggressor-Volumen minus Verkauf-Aggressor-Volumen.', 'delta-cvd'],
  ['Delta-Divergenz', 'Preis macht ein neues Extrem, Delta/CVD nicht.', 'delta-divergenz'],
  ['DOM / Orderbuch', 'Liste der wartenden Limit-Orders je Preis.', 'orderflow-grenzen'],
  ['Drawdown', 'Rückgang vom Hoch der Kontokurve bis zum folgenden Tief.', 'drawdown'],
  ['EMA', 'Exponentieller gleitender Durchschnitt, gewichtet jüngere Kurse stärker.', 'setup-pullback'],
  ['Erwartungswert', 'Durchschnittliches Ergebnis je Trade aus Trefferquote, Ø Gewinn und Ø Verlust.', 'erwartungswert'],
  ['Exhaustion', 'Erschöpfung: Bewegung endet, weil die Aggressoren fehlen.', 'absorption'],
  ['FOMO', 'Angst, etwas zu verpassen – führt zu späten Einstiegen.', 'fomo'],
  ['Footprint', 'Volumen je Preisstufe einer Kerze, getrennt nach Bid und Ask.', 'footprint'],
  ['HVN', 'High Volume Node: Preisbereich mit viel Volumen im Profil.', 'hvn-lvn'],
  ['Imbalance', 'Deutliches Übergewicht einer Seite im diagonalen Footprint-Vergleich.', 'footprint'],
  ['Initial Balance', 'Spanne der ersten Handelsstunde (US-Index-Futures: 9:30–10:30 ET).', 'initial-balance'],
  ['Intrabar-Annahme', 'Regel, ob Stop oder Ziel zuerst gilt, wenn beide in einer Kerze liegen.', 'intrabar'],
  ['Konsistenzregel', 'Prop-Regel, die den Anteil einzelner Tage am Gesamtgewinn begrenzt.', 'tagesverlust'],
  ['Limit-Order', 'Order zu einem festen Preis oder besser; handelt passiv.', 'bid-ask'],
  ['LVN', 'Low Volume Node: Preisbereich mit wenig Volumen, oft schnell durchlaufen.', 'hvn-lvn'],
  ['MAE / MFE', 'Größte Bewegung gegen bzw. für den Trade während seiner Laufzeit.', 'ziele'],
  ['Market-Order', 'Order zum nächsten verfügbaren Preis; handelt aggressiv.', 'bid-ask'],
  ['Monte Carlo', 'Simulation durch zufälliges Neuziehen der eigenen Trades.', 'kennzahlen'],
  ['Opening Range', 'Spanne der ersten Minuten nach 9:30 ET.', 'overnight-opening-range'],
  ['Out-of-Sample', 'Prüfung an Daten, die bei der Entwicklung nicht benutzt wurden.', 'overfitting'],
  ['Overfitting', 'Regeln zu genau an vergangene Daten angepasst.', 'overfitting'],
  ['Overnight-Hoch/-Tief', 'Extremwerte zwischen 18:00 ET und 9:30 ET.', 'overnight-opening-range'],
  ['POC', 'Point of Control: Preisstufe mit dem meisten Volumen.', 'volume-profile'],
  ['Profit-Faktor', 'Summe der Gewinne geteilt durch Summe der Verluste.', 'kennzahlen'],
  ['Prop-Firm', 'Firma, die Handelskapital unter festen Regeln bereitstellt.', 'prop-ablauf'],
  ['Punktwert', 'Dollar-Betrag je ganzem Indexpunkt eines Kontrakts (NQ 20 $, ES 50 $).', 'positionsgroesse'],
  ['R-Multiple', 'Ergebnis geteilt durch das anfängliche Risiko.', 'r-multiple'],
  ['RTH / ETH', 'Reguläre Handelszeit (9:30–16:00 ET) bzw. erweiterte Zeit außerhalb.', 'handelszeiten'],
  ['Slippage', 'Differenz zwischen erwartetem und tatsächlichem Füllpreis.', 'kosten'],
  ['Stacked Imbalances', 'Mehrere Imbalances derselben Seite direkt übereinander.', 'footprint'],
  ['Stop-Order', 'Order, die erst bei Erreichen eines Preises zur Market-Order wird.', 'kosten'],
  ['Tagesverlust-Limit', 'Maximaler Verlust je Handelstag bei Prop-Konten.', 'tagesverlust'],
  ['Tick / Tickwert', 'Kleinste Preisänderung und ihr Dollarwert (NQ 0,25 = 5 $).', 'positionsgroesse'],
  ['Trailing-Drawdown', 'Verlustgrenze, die mit dem höchsten Kontostand nachzieht.', 'trailing-drawdown'],
  ['Trefferquote', 'Anteil der Gewinner an allen Trades.', 'erwartungswert'],
  ['Value Area', 'Bereich mit 70 % des Volumens; Kanten VAH und VAL.', 'volume-profile'],
  ['Volume Profile', 'Volumen je Preisstufe über einen Zeitraum.', 'volume-profile'],
  ['VWAP', 'Volumengewichteter Durchschnittspreis seit Session-Beginn.', 'vwap-was']
];
HB[HB.length - 1].abschnitte = [{ id: 'glossar-az', titel: 'Begriffe A–Z', html:
  '<dl class="hb-gloss">' + HB_GLOSSAR.map(([t, d, s]) => '<dt>' + t + '</dt><dd>' + d + ' ' + hbL(s, 'Mehr') + '</dd>').join('') + '</dl>' }];

/* ---------- Lese-Ansicht ---------- */
const Handbook = {
  cur: null, q: '', terms: [], idx: null,
  /* Abschnitt- oder Kapitel-ID → Kapitel */
  find(id) {
    for (const ch of HB) { if (ch.id === id) return { ch, sec: null }; const s = ch.abschnitte.find((x) => x.id === id); if (s) return { ch, sec: s }; }
    return null;
  },
  read() { const r = store.get('elr.hb.read', {}); return r && typeof r === 'object' ? r : {}; },
  setRead(id, on) { const r = this.read(); if (on) r[id] = 1; else delete r[id]; store.set('elr.hb.read', r); },
  index() {
    if (this.idx) return this.idx;
    const strip = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    this.idx = [];
    for (const ch of HB) for (const s of ch.abschnitte) this.idx.push({ ch, s, title: s.titel, text: strip(s.html), hay: (ch.titel + ' ' + s.titel + ' ' + strip(s.html)).toLowerCase() });
    return this.idx;
  },
  /* target: Kapitel- oder Abschnitt-ID (aus #handbuch-<id>) */
  open(target) {
    let hit = target ? this.find(target) : null;
    if (target && !hit) App.toast('Abschnitt „' + target + '“ gibt es im Handbuch nicht. Das Inhaltsverzeichnis hilft weiter.', 'warn');
    if (!hit) hit = this.find(this.cur || store.get('elr.hb.last', 'einleitung')) || { ch: HB[0], sec: null };
    const ch = hit.ch;
    if (this.cur !== ch.id || !$('#hbRead').firstChild) this.renderChapter(ch);
    else if (this.terms.length) this.mark();
    this.cur = ch.id; store.set('elr.hb.last', ch.id);
    this.renderToc(hit.sec ? hit.sec.id : null);
    this.renderProgress();
    $('#hbToc').classList.remove('open'); $('#hbTocBtn').setAttribute('aria-expanded', 'false');
    const go = () => {
      const el = hit.sec ? $('#hb-s-' + hit.sec.id) : null;
      const firstMark = !hit.sec && this.terms.length ? $('#hbRead mark') : null;
      if (el) el.scrollIntoView({ block: 'start' });
      else if (firstMark) firstMark.scrollIntoView({ block: 'center' });
      else { $('#view-handbuch').scrollTop = 0; window.scrollTo(0, 0); }
      if (el) { el.classList.add('hb-flash'); setTimeout(() => el.classList.remove('hb-flash'), 1400); }
    };
    requestAnimationFrame(() => setTimeout(go, 0));
  },
  renderChapter(ch) {
    const i = HB.indexOf(ch), prev = HB[i - 1], next = HB[i + 1];
    const read = !!this.read()[ch.id];
    const kick = i === 0 ? 'Einleitung' : 'Kapitel ' + i + ' von ' + (HB.length - 1);
    let h = '<header class="hb-ch-h"><span class="hb-kick">' + kick + '</span><h2 id="hbTitle">' + ch.titel + '</h2><p class="hb-lead">' + ch.kurz + '</p>' + (ch.show ? hbBtns(ch.show) : '') +
      (ch.abschnitte.length > 2 ? '<ol class="hb-onpage">' + ch.abschnitte.map((s) => '<li><a href="#handbuch-' + s.id + '">' + s.titel + '</a></li>').join('') + '</ol>' : '') + '</header>';
    h += ch.abschnitte.map((s) => '<section class="hb-sec" id="hb-s-' + s.id + '" aria-labelledby="hb-h-' + s.id + '"><h3 id="hb-h-' + s.id + '">' + s.titel + '<a class="hb-anchor" href="#handbuch-' + s.id + '" aria-label="Link zu „' + s.titel + '“" title="Link zu diesem Abschnitt">#</a></h3>' + s.html + '</section>').join('');
    h += '<footer class="hb-ch-f"><button type="button" class="btn' + (read ? ' is-read' : '') + '" data-hb-read aria-pressed="' + read + '">' + (read ? 'Gelesen' : 'Als gelesen markieren') + '</button>' +
      '<div class="hb-pn">' + (prev ? '<a class="hb-prev" href="#handbuch-' + prev.id + '"><small>Zurück</small>' + prev.titel + '</a>' : '<span></span>') +
      (next ? '<a class="hb-next" href="#handbuch-' + next.id + '"><small>Weiter</small>' + next.titel + '</a>' : '') + '</div></footer>';
    $('#hbRead').innerHTML = h;
    this.mark();
  },
  renderToc(secId) {
    const r = this.read();
    $('#hbToc').innerHTML = '<ol>' + HB.map((ch, i) => {
      const on = ch.id === this.cur;
      return '<li class="' + (on ? 'on' : '') + '"><a href="#handbuch-' + ch.id + '"' + (on ? ' aria-current="true"' : '') + '><span class="hb-no">' + (i || '·') + '</span><span class="hb-tt">' + ch.titel + '</span>' + (r[ch.id] ? '<span class="hb-ok" aria-label="gelesen" title="gelesen"></span>' : '') + '</a>' +
        (on && ch.abschnitte.length > 1 ? '<ol>' + ch.abschnitte.map((s) => '<li><a href="#handbuch-' + s.id + '"' + (s.id === secId ? ' aria-current="true"' : '') + '>' + s.titel + '</a></li>').join('') + '</ol>' : '') + '</li>';
    }).join('') + '</ol>';
    const c = HB.find((x) => x.id === this.cur);
    $('#hbTocBtn').innerHTML = '<span>Inhalt</span><b>' + (c ? c.titel : '') + '</b>';
  },
  renderProgress() {
    const r = this.read(), n = HB.filter((c) => r[c.id]).length;
    $('#hbProgBar').style.width = (n / HB.length * 100).toFixed(1) + '%';
    $('#hbProgTxt').textContent = n + ' von ' + HB.length + ' Kapiteln gelesen';
    $('#hbProg').setAttribute('aria-valuenow', String(n));
  },
  search(q) {
    this.q = q.trim();
    this.terms = this.q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2).slice(0, 5);
    const box = $('#hbResults');
    $('#hbQx').hidden = !this.q;
    if (!this.terms.length) { box.hidden = true; $('#hbToc').hidden = false; this.mark(); return; }
    const res = this.index().filter((e) => this.terms.every((t) => e.hay.indexOf(t) >= 0))
      .map((e) => ({ e, score: this.terms.reduce((s, t) => s + (e.title.toLowerCase().indexOf(t) >= 0 ? 10 : 0) + (e.hay.split(t).length - 1), 0) }))
      .sort((a, b) => b.score - a.score).slice(0, 30);
    const re = new RegExp('(' + this.terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    const snip = (txt) => {
      const low = txt.toLowerCase(); let p = -1;
      for (const t of this.terms) { const k = low.indexOf(t); if (k >= 0 && (p < 0 || k < p)) p = k; }
      const a = Math.max(0, p - 50), s = (a ? '… ' : '') + txt.slice(a, p + 90) + (p + 90 < txt.length ? ' …' : '');
      return esc(s).replace(re, '<mark>$1</mark>');
    };
    box.hidden = false; $('#hbToc').hidden = true;
    box.innerHTML = '<p class="hb-rc" role="status">' + (res.length ? res.length + (res.length === 1 ? ' Treffer' : ' Treffer') : 'Keine Treffer für „' + esc(this.q) + '“') + '</p>' +
      res.map(({ e }) => '<a class="hb-res" href="#handbuch-' + e.s.id + '"><small>' + esc(e.ch.titel) + '</small><b>' + esc(e.s.titel).replace(re, '<mark>$1</mark>') + '</b><span>' + snip(e.text) + '</span></a>').join('');
    this.mark();
  },
  /* Suchbegriffe im Lesetext markieren (ohne Schaubilder und Knöpfe) */
  mark() {
    const root = $('#hbRead');
    for (const m of $$('mark.hb-mark', root)) { const t = document.createTextNode(m.textContent); m.replaceWith(t); }
    root.normalize();
    if (!this.terms.length) return;
    const re = new RegExp(this.terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('svg, button, .hb-anchor') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) {
      const s = n.nodeValue; re.lastIndex = 0; if (!re.test(s)) continue;
      re.lastIndex = 0; const frag = document.createDocumentFragment(); let last = 0, m;
      while ((m = re.exec(s))) { frag.appendChild(document.createTextNode(s.slice(last, m.index))); const mk = document.createElement('mark'); mk.className = 'hb-mark'; mk.textContent = m[0]; frag.appendChild(mk); last = m.index + m[0].length; }
      frag.appendChild(document.createTextNode(s.slice(last)));
      n.replaceWith(frag);
    }
  },
  showInChart(key) {
    const s = HB_SHOW[key]; if (!s) return;
    Object.assign(App.settings.ind, s.ind); App.saveSettings(); App.updateHeader();
    location.hash = '#charts';
    App.toast(s.label + ' im Chart eingeschaltet.', 'good');
  },
  bind() {
    const v = $('#view-handbuch');
    let t = 0;
    $('#hbQ').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => this.search(e.target.value), 120); });
    $('#hbQ').addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target.value) { e.stopPropagation(); e.target.value = ''; this.search(''); } if (e.key === 'Enter') { const a = $('#hbResults a'); if (a) a.click(); } });
    $('#hbQx').addEventListener('click', () => { $('#hbQ').value = ''; this.search(''); $('#hbQ').focus(); });
    $('#hbTocBtn').addEventListener('click', () => { const o = $('#hbToc').classList.toggle('open'); $('#hbTocBtn').setAttribute('aria-expanded', String(o)); });
    v.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.hbShow) this.showInChart(b.dataset.hbShow);
      else if (b.hasAttribute('data-hb-practice')) { if (typeof NewSess !== 'undefined') NewSess.open(); }
      else if (b.hasAttribute('data-hb-read')) {
        const on = b.getAttribute('aria-pressed') !== 'true';
        this.setRead(this.cur, on);
        b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-read', on); b.textContent = on ? 'Gelesen' : 'Als gelesen markieren';
        this.renderToc(null); this.renderProgress();
        if (on) App.toast('Kapitel als gelesen markiert.', 'good');
      }
    });
  }
};
