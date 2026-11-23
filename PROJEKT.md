# Edge Lab Replay – Projektnotiz (Übergabe für neue Chats)

Stand: 08.11.2026, Version 5.3. Besitzer: Eliano. Live: https://qvw8mrjzby-arch.github.io/edge-lab-replay/

## Was die App ist
Kostenloses Backtesting-Terminal im Browser (PWA, als App installierbar). Vanilla JS + Canvas, keine Bibliotheken.
Bereiche: Übersicht · Charts · Journal · Backtests · Statistik · Analyse · Strategien · Handbuch · TradingView.

## Funktionen (Kurzfassung)
- Bar-Replay ohne Lookahead, 1/2/4 Charts, eigene Timeframes, Vollbild (G), Blind-Modus (Datum versteckt).
- „Neue Backtest-Session“: zufälliger historischer Tag aus dem Archiv oder Binance, Start NY/London/Asien.
- Indikatoren: Session-VWAP + σ-Bänder, Anchored VWAP, 4 EMAs, Volume Profile (POC/VAH/VAL), Vortages-Levels, RTH-Levels (IB, ON-H/L, OR), Sessions, Delta/CVD, Footprint mit Imbalances (nur mit Trade-Daten), Wirtschaftstermine (CPI, NFP, FOMC 2020-01 bis 2026-10).
- Orders: Market/Limit/Stop, SL/TP ziehbar, Positions-Werkzeug (Shift+B/S), Größe nach Risiko, Teilausstieg/Break-even/Trailing, Slippage/Gebühren, Prop-Regeln.
- Journal mit Fotos (Auto-Screenshots bei Ein-/Ausstieg + Uploads), Backtest-Notizen, Strategien mit Regel-Checkliste, Statistik inkl. Monte-Carlo, Fehler-Analyse (13+ Regeln), Trading-Handbuch (10 Kapitel).
- Pass (neu in 5.1, `src/pass.js`): XP nur für Prozess (Trades mit Notiz/Stop, Regel-Checkliste je Session, Auswertung, Disziplin, Routine/Serien), nie für Gewinn. 30 Level mit Designs, Avataren, Rahmen, Titeln, 15 Abzeichen. XP wird immer aus Journal/Sessions neu berechnet; lokal gespeichert nur Höchststand und Meldungsstand (`elr.pass`), Auswahl (Theme/Avatar/Rahmen/Titel) in `settings.pass` (Sync). Wochenziele (5.2): 3 Ziele pro Woche (Mo–So) aus einem Pool von 7, nie „mehr Trades“, je +40 XP, alle drei +60, rückwirkend aus den Daten berechnet. Test: `python3 test-pass.py`.
- Shop (neu in 5.3, `src/shop.js`): Payout wie bei einem Funded-Account. Jede beendete Backtest-Session ist ein Prop-Konto; ist das Ziel erreicht, kein Regelverstoß (Max-DD, Tagesverlust), mindestens 3 Trades, jeder mit Stop-Loss und der größte Trade höchstens 50 % des Gewinns (Konsistenzregel), kann man das Payout einmal anfordern. Auszahlung 80 % des Gewinns (höchstens bis 2x Ziel), 1 Coin je 1 % des Ziels (80 bis 160 Coins). Challenge-Grenzen gegen Schummeln: Ziel mindestens 3 %, Max-DD höchstens 8 % des Startkapitals, Tageslimit gesetzt. Coins nur für den Shop (24 Dinge: 6 Designs, 6 Avatare, 3 Rahmen, 4 Titel, 5 Kerzenfarben inkl. Standard); der Pass bleibt davon getrennt. Gespeichert in `settings.shop` (claims, owned, candles, wird synchronisiert); Guthaben = Auszahlungen minus Preise, immer neu berechnet. Nicht gekaufte Shop-Dinge setzt `Pass.state()` zurück. Tests: `node test-shop.js`, `python3 test-shop.py`.
- Speicher: IndexedDB lokal; Sync über Supabase (Konto & Sync in den Einstellungen).
- Session fortsetzen nach Neuladen, Update-Hinweis, Rückgängig beim Löschen.

## Jarvis-Terminal (neu, 18.11.2026 – zuerst als Test unter /beta/)
- Seitenleiste wie im Jarvis-Terminal (Tablet/PC), Handy behält die untere Leiste + „Mehr“-Menü. Standard-Design jetzt „Terminal“ (Navy, Inter, Akzent #6f8dff); Shop-Designs unverändert.
- Neue Bereiche (src/jt-*.js, Styles src/jt.css, alles unter .jt gekapselt): Marktüberblick, Morning Briefing, Markt-Explorer, News Intelligence, Makroökonomie, Handels-Desk, Funded-Tracker, Risk Command, Quant Lab, Marktregime, Research Desk, Intelligence Copilot. Alle alten Bereiche bleiben.
- Desk-Trades gehen ins Journal (src 'desk'); Funded-Konten, Risiko-Regeln, Notizen, Watchlist in App.settings.jt (synchronisiert). Briefings/Chat lokal. KI-Key (Gemini/OpenRouter) nur lokal in localStorage 'jt.ai'.
- Daten: data/agg/<ID>-{1d,1h,15m,5m}.json aus dem Archiv (tools/build-agg.mjs, läuft in daten.yml); Yahoo-Tageskerzen, News (RSS) und Kalender (Forex Factory) über tools/fetch-markets.mjs + .github/workflows/markt.yml (stündlich) → data/markets/, data/news.json, data/calendar.json.
- Jarvis denkt mit Claude (wenn in claude.ai geöffnet) oder mit Elianos kostenlosem Gemini-Key; Stimme: Claude-TTS oder Gerätestimme (speechSynthesis), Mikrofon per SpeechRecognition.
- Jarvis in den alten Bereichen (src/jt-hooks.js): Knopf „Jarvis“ in der Chart-Leiste (liest nur Kerzen bis zur Replay-Kerze, Blind-Modus ohne Datum), „Jarvis bewerten“ im Trade-Fenster (mit Chart-Fotos bei Gemini), „Letzte 20 Trades bewerten“ im Journal, Coaching in Statistik, „Fehler erklären“ in Analyse.
- Second Brain (src/jt-space.js): Startszene beim Öffnen ohne #-Unterseite (#brain) – schwarzes Loch im Gargantua-Stil, Wissens-Netz aus echten Daten (Journal, Sessions, Strategien, Notizen, Märkte, Funded, Briefings, Handbuch, Pass), Home-Glas-Dashboard, Pages, Suche; Klick aufs Loch/„Terminal öffnen“ = Eintauchen ins Terminal.
- Glas-Design (`data-glass` am html, Standard an, `elr.glass` = '0' schaltet aus): halbtransparente Flächen + backdrop-filter über einem weichgezeichneten Bild des schwarzen Lochs (wird im Browser erzeugt).
- Jarvis-Hülle: Glas-Tableiste oben (#jvTabs, body.jv-tabs) mit „Second Brain“ (#brain), „Jarvis“ (#copilot, Vollbild ohne Seitenleiste: body.jv-full) und „Trading Terminal“ (letzte Terminal-Seite). Goldener Jarvis-Orb unten rechts (#jvFab).
- Deploy: `beta/index.html` = Testversion. Nach OK: src/site/index.html ins Wurzelverzeichnis kopieren, sw.js-Cache-Version erhöhen.

## Apple-Look (23.11.2026 – zuerst als Test unter /beta/)
- Nur Optik, keine Funktion geändert: `src/apple.css` (wird von build.py nach jt.css eingebunden) und `src/apple.js` (Lichtpunkt auf Karten folgt der Maus, nur mit Maus/Trackpad).
- Terminal-Hintergrund weichgezeichnet und abgedunkelt (#app::before), große Seitentitel überall, Karten 18px-Radius mit Lichtkante, iOS-Segmente, Seitenleiste mit macOS-Auswahl und Gruppen in Großbuchstaben, Hover: Karten leuchten, Kacheln heben sich, Knöpfe heben sich/sinken beim Drücken, Tabellenzeilen heben sich ab, sanftes Einblenden beim Bereichswechsel.
- Nebenbei behoben: Marktüberblick warf „Cannot set properties of null“, wenn die Watchlist fertig lud, nachdem man die Seite verlassen hatte (jt-views.js renderW).

## Weißer Apple-Look + Dashboard (23.11.2026 – Beta)
- Helles Design ist Standard: `src/light.css` (alles unter `:root[data-light]`), gesetzt in `J.initHooks` (jt-hooks.js) aus `elr.light` (≠ '0'). Umschalter: Einstellungen → Konto & Risiko → „Helles Design“ (apple.js); aus = dunkles Glas-Design wie vorher, Shop-Designs wirken nur dort, gekaufte Kerzenfarben (data-candles) auch im hellen Modus.
- Start ohne # ist jetzt das Dashboard (#start) statt des schwarzen Lochs. Tabs oben: Dashboard · Trading Terminal · Jarvis · Universum (Second Brain, jetzt Nebensache; in der Seitenleiste ganz unten).
- Dashboard (`src/dash.js`, hängt sich an App.renderStart): Begrüßung, 6 Kacheln (Trades, Sessions, Strategien, Notizen & Briefings, Pass, Funded) mit 8-Wochen-Verlauf, Aktivität 30 Tage, „Zuletzt gemacht“ (Zeit = wann du gehandelt hast, nicht Replay-Zeit); darunter die bisherigen Kennzahlen/Kontokurve/Sessions.
- Hell = helles Milchglas über farbigem, weichem Hintergrund; Dunkel = bisheriges Glas-Design. Schnellschalter Sonne/Mond oben in der Jarvis-Leiste (#jvMode, Logik `Mode` in apple.js), zusätzlich in den Einstellungen.
- Achtung: backdrop-filter auf header.top nur ab Tablet – auf dem Handy liegt #mainNav (position fixed) im Kopf und würde sonst nach oben springen.

## Daten
- Archiv: `data/<ID>/<JJJJ-MM>.csv.gz` (t,o,h,l,c,v; t = Unix-Sek. UTC), Index `data/index.json`. IDs: NAS100, US500, US30, XAUUSD, GER40 (Dukascopy-Bid-Kurse, Index-CFDs, Delta geschätzt). Wird von der GitHub Action `.github/workflows/daten.yml` (Skript `tools/fetch-data.mjs`) alle 3 Stunden aktualisiert.
- Krypto live von Binance (echtes Taker-Volumen, Footprint per „Trades laden“).
- CSV-Import: TradingView-Export, Databento, NinjaTrader, data.binance.vision, deutsche CSVs.

## Supabase (Projekt „edge-lab“, ref pyrdgaqifsodbhaoxwcn, eu-central-1)
- Replay-Sync: Tabelle `public.elr_items` (user_id, kind, id, data jsonb, deleted, updated_at per Trigger) + privater Bucket `elr-photos` (Ordner = user_id). RLS: nur eigene Daten. Setup-Skript: `tools/supabase-setup.sql` (bereits ausgeführt).
- Daneben existiert Elianos separates Edge-Lab-Journal (Tabellen trades/strategies/settings, Bucket shots) – NICHT anfassen.
- Client nutzt nur den Publishable Key (in src/sync.js), kein SDK.

## Code
- Quellen in `src/`: core.js (Rechenlogik, Engine, Indikatoren, Analyse-Kern), chart.js (Canvas), app.js, notes.js, start.js, data.js, photos.js, storage.js, sync.js, econ.js, analysis.js, handbook.js, ui.js, template.html.
- Bauen: `cd src && python3 build.py` → `src/site/index.html`. Deploy: `src/site/index.html` und `src/site/sw.js` ins Repo-Wurzelverzeichnis kopieren; bei jeder Veröffentlichung die Cache-Version in sw.js erhöhen (aktuell edge-lab-replay-v10).
- Tests (Playwright/Chromium headless, Netz gemockt): `node test-shop.js`, `python3 test-shop.py`, `node test-core.js`, `node test-analysis.js`, `node test-sync.js`, `node test-econ.js`, `python3 test-ui.py`, `python3 test-live.py`, `python3 test-v3.py`, `python3 test-v4.py`, `python3 test-econ.py`, `python3 test-sync.py`, `python3 test-perf.py`. Bauplan-Historie: `src/SPEC-v2.md` … `SPEC-v5.md`.
- Wichtigste Regel: kein Lookahead im Replay.

## Offene Ideen (später, wenn Limit es erlaubt)
- Pass: Wochenrückblick, weitere Verhaltens-Abzeichen aus der Fehler-Analyse, Inhalte für Level 30–50.
- Automatischer Strategie-Test (Regeln als Code, über alle Archivjahre).
- Echte NQ-Orderflow-Daten über Databento (125 $ Startguthaben) – Import ist schon eingebaut, nur Datei holen.
- Wirtschaftstermine nach Oktober 2026 nachtragen (src/econ.js).

## Arbeitsweise mit Eliano
- Immer auf Deutsch. Agenten nur nach Rückfrage bzw. wenn er es sagt. Bei langen Chats Zusammenfassung anbieten und neuen Chat empfehlen.

## Second Brain – alle Lebensbereiche (Nov 2026)
- `J.S.brain.areas` (synchronisiert über App.settings.jt → Supabase), nie im öffentlichen Repo.
- Einspielen per privatem Link `…/#brainimport=<base64url-JSON>` (der Teil nach # geht nie an den Server); danach wird der Hash auf `#brain` gesetzt.
- Jeder Bereich: `{id, name, sub, summary, facts[], next[], links[{t,url}], notes[{t,d}], go?}` → eigener Cluster im schwarzen Loch, Glas-Panel mit Stand / nächsten Schritten / Notizen, „Jarvis dazu fragen“.
- Home-Panel „Dein Leben“, Pages „Dein Leben“, Suche über alle Bereiche; Jarvis bekommt die Bereiche als Kontext (Gemini) bzw. Werkzeug `second_brain` (Claude).
- Live auf index.html; sw.js Cache v11.
