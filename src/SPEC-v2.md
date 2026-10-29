# Edge Lab Replay – Bauplan Version 2

Projekt: /home/claude/bt2 (Quellen: core.js, chart.js, app.js, notes.js, data.js, ui.js, template.html; `python3 build.py` baut site/index.html und dist/edge-lab-replay.html). Tests: `node test-core.js`, `python3 test-ui.py`, `python3 test-live.py` (Playwright headless, Binance gemockt). Alle Tests müssen am Ende grün sein; passe sie an neue Strukturen an und ergänze Tests für neue Logik. Alle Texte in der App auf Deutsch. Design-Richtung beibehalten (dunkles Trading-Desk, Messing-Akzent `--accent`, IBM Plex Sans + JetBrains Mono, feine Linien) – aber die Kritikpunkte unten umsetzen. Keine Emojis in der Oberfläche. Kein generischer KI-Look.

Wichtig: Nichts von der Trading-Logik kaputt machen. Kein Lookahead im Replay. Nach jeder größeren Änderung bauen und testen.

## 1. Neue Struktur: eigene Bereiche („Seiten“) in einer App

Wunsch des Nutzers: Knöpfe, mit denen man in eigene Bereiche wechselt – alles auf einer Seite (Single-Page), aber jeder Bereich füllt den Bildschirm.

- Hauptnavigation mit 6 Knöpfen: **Charts** · **Journal** · **Backtests** · **Statistik** · **Strategien** · **TradingView**
  - Desktop: in der Kopfzeile links neben/statt der jetzigen Indikator-Leiste (Indikator-Leiste gehört nur zum Bereich Charts, also als Werkzeugleiste im Charts-Bereich).
  - Handy (≤ 860 px): feste Leiste unten wie bei einer nativen App (Icons + kurze Beschriftung, min. 48 px hoch, safe-area beachten).
- Routing über `location.hash` (#charts, #journal, #backtests, #stats, #strategien, #tradingview). Zurück-Taste des Browsers funktioniert. Startbereich: #charts.
- **Charts**: wie bisher Charts + Werkzeuge + Replay-Leiste + rechte Seitenleiste, die Seitenleiste enthält jetzt NUR noch Handel (Konto-Zeile, Prop-Status kompakt, Order-Ticket, Positionen). Positionen & Orders OBEN über dem Ticket (Kritikpunkt 6), Vorschau kompakt.
- **Journal**: ganzseitige Liste aller Trades (Tabelle auf Desktop: Datum, Markt, Richtung, Strategie, Einstieg, Ausstieg, R, $, Grund, Foto-Vorschau; Karten auf dem Handy). Filter (Markt, Strategie, Ergebnis Gewinn/Verlust, Session). Klick auf einen Trade öffnet ein Detail-Panel/Dialog: alle Werte, Notiz, Strategie, **Fotos** (siehe 2), „Im Chart zeigen“ (wechselt nach #charts), Löschen. Export CSV, Sicherung kopieren/als Datei, Import.
- **Backtests**: die Backtest-Sessions (jetzige Notizen) als ganzseitige Übersicht mit Karten; oben großer Knopf **„Neue Backtest-Session“** (siehe 3). Klick auf Karte → Session-Dialog (wie jetzt) + Fotos + Liste der Trades dieser Session.
- **Statistik**: ganzseitig, mehr Platz: KPIs, Kontokurve, plus neue Auswertungen (siehe 5).
- **Strategien**: ganzseitige Verwaltung (Name, Regeln als Checkliste, Beschreibung, Bild-Beispiele optional) mit Kennzahlen je Strategie (Trades, Trefferquote, Ø R, Netto, Sessions). Ersetzt den Strategien-Dialog.
- **TradingView**: offizielles kostenloses TradingView-Widget „Advanced Real-Time Chart“ einbetten (Script `https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js`, Container `tradingview-widget-container`). Symbol-Auswahl über Knöpfe (CME_MINI:NQ1!, CME_MINI:ES1!, COMEX:GC1!, BINANCE:BTCUSDT, XETR:DAX) + freies Feld; Intervall; dark theme; locale "de_DE"; autosize. Widget erst beim Öffnen des Bereichs laden. Hinweistext: Ansicht/Analyse, Handeln/Backtest im Bereich Charts. In der Claude-Vorschau blockiert die Sicherheitsregel das Script – dann freundlicher Hinweis mit Link zu tradingview.com.

## 2. Fotos zu Trades und Backtests

- Speicherung in **IndexedDB** (Datenbank `edge-lab-replay`, Store `bilder`, Schlüssel id, Wert {id, owner (Trade-ID oder Session-ID), kind ('auto-entry'|'auto-exit'|'upload'), t, blob, w, h}). Wrapper mit Promise und try/catch; wenn IndexedDB nicht geht, Hinweis und Funktion aus.
- **Automatisch**: beim Einstieg (Füllung) und beim Ausstieg eines Trades Screenshot des aktiven Charts (bzw. des Charts mit dem kleinsten TF ≥ 5m, falls vorhanden – einfach: aktiver Chart) als JPEG ~0.7, max 1400 px breit, vor dem Speichern einmal neu rendern (requestAnimationFrame abwarten). Einstellbar: Einstellungen → „Automatische Chart-Fotos“ an/aus (Standard an).
- **Manuell**: Im Trade-Detail und Session-Dialog „Foto hinzufügen“ (input type=file accept=image/*, mehrere), Einfügen per Strg+V (paste-Event mit Bilddaten) und Drag & Drop. Bilder vor dem Speichern verkleinern (max 1600 px, JPEG 0.82).
- Anzeige: Thumbnails (Objekt-URLs, beim Schließen freigeben), Klick → Vollbild-Ansicht (Lightbox) mit Pfeilen, Löschen-Knopf.
- Im Journal-Listeneintrag kleines Vorschaubild des Einstiegsfotos.
- Löschen eines Trades/einer Session löscht dessen Bilder mit.
- Sicherung: „Sicherung als Datei“ exportiert JSON inkl. Bilder (base64) – wenn zu groß ok; Import stellt Bilder wieder her.

## 3. „Neue Backtest-Session“ mit zufälligem historischem Datum

Dialog mit:
- **Markt**: Gruppe „Archiv (Indizes & Gold, 1-Minute)“: NAS100 (Nasdaq 100, wie NQ), US500 (wie ES), US30 (wie YM), XAUUSD (wie GC), GER40 (DAX) – aus `data/index.json` (siehe 4); Gruppe „Krypto (Binance, mit echtem Orderflow)“: BTCUSDT, ETHUSDT, SOLUSDT + freies Feld, Spot/Futures; Gruppe „Aktuell geladene Daten“ (CSV/Demo).
- **Zeitraum**: „Zufälliger Tag zwischen [Jahr von] und [Jahr bis]“ (Standard 2021–2024) oder „Bestimmtes Datum“ (date input).
- **Startzeit**: Zufällig / New-York-Eröffnung (9:30 ET, 15 Minuten vorher starten) / London-Eröffnung (8:00 London) / Asien.
- Optionen: **„Datum verstecken (Blind-Modus)“** (Standard an), **Strategie** (Auswahl), Vorlauf für Indikatoren: 3 Handelstage vor dem Starttag, 2 Tage danach (Krypto: Kalendertage).
- Ablauf: zufälligen Handelstag (Mo–Fr für Archiv-Märkte; Krypto jeder Tag) aus verfügbaren Monaten wählen → Daten laden (Fortschritt anzeigen, Abbrechen möglich) → Datensatz laden → Replay an der gewählten Startzeit starten → Backtest-Session-Eintrag sofort anlegen (Strategie, Markt, echtes Datum, replayId) → beim Beenden öffnet sich der Session-Dialog zum Ausfüllen (wie bisher).
- **Blind-Modus**: Datum ausblenden überall (Zeitachse zeigt nur Uhrzeit und „Tag 1/2/3“ statt Wochentag+Datum, Replay-Zeit nur Uhrzeit + „Tag n“, Toasts, Journal-Zeit während die Session läuft, Datensatz-Untertitel ohne Datum, Vorspul-Feld nur Uhrzeit). Preise NICHT verschieben (zu verwirrend), aber Wochentag bleibt sichtbar? → Nein: Wochentag auch verstecken. Nach Ende der Session wird das echte Datum im Session-Dialog angezeigt („Das war der Di, 14.03.2023“).
- Gleiches Verfahren auch als „Zufälliger Start“ für bereits geladene Daten (bleibt erhalten).

## 4. Daten-Archiv (bereits gebaut, nur anbinden)

Auf der GitHub-Seite liegen (wenn die GitHub Action gelaufen ist) Dateien:
- `data/index.json`: `{ updated, refreshed, source, format, instruments: [ { id, name, hint, tick, pv, qtyStep, sess:{tz,hour}, months:["2020-01", …] } ] }`
- `data/<ID>/<JJJJ-MM>.csv.gz` mit Kopfzeile `t,o,h,l,c,v`, t = Unix-Sekunden UTC (Kerzenstart), Preise bereits auf tick gerundet, Bid-Kurse von Dukascopy. Kein Taker-Volumen → Delta geschätzt.

Laden in data.js (`Archive`):
- Basis-URL: zuerst relativ `data/` (gleiche Herkunft auf GitHub Pages), Fallback `https://raw.githubusercontent.com/qvw8mrjzby-arch/edge-lab-replay/main/data/` (CORS erlaubt). Erfolgreiche Basis merken.
- `.gz` per fetch als ArrayBuffer; wenn die ersten Bytes 0x1f 0x8b sind → `DecompressionStream('gzip')`, sonst direkt als Text (falls der Server schon entpackt hat).
- Benötigte Monate für [Starttag − Vorlauf, Starttag + Nachlauf] laden (meist 1–2 Dateien), Zeilen filtern, `App.loadDataset({bars, baseTf:60, tick, pv, qtyStep, sess, symbol: id, source: 'Archiv · ' + name, instKey: 'ARCHIV'})` – Kosten-Profil „futures“.
- Wenn index.json fehlt: Hinweis „Archiv wird noch aufgebaut – das passiert automatisch auf GitHub, in ein paar Stunden sind die Daten da. Bis dahin Krypto oder Demo nutzen.“
- Im Daten-Dialog neuer Reiter „Archiv“ zum direkten Laden eines Zeitraums (Markt, von–bis, max. 31 Tage).
- Krypto mit Datum in der Vergangenheit: Binance-Loader mit `endTime` des Zeitraums verwenden (existiert schon über bnEnd). Binance-Daten gibt es ab 2017-08 (Spot BTCUSDT) bzw. 2019-09 (Futures) – Jahresauswahl entsprechend begrenzen.
- TradingView-CSV-Export (Spalten `time,open,high,low,close,Volume` + weitere Indikator-Spalten, time als Unix-Sekunden oder ISO) muss im CSV-Import funktionieren → testen.

## 5. Funde aus dem Review umsetzen

### Kritik (Design/Bedienung) – alle umsetzen
1. Handy: ein Chart standardmäßig (Layout 1 erzwingen bei ≤ 860 px), Chart-Höhe ~ 55dvh, feste Aktionsleiste unten im Bereich Charts (Abspielen/Pause, Schritt, Kaufen, Verkaufen + offenes P&L), Hauptnavigation darunter. Seite muss scrollbar bleiben: Charts nicht über die ganze Fläche `touch-action:none` – Lösung: Chart-Canvas behält touch-action:none, aber es gibt genug Fläche außerhalb + die Aktionsleiste. Hilfe-Dialog zeigt auf Touch-Geräten Gesten statt Tastenkürzel.
2. SL/TP ziehen absichern: TP auf Verlustseite verhindern (Toast + zurücksetzen), SL-Vergrößerung über 1,5× Ursprungsrisiko → Warnung mit neuem R; beim Ziehen live im Label „SL −215 $ (−1,0R → −2,3R)“.
3. Touch: Trefferzone für Linien 18 px bei pointerType touch, Label-Box als Griff; an Positionskarte SL/TP mit −/+ Tick-Knöpfen.
4. Toasts: unten rechts über der Replay-Leiste (links von der Seitenleiste), z-index unter Modals, bei offenem Modal ausblenden, max. 2. Überflüssige Toasts streichen (z. B. „Replay läuft ab…“ → nur Statuszeile).
5. Standardrisiko 500 $ (1 % von 50k); Limit/Stop-Feld beim Umschalten mit aktuellem Kurs vorbelegen.
6. Positionen über das Ticket, Vorschau kompakter, Prop-Box einzeilig mit Meter (aufklappbar).
7. Bug: Abbrechen im Startpunkt-Wählen-Modus unsichtbar → fixen.
8. Tastenkürzel: Enter/Esc in Ticket-Feldern verlässt das Feld; B/S/X in Zahlenfeldern abfangen.
9. Chart-Überlappungen: Gitter-Labels nahe Preis-Tags weglassen; Legende kürzen statt abschneiden; Session-Labels links klemmen; Order-Labels in die Preisachse bzw. links vom Profil statt auf der aktuellen Kerze; rechter Leerraum ca. 8 Kerzen bzw. 12 % (Profil überdeckt sonst die neuesten Kerzen) und Profil-Deckkraft reduzieren.
10. Zahlenformat konsequent: Geld deutsch („1.234,56 $“), R und % deutsch mit Komma („+1,90R“, „40,0 %“); Preise dürfen Punkt behalten (Futures-Konvention) – überall einheitlich.
11. Kontrast: `--faint` heller (~#6f7d94), Kaufen-Button dunkleres Grün für weiße Schrift (≥ 4.5:1), Unterzeilen volle Deckkraft; gesperrte Großbuchstaben-Labels → normale Schreibweise 11–11.5 px in `--muted` (nimmt KI-Look raus). Marke „Edge Lab Replay“ normal gesetzt, nicht gesperrt.
12. Touch-Ziele ≥ 40 px bei `(pointer:coarse)`.
13. Netto-Werte: Order-Labels und Vorschau zeigen SL/TP inkl. Gebühren/Slippage („TP +390 $ · 1,9R netto“).
14. Kopfzeile: Maske am Ende der Indikator-Leiste; Tick/Punktwert als Badge; Texte: „1 offene Position wird …“ (Plural korrekt), „Unteres Fenster“, „Punkte“ statt „Pkt“, Footprint-Badge nur zeigen, wenn Footprint aktiv und nicht genug gezoomt; „Ergebnis-Typ: automatisch“.

### Ideen – umsetzen (Rest weglassen)
- **A1 Databento-/Futures-CSV**: Zeitspalten `ts_event`/`ts_recv` erkennen; wenn Databento-Spalten (ts_event oder action) vorhanden: side `A` = Verkäufer-Aggressor, `B` = Käufer-Aggressor, `N` überspringen; Spalte `symbol`: pro Tag den Kontrakt mit dem meisten Volumen behalten; ganzzahlige Preise > 1e9 × 1e-9. Generische Dateien: bisherige Logik (ask = Kauf). Tests ergänzen.
- **A3 Monte-Carlo / Prop-Bestehens-Wahrscheinlichkeit** in Statistik: 2000 Durchläufe, Reihenfolge der Trades zufällig (Bootstrap mit Zurücklegen, gleiche Anzahl Trades), Ausgabe: Verteilung Max-Drawdown (Median, 95 %), schlimmste Verlustserie (95 %), Wahrscheinlichkeit Ziel vor Max-DD (mit propCheck-Regeln, Trades pro Tag wie im Original verteilt – vereinfachend: Tagesverlust-Limit anhand der Original-Tagesgruppierung) – als kleines Histogramm. In Web Worker nicht nötig, aber in Häppchen rechnen, damit die UI nicht hängt.
- **A4 RTH-Levels** für Märkte mit Session America/New_York: Overnight-High/Low (18:00–9:30 ET), RTH-Open 9:30, Initial Balance 9:30–10:30 (Hoch/Tief, ab 10:30 anzeigen, während IB läuft als „IB läuft“), Opening Range 15 min. Nur bis Cursor (kein Lookahead!). Schalter „RTH-Levels“ in der Indikator-Leiste.
- **A5 Teilausstieg + Auto-Break-even + Trailing** (Engine): optional im Ticket „TP1 bei x R schließt y %“, „Stop auf Einstand ab +z R“, „Trailing-Stop n Punkte“. Teilausstiege im Journal zu EINEM Trade zusammenfassen (Felder: partials[], gesamt-PnL, R gesamt). Tests in test-core.js.
- **A7 MAE/MFE-Streudiagramm + R-Histogramm + Kalender** (Tages-PnL je Tag als Farbfeld) in Statistik.

## 6. Mathe-Kontrolle
Die Funde des Kontrolleurs stehen unten (Abschnitt 7) und haben VORRANG vor allem anderen: zuerst KRITISCH und WICHTIG beheben, mit Test.

## 8. Abnahme
- `node test-core.js`, `python3 test-ui.py`, `python3 test-live.py` grün (an neue Struktur angepasst), plus neue Tests für: Bereichswechsel, Foto-Speicherung (IndexedDB) inkl. Auto-Foto beim Trade, Backtest-Session mit gemocktem Archiv (`data/index.json` + `.csv.gz` per Playwright-route ausliefern) inkl. Blind-Modus (kein Datum sichtbar), TradingView-CSV-Import, Databento-Import, Teilausstieg.
- Screenshots Desktop 1440×860 und 1280×720 und Handy 390×844 von jedem Bereich ansehen und Überlappungen beseitigen.
- Am Ende kurzer Bericht auf Deutsch: was umgesetzt, was bewusst nicht, offene Punkte.

## 7. Funde des Kontrolleurs
(wird ergänzt)

## 7. Funde des Kontrolleurs (VORRANG – alle beheben, je mit Test)

KRITISCH
1. Forex-Gebühren pro Einheit statt pro Lot (app.js costKey): FOREX → 'crypto'-Profil (Prozent) oder eigenes Forex-Profil mit fixer Gebühr pro 100k-Lot. Test: Forex-Trade mit Risiko 100 $ darf keine absurden Gebühren haben.

WICHTIG
2. Einstiegskerze in core.js `_exitCheck(entryBar=true)` falsch: (a) Gap über SL → wurde Gewinn statt Verlust, (b) TP-Gap optimistisch → Verlust, (c) optimistisch ignoriert sicheren SL, (d) konservativ/Pfad buchen sicheren TP nie (Stop-Entry oder Füllung am Open → TP nach Füllung sicher). Geprüfter Fix:
```js
if (entryBar) {
  const e = o.entryPrice; let sl = null, tp = null;
  if (o.sl != null && (long ? (bar.l <= o.sl || e <= o.sl) : (bar.h >= o.sl || e >= o.sl)))
    sl = long ? Math.min(o.sl, e) - s : Math.max(o.sl, e) + s;
  if (o.tp != null && (long ? bar.h >= o.tp : bar.l <= o.tp))
    tp = long ? Math.max(o.tp, e) : Math.min(o.tp, e);
  const tpSure = o.type === 'stop' || e === bar.o;
  if (sl != null && tp != null) return mode === 'optimistic' ? { px: tp, reason: 'TP' } : { px: sl, reason: 'SL' };
  if (sl != null) return { px: sl, reason: 'SL' };
  if (tp != null && (tpSure || mode === 'optimistic')) return { px: tp, reason: 'TP' };
  return null;
}
```
   Achtung: Bei tpSure-Fall mit Stop-Entry prüfen, dass der TP-Preis nach der Füllung liegt (Stop-Long: Pfad geht über den Stop nach oben weiter – plausibel). Außerdem MAE/MFE auf der Einstiegskerze nicht nur aus dem Schlusskurs: wenn der Trade die Kerze überlebt, extHi/extLo mit bar.h/bar.l aktualisieren (konservativ für MAE ok). Tests für alle vier Fälle in test-core.js.
3. Lookahead über das Journal: Journal-Liste, Statistik, balance() und Prop-Box zeigen Trades aus früheren Replays, die zeitlich nach dem Cursor liegen; gespeicherte Zeichnungen mit späterem Zeitpunkt ebenfalls. Fix: `seen(j) { return !this.replay.active || j.sym !== this.symbol || j.exitT <= this.base[this.cursor].t; }` in journalFiltered/balance/Statistik verwenden; Zeichnungen im Replay nur, wenn Startzeit ≤ Cursorzeit (hline immer). Im Blind-Modus erst recht.
4. Prop-Check vermischt alle Replays: im Replay nur die Trades des aktuellen Replays (`j.replay === this.replay.id`), sonst pro Backtest-Session getrennt auswerten (Tagesverlust je Session). In Statistik: Prop-Auswertung je Session.
5. „Einstellungen zurücksetzen“ wirkungslos: deepMerge teilt Referenzen mit DEFAULTS. Fix: `const fresh = () => JSON.parse(JSON.stringify(DEFAULTS));` überall statt DEFAULTS verwenden.
6. CSV `TT/MM/JJJJ` wird still als US gelesen: wenn erster Teil > 12 → tauschen; ungültige Werte → NaN; über die ganze Datei auf Eindeutigkeit prüfen (wenn irgendeine Zeile erster Teil > 12 → ganze Datei als TT/MM).
7. Deutsche CSV mit Dezimalkomma bei Trennzeichen `;` scheitert: Zahlen mit Komma umwandeln (Tausenderpunkte entfernen), deutsche Spaltennamen ergänzen: datum, zeit, uhrzeit, eröffnung/eroeffnung/erster, hoch, tief, schluss/schlusskurs/letzter, volumen/umsatz.

KLEIN
8. data.binance.vision Futures-Trades ohne Kopfzeile (6 Spalten, Bool in Spalte 5): `else if (n === 6 && isBool(cells[5])) { kind = 'trades'; idx = { p: 1, v: 2, time: 4, side: 5, maker: true }; }`
9. Datum mit Millisekunden `15.07.2026 09:30:00.000` → Regex `(?::(\d{2})(?:\.\d+)?)?`; `20260715` (8 Ziffern) als Datum erkennen, nicht als Unix-Sekunden.
10. Trade-Abdeckung bei CSV auf Kerzengrenzen runden: `const s = (App.baseTf || 60) * 1000; cov = [[Math.floor(trades.t[0] / s) * s, Math.ceil((trades.t[trades.n - 1] + 1) / s) * s]];` – aber nur, wenn die Trades die Randkerzen wirklich vollständig enthalten können; sicherer: ersten/letzten Trade-Zeitpunkt nehmen und nur volle Kerzen dazwischen markieren, Randkerzen nur, wenn Trades im ersten bzw. letzten Sekundenbruchteil der Kerze beginnen/enden. Pragmatisch: Rundung wie oben, da Trade-Dateien normalerweise ganze Tage abdecken.
11. Tokio schließt seit 5.11.2024 um 15:30 (`mt < 930`, Tooltip anpassen). CSV in lokaler Zeit mit Zeitumstellung (doppelte Stunde im Herbst): bei nicht-monotoner Zeit in parseCSV +3600 s addieren statt Zeilen als Duplikate zu verwerfen.
