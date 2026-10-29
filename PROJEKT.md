# Edge Lab Replay – Projektnotiz (Übergabe für neue Chats)

Stand: 29.10.2026, Version 5.0. Besitzer: Eliano. Live: https://qvw8mrjzby-arch.github.io/edge-lab-replay/

## Was die App ist
Kostenloses Backtesting-Terminal im Browser (PWA, als App installierbar). Vanilla JS + Canvas, keine Bibliotheken.
Bereiche: Übersicht · Charts · Journal · Backtests · Statistik · Analyse · Strategien · Handbuch · TradingView.

## Funktionen (Kurzfassung)
- Bar-Replay ohne Lookahead, 1/2/4 Charts, eigene Timeframes, Vollbild (G), Blind-Modus (Datum versteckt).
- „Neue Backtest-Session“: zufälliger historischer Tag aus dem Archiv oder Binance, Start NY/London/Asien.
- Indikatoren: Session-VWAP + σ-Bänder, Anchored VWAP, 4 EMAs, Volume Profile (POC/VAH/VAL), Vortages-Levels, RTH-Levels (IB, ON-H/L, OR), Sessions, Delta/CVD, Footprint mit Imbalances (nur mit Trade-Daten), Wirtschaftstermine (CPI, NFP, FOMC 2020-01 bis 2026-10).
- Orders: Market/Limit/Stop, SL/TP ziehbar, Positions-Werkzeug (Shift+B/S), Größe nach Risiko, Teilausstieg/Break-even/Trailing, Slippage/Gebühren, Prop-Regeln.
- Journal mit Fotos (Auto-Screenshots bei Ein-/Ausstieg + Uploads), Backtest-Notizen, Strategien mit Regel-Checkliste, Statistik inkl. Monte-Carlo, Fehler-Analyse (13+ Regeln), Trading-Handbuch (10 Kapitel).
- Speicher: IndexedDB lokal; Sync über Supabase (Konto & Sync in den Einstellungen).
- Session fortsetzen nach Neuladen, Update-Hinweis, Rückgängig beim Löschen.

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
- Bauen: `cd src && python3 build.py` → `src/site/index.html`. Deploy: `src/site/index.html` und `src/site/sw.js` ins Repo-Wurzelverzeichnis kopieren; bei jeder Veröffentlichung die Cache-Version in sw.js erhöhen (aktuell edge-lab-replay-v7).
- Tests (Playwright/Chromium headless, Netz gemockt): `node test-core.js`, `node test-analysis.js`, `node test-sync.js`, `node test-econ.js`, `python3 test-ui.py`, `python3 test-live.py`, `python3 test-v3.py`, `python3 test-v4.py`, `python3 test-econ.py`, `python3 test-sync.py`, `python3 test-perf.py`. Bauplan-Historie: `src/SPEC-v2.md` … `SPEC-v5.md`.
- Wichtigste Regel: kein Lookahead im Replay.

## Offene Ideen (später, wenn Limit es erlaubt)
- Automatischer Strategie-Test (Regeln als Code, über alle Archivjahre).
- Echte NQ-Orderflow-Daten über Databento (125 $ Startguthaben) – Import ist schon eingebaut, nur Datei holen.
- Wirtschaftstermine nach Oktober 2026 nachtragen (src/econ.js).

## Arbeitsweise mit Eliano
- Immer auf Deutsch. Agenten nur nach Rückfrage bzw. wenn er es sagt. Bei langen Chats Zusammenfassung anbieten und neuen Chat empfehlen.
