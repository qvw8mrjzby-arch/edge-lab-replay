"""Pass-Test (Playwright, headless): XP wird rückwirkend aus vorhandenen Daten berechnet, Daten bleiben unverändert,
Design/Avatar wechseln, Level-Meldung, Zurücksetzen der Einstellungen behält den Fortschritt, Handy-Ansicht."""
import os, json
from playwright.sync_api import sync_playwright
url = 'file://' + os.path.abspath('site/index.html')
out = 'shots'; os.makedirs(out, exist_ok=True)
errs, fails = [], []


def check(name, cond, info=''):
    if not cond:
        fails.append(name + ' ' + str(info))
        print('FAIL', name, info)
    else:
        print('ok  ', name)


def open_page(b, w, h):
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.on('console', lambda m: errs.append('console.%s: %s' % (m.type, m.text)) if m.type in ('error', 'warning') and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: %s' % e))
    pg.route('https://fonts.**', lambda r: r.abort())
    pg.route('https://s3.tradingview.com/**', lambda r: r.abort())
    pg.goto(url)
    pg.wait_for_function('() => typeof App !== "undefined" && App.base && App.base.length > 0')
    pg.wait_for_timeout(500)
    if pg.is_visible('#onboardModal'):
        pg.click('#obSkip')
    return pg


SEED = '''() => {
  const now = Math.floor(Date.now() / 1000), DAY = 86400;
  const J = [], S = [];
  for (let d = 0; d < 6; d++) {
    const sid = 'sx' + d;
    S.push({ id: sid, created: now - d * DAY, replayId: 'r' + d, strategy: 'VWAP', sym: 'NQ', discipline: 4, good: 'Geduld beim Einstieg gehabt', bad: 'Stop einmal zu früh verschoben', mistakes: ['Stop verschoben'], blind: d % 2 === 0, running: false, result: 'auto', net: d % 2 ? -300 : 900, trades: 6 });
    for (let i = 0; i < 6; i++) J.push({ id: 'r' + d + '-' + i, session: sid, replay: 'r' + d, status: 'closed', sym: 'NQ', pnl: i % 2 ? -100 : 250, r: i % 2 ? -1 : 2, sl: 1, setup: 'VWAP', note: 'sauberer Einstieg am VWAP, Fall ' + i, side: 1, slFinal: 1, rulesTotal: 4, rulesChecked: 4, rulesOk: true });
  }
  App.journal = J; App.sessions = S;
  return Promise.all([Store.save('journal', J), Store.save('sessions', S)]);
}'''

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = open_page(b, 1280, 800)
    pg.evaluate(SEED)
    before = pg.evaluate('() => ({ j: App.journal.length, s: App.sessions.length, snap: JSON.stringify([App.journal, App.sessions]).length })')

    # Rückwirkende Berechnung
    pg.evaluate("() => location.hash = '#pass'"); pg.wait_for_timeout(300)
    info = pg.evaluate('() => { const c = Pass.refresh(); return { total: c.total, level: c.level, streak: c.streak, badges: c.badges.filter(x => x.done).length }; }')
    print('Pass:', info)
    check('XP rückwirkend berechnet', info['total'] > 300 and info['level'] >= 4, info)
    check('Serie über 6 Tage', info['streak']['best'] == 6, info['streak'])
    check('hw/seen liegen lokal, nicht in den Sync-Einstellungen', pg.evaluate("() => { Pass.check(); const l = JSON.parse(localStorage.getItem('elr.pass')); const s = (JSON.parse(localStorage.getItem('elr.settings')) || {}).pass || {}; return l.hw > 0 && l.seen > 0 && !('hw' in s) && !('seen' in s) && !('hw' in App.settings.pass); }"))
    check('Pass-Seite sichtbar', pg.is_visible('#view-pass') and pg.locator('.pnode').count() == 30)
    pg.screenshot(path=out + '/pass-desktop.png')

    # Daten unverändert
    after = pg.evaluate('() => ({ j: App.journal.length, s: App.sessions.length, snap: JSON.stringify([App.journal, App.sessions]).length })')
    check('Journal und Sessions unverändert', before == after, (before, after))

    # Aufschlüsselung: ohne gelöschte Daten keine fünfte Zeile
    check('Vier Kategorien ohne Bestand', pg.locator('#passBody .mk-row').count() == 4, pg.locator('#passBody .mk-row').count())
    check('Regeln-Liste aus Konstanten', 'bis +' in pg.inner_text('.prules') and '+40' in pg.inner_text('.prules') and '+30' in pg.inner_text('.prules'))
    check('Nächste Belohnung hervorgehoben', pg.locator('.prw.next').count() >= 1 and pg.evaluate("() => { const n = document.querySelector('.prw.next'); return +n.closest('.pnode').querySelector('.pn-l').textContent === Pass.last.level + 1; }"))

    # Spielmechanik (reine Rechnung im Browser)
    mech = pg.evaluate('''() => {
      const mk = (n, o) => Array.from({ length: n }, (_, i) => Object.assign({ id: 'q' + i, session: 'z', status: 'closed', side: 1, sl: 5, slFinal: 5, rulesTotal: 3, rulesChecked: 3, rulesOk: true, entryT: 1e9, exitT: 1e9 + 1 }, o(i)));
      const calc = (J, S) => PassCore.calc(J, S || [], [], {});
      const base = calc(mk(12, () => ({ note: '' })));
      const shortN = calc(mk(12, (i) => ({ note: 'kurz ' + i })));
      const dup = calc(mk(12, () => ({ note: 'immer genau dieselbe Notiz hier' })));
      const good = calc(mk(12, (i) => ({ note: 'saubere Notiz mit Substanz ' + i })));
      const r5 = calc(mk(5, (i) => ({ rulesOk: i < 4 })));            // 80 %
      const r5b = calc(mk(5, (i) => ({ rulesOk: i < 3 })));           // 60 %
      const r2 = calc(mk(2, () => ({})));                              // unter 3 Trades
      const r5c = calc(mk(5, (i) => ({ rulesOk: i < 2 })));           // 40 %
      const nosess = calc(mk(30, (i) => ({ session: undefined, replay: undefined, exitT: 1e9 + (i < 15 ? 0 : 3 * 86400) })));
      const sx = (extra) => calc(mk(3, (i) => (i === 1 ? extra : {})), [{ id: 'z', created: 1e9, discipline: 3, trades: 3 }]).badges.find((b) => b.id === 'stopp').cur;
      const sessTxt = calc([], [{ id: 'a', created: 1, discipline: 3, good: 'zu kurz', bad: 'ein Satz mit genug Wörtern drin', note: 'a b c' }]).cat.reflexion;
      const mist = calc([], [{ id: 'a', created: 1, discipline: 1, mistakes: ['a', 'b', 'c', 'd'] }]).cat.reflexion;
      return { notesShort: shortN.cat.trades - base.cat.trades, notesDup: dup.cat.trades - base.cat.trades, notesGood: good.cat.trades - base.cat.trades,
        r5: r5.cat.rules, r5b: r5b.cat.rules, r2: r2.cat.rules, r5c: r5c.cat.rules, nosess: nosess.cat.trades, nosessN: nosess.n.trades,
        stopOk: sx({}), stopWide: sx({ slFinal: 4 }), stopShortWide: sx({ side: -1, sl: 5, slFinal: 6 }), stopShortTight: sx({ side: -1, sl: 5, slFinal: 4 }),
        sessTxt, mist, A: PassCore.XP };
    }''')
    print('Mechanik:', mech)
    check('Kurze Notizen geben keine XP', mech['notesShort'] == 0, mech['notesShort'])
    check('Doppelte Notiz zählt nur einmal', mech['notesDup'] == 3, mech['notesDup'])
    check('Gute Notizen geben XP', mech['notesGood'] == 36, mech['notesGood'])
    check('Regel-XP je Session (80 % / 60 % / unter 3 Trades / 40 %)', (mech['r5'], mech['r5b'], mech['r2'], mech['r5c']) == (40, 12, 0, 0), (mech['r5'], mech['r5b'], mech['r2'], mech['r5c']))
    check('Trades ohne Session: Deckel je Kalendertag', mech['nosess'] == 24 * 5 and mech['nosessN'] == 30, mech['nosess'])
    check('Stopp gehalten: Long/Short-Logik', (mech['stopOk'], mech['stopWide'], mech['stopShortWide'], mech['stopShortTight']) == (1, 0, 0, 1), (mech['stopOk'], mech['stopWide'], mech['stopShortWide'], mech['stopShortTight']))
    check('Session-Texte brauchen 25 Zeichen und 3 Wörter', mech['sessTxt'] == 30 + 5 + 3 * 2 + 8, mech['sessTxt'])
    check('Fehler-XP höchstens 2', mech['mist'] == 30 + 5 + 2 + 6, mech['mist'])
    check('Gründliche Session 150-220 XP', 150 <= pg.evaluate("() => PassCore.calc(Array.from({length:12},(_,i)=>({id:'t'+i,session:'g',status:'closed',side:1,sl:1,slFinal:1,setup:'x',note:'saubere Notiz mit Substanz '+i,rulesTotal:3,rulesChecked:3,rulesOk:true,entryT:1e9,exitT:1e9})),[{id:'g',created:1e9,discipline:4,good:'Geduld beim Einstieg gehabt',bad:'Stop einmal zu früh verschoben',mistakes:['a'],note:'Alles in allem solide Session',trades:12}],[],{}).total") <= 225)
    check('Level 30 nach 35-50 gründlichen Sessions', 35 <= pg.evaluate('() => PassCore.need(30) / 220') <= 50)

    # Gewinn zählt nicht: gleiche Trades mit riesigem Profit ergeben gleiche XP
    same = pg.evaluate('''() => { const a = Pass.refresh().total; const J2 = App.journal.map(j => Object.assign({}, j, { pnl: 1e6, r: 50 }));
      const b = PassCore.calc(J2, App.sessions, App.strategies, { dayKey: Pass.dayKey() }).total; return [a, b]; }''')
    check('Profit gibt keine XP', same[0] == same[1], same)

    # Design wechseln (freigeschaltet) und gesperrtes nicht
    lvl = info['level']
    pg.evaluate("() => { const s = Pass.state(); s.theme = 'standard'; }")
    pg.click('[data-eq="theme:mitternacht"]'); pg.wait_for_timeout(200)
    th = pg.evaluate("() => ({ attr: document.documentElement.getAttribute('data-theme'), saved: App.settings.pass.theme, accent: COL.accent })")
    check('Design Mitternacht aktiv', th['attr'] == 'mitternacht' and th['saved'] == 'mitternacht' and th['accent'].lower() == '#5aa2ff', th)
    pg.eval_on_selector('[data-eq="theme:nachtgold"]', 'e => e.click()'); pg.wait_for_timeout(150)
    check('Gesperrtes Design bleibt aus', pg.evaluate("() => App.settings.pass.theme") == 'mitternacht')
    pg.click('[data-eq="avatar:pfeil"]'); pg.wait_for_timeout(100)
    check('Avatar wechselt', pg.evaluate("() => App.settings.pass.avatar") == 'pfeil')
    pg.screenshot(path=out + '/pass-theme.png')

    # Einstellungen zurücksetzen behält Fortschritt
    kept = pg.evaluate('''async () => { const hw = Pass.loc().hw; const keep = App.settings.pass; App.settings = freshDefaults(); App.settings.pass = keep; return [hw, App.settings.pass.theme]; }''')
    check('Reset-Logik behält Pass', kept[1] == 'mitternacht')

    # Level-Aufstieg: Freischalt-Karte statt Toast, "Tragen" setzt die Belohnung
    pg.evaluate("() => { const L = Pass.loc(); L.seen = Pass.refresh().level - 1; Pass.saveLoc(); Pass.state().avatar = 'kerze'; Pass.state().theme = 'standard'; Pass.state().frame = 'keiner'; Pass.state().title = 'auto'; }")
    pg.evaluate("() => location.hash = '#start'"); pg.wait_for_timeout(100)
    pg.evaluate("() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove())")
    pg.evaluate('() => Pass.check()'); pg.wait_for_timeout(400)
    check('Unlock-Karte erscheint', pg.is_visible('#passUnlock') and 'Level' in pg.inner_text('#puTitle'), pg.inner_text('#puTitle'))
    check('Kein gestapelter Toast beim Aufstieg', pg.locator('#toasts .toast').count() == 0, pg.inner_text('#toasts'))
    pg.screenshot(path=out + '/pass-unlock.png')
    want = pg.evaluate("() => { const r = PassCore.REWARDS.find((x) => x.lvl === Pass.last.level); return r.type + ':' + r.id; }")
    pg.click('#puWear'); pg.wait_for_timeout(200)
    got = pg.evaluate("() => { const s = App.settings.pass; return { theme: s.theme, avatar: s.avatar, frame: s.frame, title: s.title, titleId: Pass.titleId() }; }")
    tp, idd = want.split(':')
    ok = (tp == 'theme' and got['theme'] == idd) or (tp == 'avatar' and got['avatar'] == idd) or (tp == 'frame' and got['frame'] == idd) or (tp == 'title' and got['title'] == idd)
    check('Tragen setzt die Belohnung', ok and not pg.is_visible('#passUnlock'), (want, got))
    # kein erneutes Anzeigen
    pg.evaluate('() => Pass.check()'); pg.wait_for_timeout(200)
    check('Karte erscheint nicht doppelt', not pg.is_visible('#passUnlock'))
    # nicht während einer Session
    pg.evaluate("() => { const L = Pass.loc(); L.seen = Pass.refresh().level - 1; App.replay.active = true; Pass.check(); }"); pg.wait_for_timeout(300)
    check('Keine Karte während laufender Session', not pg.is_visible('#passUnlock'))
    pg.evaluate("() => { App.replay.active = false; Pass.check(); }"); pg.wait_for_timeout(300)
    check('Karte nach der Session', pg.is_visible('#passUnlock'))
    pg.click('#passUnlock [data-close]'); pg.wait_for_timeout(100)
    # Session-Abschluss: ruhige Zeile ohne Gewinn/Verlust
    pg.evaluate("() => { Pass.check(); const l = Pass.loc(); l.last = { trades: 0, rules: 0, reflexion: 0, routine: 0 }; Pass.saveLoc(); Pass._ended = true; Pass.loc().seen = 99; }")
    pg.evaluate("() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove())")
    pg.evaluate('() => Pass.check()'); pg.wait_for_timeout(200)
    tt = pg.inner_text('#toasts')
    check('Session-Abschluss zeigt XP-Zeile', tt.startswith('+') and 'XP:' in tt and 'Trades' in tt and '€' not in tt and '$' not in tt, tt)
    pg.evaluate("() => { Pass.loc().seen = Pass.refresh().level; Pass.saveLoc(); }")

    # Frisches Gerät: bei leeren Daten kein seen, nach Laden still
    fresh = pg.evaluate('''() => { const J = App.journal, S = App.sessions; App.journal = []; App.sessions = [];
      Pass._loc = { hw: 0, seen: 0, last: null, fresh: true }; Pass.check(); const a = Pass.loc().seen;
      App.journal = J; App.sessions = S; Pass.check(); const b = Pass.loc().seen; return [a, b, Pass.refresh().level]; }''')
    pg.wait_for_timeout(300)
    check('Frisches Gerät: leer → seen bleibt 0, mit Daten → aktuelles Level', fresh[0] == 0 and fresh[1] == fresh[2] and fresh[1] > 1, fresh)
    check('Frisches Gerät: keine Aufstiegs-Karte', not pg.is_visible('#passUnlock'))
    pg.evaluate("() => { document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); }")

    # Höchster Stand bleibt, auch wenn Trades gelöscht werden
    hw = pg.evaluate('() => { const t = Pass.refresh().total; Pass.check(); App.journal.length = 0; App.sessions.length = 0; const c = Pass.refresh(); return [t, c.total, Pass.loc().hw]; }')
    check('Höchster Stand bleibt nach Löschen', hw[1] == hw[0] and hw[2] == hw[0], hw)
    pg.evaluate("() => location.hash = '#pass'"); pg.wait_for_timeout(200)
    check('Fünfte Zeile Bestand (gelöschte Daten)', pg.locator('#passBody .mk-row').count() == 5 and 'Bestand' in pg.inner_text('#passBody .mk-list'))

    # Übersicht zeigt die Karte
    pg.evaluate(SEED); pg.evaluate("() => location.hash = '#start'"); pg.wait_for_timeout(300)
    check('Pass-Karte auf der Übersicht', pg.locator('.pass-chip').count() == 1)
    pg.screenshot(path=out + '/pass-start.png')
    pg.close()

    # Handy
    m = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True)
    m.on('pageerror', lambda e: errs.append('PAGEERROR(m): %s' % e))
    m.route('https://fonts.**', lambda r: r.abort()); m.route('https://s3.tradingview.com/**', lambda r: r.abort())
    m.goto(url); m.wait_for_function('() => typeof App !== "undefined" && App.base && App.base.length > 0'); m.wait_for_timeout(500)
    if m.is_visible('#onboardModal'): m.click('#obSkip')
    m.evaluate(SEED); m.evaluate("() => location.hash = '#pass'"); m.wait_for_timeout(400)
    sw = m.evaluate('() => document.documentElement.scrollWidth')
    check('Handy ohne horizontales Scrollen', sw <= 392, sw)
    m.screenshot(path=out + '/pass-mobile.png', full_page=False)
    vis = m.evaluate("() => { const tr = document.querySelector('#pTrack'), n = document.querySelector('.pnode:not(.wide)'); return tr.clientWidth / n.getBoundingClientRect().width; }")
    check('Handy: Spur zeigt mindestens 2 Karten', vis >= 2.4, vis)
    m.evaluate("() => { const L = Pass.loc(); L.seen = Pass.refresh().level - 1; Pass.saveLoc(); Pass.check(); }"); m.wait_for_timeout(400)
    check('Handy: Unlock-Karte ohne horizontales Scrollen', m.is_visible('#passUnlock') and m.evaluate('() => document.documentElement.scrollWidth') <= 392)
    m.screenshot(path=out + '/pass-unlock-mobile.png')
    m.click('#passUnlock [data-close]')
    m.evaluate("() => location.hash = '#start'"); m.wait_for_timeout(300)
    m.screenshot(path=out + '/pass-start-mobile.png')
    check('Handy Übersicht ohne horizontales Scrollen', m.evaluate('() => document.documentElement.scrollWidth') <= 392)
    m.evaluate("() => location.hash = '#pass'"); m.wait_for_timeout(300)
    m.click('#navMore'); m.wait_for_timeout(200)
    check('Pass im Mehr-Menü', m.locator('#moreMenu a[href="#pass"]').count() == 1)
    b.close()

print('Fehler in der Konsole:', errs)
if errs:
    fails.append('Konsole: ' + '; '.join(errs[:3]))
print('FEHLGESCHLAGEN: %d' % len(fails) if fails else 'Alles ok')
raise SystemExit(1 if fails else 0)
