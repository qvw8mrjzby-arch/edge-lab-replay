# Edge Lab Replay – Version 4: Fehler-Analyse + Trading-Handbuch

Arbeite in /home/claude/bt2 (Stand v3, alle Tests grün: test-core.js, test-ui.py, test-live.py, test-v3.py, test-perf.py; Build `python3 build.py`). Alle Texte Deutsch, keine Emojis, Design-System von v3 verwenden (Abstände, Typo, Karten, leere Zustände, i-Erklärungen). Kein Lookahead. Effizient arbeiten: keine großen Umbauten an Bestehendem.

## 1. Fehler-Analyse (neuer Bereich „Analyse“ #analyse in der Navigation, zwischen Statistik und Strategien; Handy-Nav: Label „Analyse“)
Reine, getestete Funktion `Core.analyzeMistakes(trades, sessions, opts)` in core.js (ohne DOM) → Liste von Befunden {id, titel, schwere ('hoch'|'mittel'|'gering'), anzahl, kostenUsd, kostenR, beschreibung (konkret mit Zahlen), tipp, handbuch (Kapitel-ID), tradeIds[]}. Nur Befunde mit ausreichender Datenbasis anzeigen (Mindestanzahl je Regel, sonst Hinweis „zu wenig Daten“). Kosten = nachvollziehbare Schätzung, im Text erklärt.

Regeln (alle mit Unit-Test inkl. Grenzfällen):
- **SL vergrößert**: slFinal weiter weg als sl (Ursprung). Kosten: Verlust über −1R hinaus.
- **Zu früh raus**: Ausstieg manuell (reason 'Manuell') mit Gewinn kleiner als geplantes Ziel, obwohl MFE danach … (nur aus vorhandenen Daten: wenn mfe ≥ geplanter TP-Abstand → „Ziel war erreichbar“). Kosten: (geplantes R − realisiertes R) je Trade.
- **Stop zu eng**: Verlierer mit MFE vor dem Stopp ≥ 1R oder (wenn verfügbar) Kurs erreichte nach Ausstieg das Ziel – nur nutzen, was ohne Lookahead im Journal vorhanden ist; optional „Nachlauf-Prüfung“: beim Schließen eines Trades speichert die Engine nichts aus der Zukunft – daher NACH dem Ende einer Session (Replay beendet, Daten vorhanden) für die Session-Trades auswerten, ob innerhalb der nächsten N Basis-Kerzen (Standard 120) erst SL+X oder TP erreicht worden wäre („danach ins Ziel gelaufen“). Ergebnis im Trade speichern (post: {hitTp, minutes}). Nur nach Session-Ende, niemals während des Replays anzeigen.
- **Revenge-Trade**: Einstieg ≤ 10 Min (einstellbar) nach einem Verlust in derselben Session, besonders mit größerem Risiko als der vorige Trade. Kosten: Summe PnL dieser Trades, wenn negativ.
- **Overtrading**: Sessions mit mehr Trades als Ø+1σ bzw. > 5; Vergleich Ø R der ersten 3 Trades vs. späterer Trades je Session.
- **Risiko-Disziplin**: tatsächliches Risiko > 1,25 × Ziel-Risiko; stark schwankende Größe (Variationskoeffizient > 0,5).
- **Verlierer länger gehalten**: Ø Haltedauer Verlierer > 1,5 × Gewinner.
- **Schlechte Uhrzeit / Wochentag**: Stunden-/Tages-Gruppen mit ≥ 5 Trades und negativem Ø R, während der Rest positiv ist.
- **Ohne Strategie / Regel-Check nicht erfüllt**: Trades ohne Setup; Trades, bei denen nicht alle Regeln abgehakt waren (beim Platzieren `rulesOk`/`rulesChecked` im Trade speichern, wenn eine Strategie mit Regeln gewählt ist) → Ø R abgehakt vs. nicht abgehakt.
- **Gegen VWAP**: Long unter Session-VWAP / Short darüber beim Einstieg (beim Platzieren `ctx: {vwapSide, vwapDist, atr, deltaLast, cvdSlope}` im Trade speichern, nur Werte bis Cursor) → Ø R mit vs. gegen VWAP.
- **Ziel zu weit**: Anteil Trades, deren MFE das Ziel nicht erreicht, aber ≥ 1R war → Tipp mit Teilausstieg.
- Positiv-Befunde ebenfalls zeigen („Deine Stärke“): beste Strategie/Uhrzeit/Setup-Bedingung.

Darstellung: Kopf mit „Größte Baustelle“ (teuerster Befund) + Summe geschätzter Kosten; Karten sortiert nach Kosten; je Karte: Schwere-Markierung, Zahlen, kurze Erklärung, Tipp, Knopf „Betroffene Trades“ (filtert Journal) und „Im Handbuch lesen“ (öffnet Kapitel). Filter: alle / je Strategie / letzte N Sessions. Im Session-Dialog nach Ende: 1–3 Befunde dieser Session als Kurzhinweis. In der Übersicht: Karte „Größte Baustelle“.

## 2. Trading-Handbuch (neuer Bereich „Handbuch“ #handbuch, in der Nav nach Strategien; Handy-Nav: in „Mehr“ oder als Label „Wissen“ – Nav darf nicht überlaufen, ggf. TradingView/Handbuch unter „Mehr“-Menü bündeln)
Inhalt in eigener Datei handbook.js (Daten als JS-Objekt: Kapitel → Abschnitte, HTML-Strings sauber escaped/statisch). Layout: links Inhaltsverzeichnis (Handy: aufklappbar), rechts Lesespalte ~68ch, Suchfeld (Volltext über Titel+Text, Treffer hervorheben), Lesefortschritt pro Kapitel (gelesen-Haken, localStorage), Deep-Links `#handbuch-<kapitel>` (Hash-Regeln: nur Buchstaben, Ziffern, Bindestrich). Eigene, sachliche SVG-Schaubilder (inline, theme-farben) für: VWAP mit Bändern, Volume Profile mit POC/VAH/VAL, Footprint-Zelle mit diagonaler Imbalance, Delta-Divergenz, Initial Balance + Erweiterungen, R-Multiple/Positionsgröße, Kontokurve mit Drawdown. Knöpfe „Im Chart zeigen“ schalten den passenden Indikator in Charts ein und wechseln dorthin; „Üben im Replay“ startet Neue-Session-Dialog.

Kapitel (fachlich korrekt, nüchtern, keine Gewinnversprechen, jeweils: Was ist das? Wie wird es berechnet? Wie lesen Profis es? Typische Setups/Fehler, Praxis in Edge Lab):
1. Risiko & Positionsgröße: R-Multiple, Formel Größe = Risiko ÷ (Stopp-Abstand × Punktwert), Kontraktspezifikationen NQ/MNQ/ES/MES/GC (Tick, Tickwert), Erwartungswert = Trefferquote × Ø Gewinn − Verlustquote × Ø Verlust, warum Trefferquote allein nichts sagt (Tabelle Break-even-Trefferquote je R:R), Drawdown-Mathematik (−50 % braucht +100 %), Verlustserien-Wahrscheinlichkeit.
2. Prop-Firm-Regeln: Trailing-Drawdown (End-of-Day vs. intraday), Tagesverlust-Limit, Konsistenzregeln, typische Fehler; Hinweis: Regeln je Firma unterschiedlich und ändern sich – immer aktuelle Regeln der Firma prüfen.
3. VWAP: Formel Σ(typischer Preis × Volumen)/ΣVolumen, Reset je Session, Standardabweichungs-Bänder, Anchored VWAP (Anker: Eröffnung, Hoch/Tief, News), Lesart (Fair Value, Institutionen-Benchmark), Setups: Rückeroberung/Ablehnung, Band-Fade vs. Band-Trend, Fehler.
4. Volume Profile / Market Profile: POC, Value Area 70 % (CBOT-Verfahren), VAH/VAL, HVN/LVN, Profil-Formen (P, b, D, dünn), Vortages-Werte, 80-%-Regel (als Faustregel, nicht garantiert), Initial Balance & Erweiterungen, Overnight-High/Low, Opening Range.
5. Orderflow-Grundlagen: Bid/Ask, Aggressor (Market-Order) vs. passiv (Limit), Delta, CVD, Footprint (Bid×Ask), diagonale Imbalance, Stacked Imbalances, Absorption, Exhaustion, Delta-Divergenz, große Trades; Grenzen: ohne echte Trade-Daten nur geschätztes Delta (in Edge Lab: Index-Archiv = geschätzt, Krypto = echt); Orderbuch/DOM nur erwähnen.
6. Sessions & Zeitfenster: Asien/London/New York, CME-Session 18:00 ET, US-Kassaeröffnung 9:30 ET, wichtige Zeiten (Wirtschaftsdaten 8:30 ET, 10:00 ET), Sommerzeit-Verschiebung Europa/USA.
7. Setups-Bibliothek (je Setup: Kontext, Auslöser, Stopp, Ziel, Invalidierung, wie im Backtest prüfen): VWAP-Rückeroberung, Fehlausbruch an VAH/VAL, Initial-Balance-Ausbruch, Opening-Range-Breakout, Absorption am Level, Delta-Divergenz am Hoch/Tief, Trend-Pullback zur EMA/VWAP.
8. Sauber backtesten: Stichprobengröße (≥ 30–100 Trades je Setup, Konfidenz), Look-ahead- und Rückschaufehler, Rosinenpicken, Blind-Modus, Kosten realistisch ansetzen, Intrabar-Annahme, Overfitting, Out-of-Sample, Kennzahlen lesen (PF, Erwartung, Max-DD, Monte Carlo), Journal-Routine.
9. Psychologie & Fehler: die Fehler aus der Analyse (je Abschnitt mit Kapitel-ID, auf die die Analyse verlinkt): SL verschieben, zu früh raus, Revenge, Overtrading, FOMO, Größe; konkrete Gegenmaßnahmen (Regeln, Tageslimit, Checkliste, Pause nach 2 Verlusten).
10. Glossar (A–Z, ≥ 40 Begriffe, kurz, verlinkt).

Disclaimer dezent am Ende jedes Kapitels nicht nötig – einmal im Einleitungs-Kapitel: Lernmaterial, keine Anlageberatung, Trading mit Hebelprodukten birgt hohes Verlustrisiko.

## 3. Abnahme
- Unit-Tests für jede Analyse-Regel (inkl. „zu wenig Daten“), Playwright-Tests: Analyse-Seite mit gemockten Journal-Daten zeigt erwartete Befunde und Kosten; Klick „Betroffene Trades“ filtert Journal; Handbuch: Kapitel-Navigation, Suche, Deep-Link, „Im Chart zeigen“ schaltet Indikator; Nachlauf-Prüfung nur nach Session-Ende (während Replay keine Zukunftsinfo – Test).
- Alle bestehenden Tests grün, Screenshots 1440×860, 390×844, 844×390 von Analyse und Handbuch angesehen und Mängel beseitigt.
- Service-Worker-Cache auf 'edge-lab-replay-v5'.
- Kompakter Bericht auf Deutsch.
