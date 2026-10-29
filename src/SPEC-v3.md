# Edge Lab Replay – Version 3: Produkt-Feinschliff

Ziel des Nutzers: Die App soll sich anfühlen wie ein kommerzielles Produkt, das man verkaufen könnte – hochwertig, effizient, durchdacht, fehlerfrei. Arbeite in /home/claude/bt2 (aktueller Stand v2.1, alle Tests grün: `node test-core.js`, `python3 test-ui.py`, `python3 test-live.py`, Build: `python3 build.py`). Alle Texte Deutsch, keine Emojis, Design-Richtung beibehalten (dunkles Trading-Desk, Messing-Akzent, IBM Plex Sans + JetBrains Mono). Kein Lookahead im Replay – heilig.

## A. Erster Eindruck & Führung
1. **Startbereich „Übersicht“** (#start, neuer erster Nav-Punkt, Standard beim Öffnen):
   - Kopf: Kontostand, Netto, Trefferquote, Ø R, Profit-Faktor als ruhige Kennzahlen; Mini-Kontokurve.
   - Großer Primär-Knopf „Neue Backtest-Session“, daneben „Weiter, wo du aufgehört hast“ (wenn eine Session gespeichert ist, siehe C1).
   - Letzte 5 Sessions (Karten), Strategie mit bestem/schlechtestem Ø R, Disziplin-Verlauf (letzte 10 Sessions als kleine Balken), häufigste Fehler-Tags.
   - Leerer Zustand für neue Nutzer: klare 3-Schritt-Anleitung mit Knöpfen (1. Strategie anlegen, 2. Session starten, 3. Auswerten).
2. **Willkommen beim ersten Start** statt Hilfe-Textwand: kompaktes 3-Schritt-Onboarding (Dialog mit Schrittanzeige, Weiter/Überspringen), danach Hilfe jederzeit über „?“. Die bestehende Hilfe bleibt als Referenz (Tastenkürzel/Gesten), schöner gegliedert.
3. **Tooltips/Erklärungen** bei Fachbegriffen (VWAP, POC, R, Profit-Faktor, MAE/MFE, Blind-Modus) als kleines „i“ mit Kurzerklärung (title + zugängliches Popover).

## B. Design-System & Politur
1. Einheitliche Abstands-Skala (4/8/12/16/24/32), Typo-Skala, Radien, Schatten nur für schwebende Elemente; alle Knöpfe mit hover/active/disabled/loading-Zustand; sichtbarer Fokus; Übergänge 120–180 ms (prefers-reduced-motion respektieren).
2. **Leere Zustände** in Journal, Backtests, Statistik, Strategien mit kleiner, eigener SVG-Strichgrafik (keine Emojis, kein Clipart) + eine klare Handlung.
3. **Ladezustände:** Skeletons für Listen, Fortschrittsanzeige beim Datenladen im Chart selbst (nicht nur im Dialog), Start-Ladebildschirm beim Erzeugen/Vorbereiten der Daten.
4. **Rückgängig** statt Bestätigungs-Dialog bei: Trade löschen, Session löschen, Zeichnung löschen, Foto löschen (Toast „Gelöscht · Rückgängig“ 6 s). „Alles löschen“ (Journal leeren) behält die Bestätigung.
5. Konsistente Mikrotexte: Knöpfe = Verb („Session starten“, „Speichern“), Erfolgsmeldungen kurz, Fehlermeldungen sagen, was zu tun ist.
6. Einstellungen als eigener, gegliederter Bereich bzw. Dialog mit Reitern (Konto & Risiko, Kosten, Prop-Regeln, Chart & Indikatoren, Daten & Speicher, Über).

## C. Zuverlässigkeit
1. **Session fortsetzen nach Neuladen/Schließen:** Bei laufendem Replay laufend (gedrosselt, z. B. alle 2 s und bei visibilitychange/pagehide) speichern: Datenquelle + Ladeparameter (Archiv-ID+Zeitraum / Binance-Symbol+Zeitraum / Demo-Seed; bei CSV: Hinweis, dass die Datei neu gewählt werden muss), Cursor, Engine-Orders, Blind-Modus, Replay-ID, Session-ID, Ticket, Zeichnungen. Beim Start: „Laufende Session fortsetzen?“ (Übersicht + Charts). Test mit Neuladen in Playwright (gemocktes Archiv).
2. **Speicher:** Journal, Sessions, Strategien in IndexedDB (unbegrenzt) statt localStorage – mit einmaliger Migration der vorhandenen localStorage-Daten und localStorage-Fallback, wenn IndexedDB fehlt. Einstellungen dürfen in localStorage bleiben. Speicheranzeige (navigator.storage.estimate) und `navigator.storage.persist()` anfragen. Sicherungs-Erinnerung: wenn letzte Sicherung > 7 Tage und > 10 neue Trades → dezenter Hinweis in der Übersicht.
3. **App-Update-Hinweis:** Service Worker (site/sw.js, Cache-Version auf v4 erhöhen): bei neuer Version Banner „Neue Version verfügbar – Neu laden“. **Installieren:** `beforeinstallprompt` abfangen → Knopf „Als App installieren“ (Übersicht/Einstellungen); auf iOS Hinweis „Teilen → Zum Home-Bildschirm“.
4. Fehler nie still schlucken: globale `error`/`unhandledrejection` → dezenter Toast „Etwas ist schiefgelaufen …“ + Konsole; App darf nicht in kaputtem Zustand hängen bleiben.

## D. Effizienz & Performance
1. Messen (Playwright, `performance.now()` um render): 4 Charts, 30 Tage 1m-Daten (≈ 43 000 Kerzen), Zoom raus auf 1m mit 2 000 sichtbaren Kerzen, Pan per Maus. Ziel: < 8 ms pro Chart-Render auf Desktop, kein Ruckeln.
2. Optimieren wo nötig: nur sichtbare Kerzen zeichnen (ist so), Session-Flags je Kerze cachen, Profil/Footprint/Level-Caches, keine Objekt-Erzeugung in heißen Schleifen, Text-Messungen cachen, Volumen-/Kerzen-Pfade gebündelt zeichnen (eine Path pro Farbe), Hover-Rendering nur der Fadenkreuz-Ebene (zweites Canvas als Overlay für Fadenkreuz/Legende/Drag-Vorschau, damit beim Mausbewegen nicht alles neu gezeichnet wird).
3. Datenladen: Archiv-Monate parallel laden, Fortschritt; Binance mit bestehendem Limit.
4. Startzeit: Demo-Erzeugung nicht blockierend (oder kleinere Demo + Hinweis), erster Frame sofort.

## E. Handy
1. Charts-Bereich: im Hochformat Order-Ticket als Bottom-Sheet (aufziehbar), Chart nutzt die Fläche; im Querformat Vollbild-Chart mit schwebenden Kauf/Verkauf-Knöpfen.
2. Alle Touch-Ziele ≥ 44 px, kein horizontales Scrollen, Safe Areas.

## F. QA-Funde
Ein Prüf-Agent testet parallel eine Kopie. Seine Funde bekommst du per Nachricht – sie haben Vorrang (Bugs zuerst).

## Abnahme
Alle bestehenden Tests grün + neue Tests (Übersicht, Onboarding, Rückgängig, Fortsetzen nach Neuladen, IndexedDB-Migration, Update-Banner simuliert, Performance-Messung mit Ausgabe). Screenshots aller Bereiche in 1440×860, 1280×720, 390×844 (hoch) und 844×390 (quer) ansehen und Mängel beseitigen. Am Ende kompakter Bericht auf Deutsch mit Messwerten.

## F. QA-Funde (VORRANG – alle beheben, jeweils mit Test). Zeilennummern beziehen sich auf den Stand vor v3 (Kopie /home/claude/bt-qa); Skripte zum Nachstellen: /tmp/claude-0/qa/t*.py

KRITISCH
1. Handy quer 844×390: Tipp auf „Platzieren“ trifft „Verkaufen“ der festen Aktionsleiste (#mAct) → Market-Short statt geplanter Order. updateConfirm() kennt #mAct/#mainNav nicht. Fix: Bestätigungsleiste sicher innerhalb der sichtbaren Chartfläche halten UND #mAct ausblenden/deaktivieren, solange ein Positions-Entwurf offen ist. Test: Handy quer, Entwurf, Tipp auf Platzieren → geplante Order, kein Short.

WICHTIG
2. Blind-Modus verrät Datum: (a) Journal-CSV-Export und „Sicherung kopieren/als Datei“ enthalten während laufender Blind-Session das echte Datum (inkl. realDay) → im Blind-Modus Export sperren (Hinweis) oder Datum der laufenden Session maskieren. (b) seen() blendet frühere Trades desselben Markts je nach Datum ein/aus (Kalender zeigt „März 2021“) → im Blind-Modus alle Trades desselben Symbols aus anderen Replays ausblenden (Journal, Statistik, Kalender, Übersicht, Chart-Marker).
3. Ausstiegsfoto zeigt die Zukunft: forceStopReplay() setzt Cursor ans Datenende, bevor autoPhoto() aufnimmt. Fix: Fotos vor dem Cursor-Reset aufnehmen (await) bzw. mit Cursor = o.exitIdx rendern. Test: Foto-Pixelvergleich oder Cursor während Aufnahme prüfen.
4. Neuladen mitten im Replay: offene Position verschwindet, Session bleibt running:true für immer, Karte zeigt „–“, keine Warnung. → durch SPEC C1 (Fortsetzen) lösen + beforeunload-Warnung bei offenen Positionen/laufender Session + beim Start verwaiste Sessions sauber schließen, falls nicht fortgesetzt.
5. Nach „Einstellungen zurücksetzen“ wirken Replay-Regler nicht: ui.js hält `const R = App.settings.replay` fest. → in Handlern immer App.settings.replay lesen, Regler nach Reset neu befüllen (allgemein: alle UI-Felder nach Reset neu aus Settings füllen).
6. Strategie löschen: ticket.setup wird nicht geleert (neue Trades bekommen gelöschten Namen); Session öffnen+speichern löscht unbekannten Strategie-Namen. → beim Löschen Ticket leeren; im Session-Dialog unbekannte Namen als Option behalten.
7. Import nach Umbenennen → doppelte Strategie-ID s1: `Object.assign({id: neu}, s)` → `Object.assign({}, s, {id: neu})`.
8. CSV mit 1e300-Preisen → Endlosschleife (yMax==yMin, Gitter p += step ändert p nicht). → Mindestspanne relativ zum Preis, Schleifen hart begrenzen (max. 200 Iterationen), unrealistische Werte beim Import ablehnen (z. B. |p| > 1e9 oder nicht endlich).

KLEIN
9. Import ohne Validierung: `{"sessions":[{"id":"q"}]}` zerstört Bereich Backtests (RangeError in fmtDate). → Pflichtfelder/Zahlen prüfen, ungültige Einträge verwerfen mit Hinweis; Renderer robust gegen fehlende Felder.
10. Doppelklick Kaufen: neue Positionskarte verschiebt Ticket, zweiter Klick trifft anderes Element (ggf. Schließen/BE). → Platz für Positionsliste stabil halten bzw. Knöpfe nach Klick 400 ms sperren; Positionsliste nicht oberhalb der Kaufknöpfe einfügen, ohne Layout-Sprung.
11. Handy hoch: Bestätigungsleiste verdeckt SL-Label (Touch-Griff). → Leiste neben/außerhalb aller Label-Boxen platzieren.
12. Handy quer: nach Session-Start nur ~35 px Chart sichtbar. → Querformat: Chart füllt die Höhe (Vollbild-Layout automatisch), Leisten kompakt/überlagernd.
13. Fehlgeschlagener Zufallstag: Datensatz bleibt mit Cursor am Ende sichtbar (mit Datum), während der nächste Tag lädt. → bis zum Start Lade-Zustand zeigen, Chart verdecken; im Blind-Modus nie Daten vor Replay-Start rendern.
