"""Version 5 – Sync gegen einen Mock-Server (Playwright-Route, in-memory GoTrue + PostgREST + Storage mit RLS-Simulation).
Kein echtes Netz. Szenarien: Registrieren mit/ohne Bestätigung, Anmelden, Erstabgleich in beide Richtungen, zwei Geräte
(Trade erscheint, Löschen, gleichzeitige Änderung), Foto hoch/runter, Token-Ablauf → Refresh, offline → nachgereicht, fehlende Tabelle."""
import os, re, json, itertools, datetime
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

url = 'file://' + os.path.abspath('site/index.html')
out = 'shots'; os.makedirs(out, exist_ok=True)
errs, passed = [], []
HOST = 'https://pyrdgaqifsodbhaoxwcn.supabase.co'
KEY = 'sb_publishable_-zPRKDnt6lOWKwnEAUH9FQ_Q1wXD919'


def ok(cond, name):
    assert cond, name
    passed.append(name); print('ok ', name)


class Mock:
    def __init__(self):
        self.users = {}      # email -> {id, pw, confirmed}
        self.tokens = {}     # access -> uid
        self.refresh = {}    # refresh -> uid
        self.rows = {}       # (uid, kind, id) -> row
        self.files = {}      # path -> (type, bytes)
        self.confirm = True; self.offline = False; self.no_table = False
        self.expired = set(); self.n = itertools.count(1); self.refreshes = 0; self.bad_key = 0; self.token_in_url = 0
        self.clock = datetime.datetime(2026, 10, 29, 12, 0, 0, tzinfo=datetime.timezone.utc)

    def now(self):
        self.clock += datetime.timedelta(microseconds=1500)
        return self.clock.isoformat(timespec='microseconds')

    def session(self, uid, email):
        a, r = 'acc%d' % next(self.n), 'ref%d' % next(self.n)
        self.tokens[a] = uid; self.refresh[r] = uid
        return {'access_token': a, 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(datetime.datetime.now().timestamp()) + 3600, 'refresh_token': r, 'user': {'id': uid, 'email': email}}

    def handle(self, route):
        req = route.request
        if self.offline:
            return route.abort()
        u = urlparse(req.url); path, q = u.path, parse_qs(u.query)
        h = req.headers
        if h.get('apikey') != KEY: self.bad_key += 1
        if 'acc' in u.query or 'ref' in u.query: self.token_in_url += 1
        body = req.post_data_buffer or b''
        js = lambda s, o: route.fulfill(status=s, content_type='application/json', body=json.dumps(o))
        def jbody():
            return json.loads(body.decode() or 'null')
        # --- GoTrue ---
        if path == '/auth/v1/signup':
            b = jbody(); e = b['email']
            if e in self.users: return js(422, {'code': 422, 'error_code': 'user_already_exists', 'msg': 'User already registered'})
            uid = 'u%04d-0000' % next(self.n)
            self.users[e] = {'id': uid, 'pw': b['password'], 'confirmed': not self.confirm}
            if self.confirm: return js(200, {'id': uid, 'email': e, 'confirmation_sent_at': self.now()})
            return js(200, self.session(uid, e))
        if path == '/auth/v1/token':
            b = jbody()
            if q.get('grant_type') == ['password']:
                us = self.users.get(b['email'])
                if not us or us['pw'] != b['password']: return js(400, {'code': 400, 'error_code': 'invalid_credentials', 'msg': 'Invalid login credentials'})
                if not us['confirmed']: return js(400, {'code': 400, 'error_code': 'email_not_confirmed', 'msg': 'Email not confirmed'})
                return js(200, self.session(us['id'], b['email']))
            uid = self.refresh.pop(b.get('refresh_token'), None)
            if not uid: return js(400, {'error_code': 'refresh_token_not_found', 'msg': 'Invalid Refresh Token'})
            self.refreshes += 1
            email = next(e for e, x in self.users.items() if x['id'] == uid)
            return js(200, self.session(uid, email))
        if path == '/auth/v1/logout':
            self.tokens.pop((h.get('authorization') or '')[7:], None); return route.fulfill(status=204, body='')
        if path == '/auth/v1/recover': return js(200, {})
        # --- Auth für REST/Storage ---
        tok = (h.get('authorization') or '')[7:]
        uid = self.tokens.get(tok)
        if not uid or tok in self.expired: return js(401, {'code': 'PGRST301', 'message': 'JWT expired'})
        if path == '/rest/v1/elr_items':
            if self.no_table: return js(404, {'code': 'PGRST205', 'message': "Could not find the table 'public.elr_items' in the schema cache"})
            if req.method == 'GET':
                rows = [r for (ou, _, _), r in self.rows.items() if ou == uid]
                gt = [v for v in q.get('updated_at', []) if v.startswith('gt.')]
                if gt:
                    c = datetime.datetime.fromisoformat(gt[0][3:].replace('Z', '+00:00'))
                    rows = [r for r in rows if datetime.datetime.fromisoformat(r['updated_at']) > c]
                rows.sort(key=lambda r: (r['updated_at'], r['kind'], r['id']))
                off, lim = int(q.get('offset', ['0'])[0]), int(q.get('limit', ['1000'])[0])
                return js(200, [{k: r[k] for k in ('kind', 'id', 'data', 'deleted', 'updated_at')} for r in rows[off:off + lim]])
            if req.method == 'POST':
                assert q.get('on_conflict') == ['user_id,kind,id'] and 'merge-duplicates' in h.get('prefer', '')
                outr = []
                for r in jbody():
                    if r.get('user_id', uid) != uid: return js(403, {'code': '42501', 'message': 'new row violates row-level security policy'})
                    row = {'user_id': uid, 'kind': r['kind'], 'id': r['id'], 'data': r.get('data', {}), 'deleted': bool(r.get('deleted')), 'updated_at': self.now()}
                    self.rows[(uid, r['kind'], r['id'])] = row; outr.append(row)
                return js(201, outr)
        m = re.match(r'^/storage/v1/object/(authenticated/)?elr-photos/(.+)$', path)
        if m:
            p = m.group(2)
            if p.split('/')[0] != uid: return js(403, {'statusCode': '403', 'error': 'Unauthorized', 'message': 'new row violates row-level security policy'})
            if req.method == 'POST':
                self.files[p] = (h.get('content-type'), body); return js(200, {'Key': 'elr-photos/' + p})
            if req.method == 'GET':
                if p not in self.files: return js(400, {'statusCode': '404', 'error': 'not_found', 'message': 'Object not found'})
                t, b = self.files[p]; return route.fulfill(status=200, content_type=t, body=b)
            if req.method == 'DELETE':
                self.files.pop(p, None); return js(200, {})
        return js(404, {'message': 'unbekannt ' + path})


M = Mock()


def device(b, name, w=1440, h=860, touch=False):
    ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, device_scale_factor=2 if touch else 1)
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append('%s console.%s: %s' % (name, m.type, m.text)) if m.type == 'error' and 'ERR_' not in m.text and 'Failed to load' not in m.text and '[Edge Lab]' not in m.text and 'status of 4' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('%s PAGEERROR: %s' % (name, e)))
    pg.on('dialog', lambda d: d.accept())
    pg.route(re.compile(r'^https?://'), lambda r: r.abort())
    pg.route(re.compile(r'^https://pyrdgaqifsodbhaoxwcn\.supabase\.co/'), M.handle)
    pg.add_init_script('try { localStorage.setItem("elr.onboarded", "1"); } catch (_) {}')
    pg.goto(url + '#start')
    pg.wait_for_function('() => typeof Sync !== "undefined" && Sync.ready && App.base && !document.getElementById("boot")', timeout=20000)
    return pg


TRADE = '''(o) => { const t = Object.assign({ id: o.id, sym: 'NQ', src: 'Mock', replay: 77, side: 1, type: 'market', qty: 1, entryT: 1780000000, exitT: 1780000600, entryPrice: 21000, exitPrice: 21010, pnl: 200, r: 1, risk: 200, status: 'closed', note: '' }, o);
  App.journal.push(t); return App.saveJournal(); }'''


def run(pg):
    pg.evaluate('() => Sync.run("test")')
    return pg.evaluate('() => ({ state: Sync.state, msg: Sync.msg })')


def ids(pg):
    return sorted(pg.evaluate('() => App.journal.map(j => j.id)'))


def server(kind='trade', deleted=None):
    return sorted(r['id'] for r in M.rows.values() if r['kind'] == kind and (deleted is None or r['deleted'] == deleted))


with sync_playwright() as p:
    b = p.chromium.launch()
    A = device(b, 'A')
    ok(A.get_attribute('#btnSync', 'data-state') == 'none' and A.is_visible('#stSync'), 'Abgemeldet: Status-Symbol „nicht angemeldet“, Hinweis in der Übersicht')
    A.evaluate(TRADE, {'id': 'tA1', 'note': 'vor Anmeldung A'})
    # ---------- Registrieren mit Bestätigung ----------
    A.click('#btnSync'); A.wait_for_selector('#syncPanel #syEmail')
    ok(A.is_visible('[data-panel="sync"]') and 'eigenen Supabase-Projekt' in A.inner_text('#syncPanel'), 'Kopfzeilen-Symbol öffnet „Konto & Sync“ mit Datenschutz-Hinweis')
    A.fill('#syEmail', 'eli@example.com'); A.fill('#syPw', 'geheim123'); A.click('#syUp')
    A.wait_for_function('() => /Bestätige deine E-Mail/.test(document.getElementById("syncPanel").innerText)')
    ok(not A.evaluate('() => Sync.loggedIn()'), 'Registrieren mit Bestätigung: Hinweis „Bestätige deine E-Mail“, noch nicht angemeldet')
    A.fill('#syPw', 'geheim123'); A.click('#syIn')
    A.wait_for_function('() => /Bitte E-Mail bestätigen/.test(document.getElementById("syncPanel").innerText)')
    ok(True, 'Anmelden vor Bestätigung: „Bitte E-Mail bestätigen“')
    A.fill('#syPw', 'falsch99'); A.click('#syIn')
    A.wait_for_function('() => /E-Mail oder Passwort falsch/.test(document.getElementById("syncPanel").innerText)')
    ok(True, 'Falsches Passwort: „E-Mail oder Passwort falsch“')
    M.users['eli@example.com']['confirmed'] = True
    A.fill('#syPw', 'geheim123'); A.click('#syIn')
    A.wait_for_function('() => Sync.loggedIn() && Sync.state === "ok"', timeout=10000)
    ok('tA1' in server(), 'Anmelden + Erstabgleich: lokaler Trade von A ist auf dem Server')
    ok(A.get_attribute('#btnSync', 'data-state') == 'ok' and 'synchron' in A.get_attribute('#btnSync', 'title'), 'Status-Symbol: synchron mit Tooltip')
    ok(A.inner_text('#syUser') == 'eli@example.com' and A.is_visible('#syNow') and A.is_visible('#syKeep'), 'Konto-Ansicht: E-Mail, Jetzt abgleichen, Lokale Daten behalten')
    ok(server('settings') == ['main'] and 'layout' not in M.rows[(M.users['eli@example.com']['id'], 'settings', 'main')]['data'], 'Einstellungen als ein Datensatz „main“ ohne Layout')
    A.screenshot(path=out + '/v5-sync-desktop.png')
    A.keyboard.press('Escape')
    ok(not A.is_visible('#stSync'), 'Angemeldet: Übersicht-Hinweis verschwindet')
    ok(M.bad_key == 0 and M.token_in_url == 0, 'Jede Anfrage mit Publishable Key, Tokens nie in der URL')

    # ---------- Zweites Gerät: Erstabgleich in beide Richtungen ----------
    B = device(b, 'B', 390, 844, touch=True)
    B.evaluate(TRADE, {'id': 'tB1', 'note': 'vor Anmeldung B'})
    B.evaluate('() => Sync.signIn("eli@example.com", "geheim123")')
    B.wait_for_function('() => Sync.state === "ok"')
    ok(ids(B) == ['tA1', 'tB1'] and 'tB1' in server(), 'Gerät B: holt Trade von A und lädt eigenen hoch (nichts gelöscht)')
    run(A)
    ok(ids(A) == ['tA1', 'tB1'], 'Gerät A: Trade von B erscheint')
    B.evaluate('() => UI.openSettings("sync")'); B.wait_for_selector('#syUser')
    B.screenshot(path=out + '/v5-sync-handy.png')
    vw = B.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 1')
    ok(vw, 'Handy: Konto & Sync ohne horizontales Scrollen')
    B.keyboard.press('Escape')

    # ---------- Neuer Trade A → B, automatisch 3 s nach Änderung ----------
    A.evaluate(TRADE, {'id': 'tA2'})
    A.wait_for_timeout(4200)
    ok('tA2' in server(), 'Automatischer Upload 3 s nach lokaler Änderung')
    run(B)
    ok('tA2' in ids(B), 'Trade auf Gerät A erscheint auf B')
    # ---------- Löschen auf B → verschwindet auf A ----------
    B.evaluate('() => { App.journal = App.journal.filter(j => j.id !== "tA2"); return App.saveJournal(); }')
    run(B)
    ok('tA2' in server(deleted=True), 'Löschen auf B: Grabstein auf dem Server')
    run(A)
    ok('tA2' not in ids(A), 'Löschen auf B verschwindet auf A')
    # ---------- Gleichzeitige Änderung → neuere gewinnt ----------
    A.evaluate('() => { App.journal.find(j => j.id === "tA1").note = "A älter"; return App.saveJournal(); }')
    A.evaluate('() => Sync.scanAll()')
    A.wait_for_timeout(30)
    B.evaluate('() => { App.journal.find(j => j.id === "tA1").note = "B neuer"; return App.saveJournal(); }')
    B.evaluate('() => Sync.scanAll()')
    run(B); run(A); run(B)
    na = A.evaluate('() => App.journal.find(j => j.id === "tA1").note'); nb = B.evaluate('() => App.journal.find(j => j.id === "tA1").note')
    ok(na == nb == 'B neuer', 'Gleichzeitige Änderung: neuere (B) gewinnt auf beiden Geräten')
    # ---------- Strategie + Einstellungen ----------
    A.evaluate('() => { App.strategies.push({ id: "sx", name: "ORB Test", desc: "", rules: "" }); App.saveStrategies(); App.settings.account.start = 77777; App.settings.layout = 4; App.saveSettings(); }')
    run(A); run(B)
    ok(B.evaluate('() => App.strategies.some(s => s.name === "ORB Test") && App.settings.account.start === 77777 && App.settings.layout !== 4'), 'Strategie und Einstellungen übertragen, Layout bleibt gerätelokal')
    # ---------- Foto ----------
    A.evaluate('''async () => { const c = document.createElement('canvas'); c.width = 40; c.height = 30; c.getContext('2d').fillRect(0, 0, 20, 20);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); await Photos.add('tA1', 'upload', blob, 40, 30); }''')
    run(A)
    uid = M.users['eli@example.com']['id']
    files = [k for k in M.files if k.startswith(uid + '/')]
    ok(len(files) == 1 and M.files[files[0]][0] == 'image/jpeg' and server('photo') == [files[0].split('/')[1][:-4]], 'Foto-Upload in eigenen Ordner <uid>/<id>.jpg + Metadaten-Zeile')
    run(B)
    ph = B.evaluate('async () => (await Photos.list("tA1")).map(p => ({ size: p.blob.size, w: p.w }))')
    ok(len(ph) == 1 and ph[0]['size'] == len(M.files[files[0]][1]) and ph[0]['w'] == 40, 'Foto-Download auf B (authentifiziert, lokal in IndexedDB)')
    B.evaluate('async () => { const l = await Photos.list("tA1"); await Photos.del(l[0].id); }')
    run(B)
    ok(not [k for k in M.files if k.startswith(uid + '/')], 'Foto löschen entfernt auch die Datei im Speicher')
    run(A)
    ok(A.evaluate('async () => (await Photos.list("tA1")).length') == 0, 'Foto-Löschen kommt auf A an')
    # ---------- Token-Ablauf → Refresh ----------
    tok = A.evaluate('() => Sync.auth.access_token'); M.expired.add(tok); r0 = M.refreshes
    A.evaluate(TRADE, {'id': 'tA3'})
    st = run(A)
    ok(st['state'] == 'ok' and M.refreshes == r0 + 1 and 'tA3' in server() and A.evaluate('() => Sync.auth.access_token') != tok, 'Token abgelaufen (401) → einmal erneuert, Anfrage wiederholt')
    A.evaluate('() => { Sync.auth.expires_at = Math.floor(Date.now() / 1000) + 10; }'); r0 = M.refreshes
    run(A)
    ok(M.refreshes == r0 + 1, 'Erneuern vor Ablauf')
    # ---------- Offline → später nachgereicht ----------
    M.offline = True
    A.evaluate(TRADE, {'id': 'tA4'})
    st = run(A)
    ok(st['state'] == 'off' and A.get_attribute('#btnSync', 'data-state') == 'off' and 'tA4' in ids(A), 'Offline: Status „offline“, Trade bleibt lokal')
    M.offline = False
    A.evaluate('() => window.dispatchEvent(new Event("online"))')
    A.wait_for_function('() => Sync.state === "ok" && !Sync.busy', timeout=8000)
    ok('tA4' in server(), 'Wieder online: Änderung wird nachgereicht')
    # ---------- Fehlende Tabelle ----------
    M.no_table = True
    st = run(A)
    ok(st['state'] == 'err' and 'Sync-Tabelle fehlt' in st['msg'] and 'Sync-Tabelle fehlt' in A.get_attribute('#btnSync', 'title'), 'Fehlende Tabelle → verständlicher Fehler')
    M.no_table = False
    # ---------- RLS: fremder Nutzer sieht nichts ----------
    M.confirm = False
    C = device(b, 'C')
    C.evaluate('() => Sync.signUp("zweit@example.com", "geheim123")')
    C.wait_for_function('() => Sync.loggedIn() && Sync.state === "ok"')
    ok(ids(C) == [], 'Registrieren ohne Bestätigung: direkt angemeldet; fremde Daten unsichtbar (RLS)')
    # ---------- Abmelden ----------
    A.evaluate('() => Sync.signOut()')
    ok(not A.evaluate('() => Sync.loggedIn()') and A.evaluate('() => localStorage.getItem("elr.auth")') is None and 'tA1' in ids(A), 'Abmelden: Sitzung gelöscht, lokale Daten bleiben (Standard)')
    b.close()

print(len(passed), 'Prüfungen bestanden')
if errs:
    print('\n'.join(errs)); raise SystemExit(1)
print('keine Fehler')
