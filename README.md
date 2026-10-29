# Edge Lab Replay

Kostenloses Backtesting-Terminal im Browser: Bar-Replay ohne Blick in die Zukunft, mehrere Charts mit eigenen Timeframes, Session-VWAP mit σ-Bändern, Volume Profile, Footprint, Delta/CVD, Orders mit SL/TP, Journal, Statistik und Backtest-Notizen.

**App öffnen:** https://qvw8mrjzby-arch.github.io/edge-lab-replay/

- **Neue Backtest-Session:** zufälliger historischer Tag (z. B. 2021–2024), Start zur New-York-, London- oder Asien-Eröffnung, optional Blind-Modus ohne Datum.
- **Archiv (kostenlos, automatisch):** Nasdaq 100, S&P 500, Dow, Gold und DAX in 1-Minuten-Kerzen ab 2020 von Dukascopy, geladen von einer GitHub Action alle 3 Stunden (`tools/fetch-data.mjs`, `data/`).
- **Krypto** live und gratis von Binance mit echtem Kauf-/Verkaufsvolumen (Footprint, Delta).
- **Fehler-Analyse:** findet automatisch Stop-Verschieben, zu frühe Ausstiege, Revenge-Trades, Overtrading, schwache Zeitfenster, Trades gegen den VWAP u. a. – mit geschätzten Kosten in $ und R.
- **Trading-Handbuch:** Risiko & Positionsgröße, Prop-Regeln, VWAP, Volume Profile, Orderflow, Sessions, Setups, sauber backtesten, Psychologie, Glossar.
- Futures-Daten auch per CSV-Import (TradingView-Export, Databento, NinjaTrader, data.binance.vision).
- Trades, Notizen und Einstellungen bleiben nur im eigenen Browser (localStorage). Im Journal regelmäßig „Sicherung kopieren“.
- Als App installieren: Seite öffnen → im Browser-Menü „App installieren“ bzw. auf dem iPhone „Teilen → Zum Home-Bildschirm“.
