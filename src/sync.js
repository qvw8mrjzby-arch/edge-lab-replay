/* Edge Lab Replay — Sync über das eigene Supabase-Projekt (ohne SDK, reines fetch).
   Tabelle public.elr_items (user_id, kind, id, data jsonb, deleted, updated_at per Trigger), Bucket elr-photos (privat).
   Nur der öffentliche Publishable Key steht im Code – geschützt wird über Row Level Security. Tokens nie in URLs. */
'use strict';
(function (root) {
  /* ---------- Reine Logik (Node-testbar) ---------- */
  const SyncCore = {
    DEVICE_KEYS: ['layout', 'charts', 'jf', 'statsFilter', 'aFilter'],
    /* Inhalt ohne Sync-Felder, Schlüssel sortiert → stabiler Hash */
    canon(o) {
      if (o === null || typeof o !== 'object') return JSON.stringify(o === undefined ? null : o);
      if (Array.isArray(o)) return '[' + o.map((x) => SyncCore.canon(x)).join(',') + ']';
      return '{' + Object.keys(o).filter((k) => k !== '_u' && k !== '_dirty' && o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + SyncCore.canon(o[k])).join(',') + '}';
    },
    hash(o) { const s = SyncCore.canon(o); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + '.' + s.length; },
    rowU(row) { return (row && row.data && +row.data._u) || 0; },
    /* Entscheidung für eine Server-Zeile gegen den lokalen Stand e = {h, u, d, del}:
       'keep'  – lokale, noch nicht übertragene Änderung ist neuer (wird danach hochgeladen)
       'skip'  – identisch, nichts zu tun
       'apply' – Server-Stand übernehmen (neuer oder gleich alt → Server gewinnt) */
    decide(e, row) {
      const ru = SyncCore.rowU(row);
      if (e && e.d && e.u > ru) return 'keep';
      if (e && !e.d && e.u === ru && !!e.del === !!row.deleted && (row.deleted || e.h === SyncCore.hash(row.data))) return 'skip';
      return 'apply';
    },
    /* Lokale Liste gegen den gemerkten Stand abgleichen: neue/geänderte → dirty mit Zeitstempel, fehlende → Grabstein.
       first: erster Abgleich dieser Art – unbekannte Einträge bekommen u = 0 (Server gewinnt bei Gleichstand/neuer). */
    scan(meta, kind, list, idOf, now, first, skip) {
      const seen = new Set(); let changed = 0;
      for (const it of list) {
        const id = idOf(it); if (id == null || id === '') continue;
        const key = kind + ':' + id; seen.add(key);
        if (skip && skip(it)) continue;
        const h = SyncCore.hash(it), e = meta[key];
        if (e && !e.del && e.h === h) continue;
        const u = e ? now : (first ? (+it._u || 0) : now);
        meta[key] = { h, u, d: true };
        it._u = u; it._dirty = true; changed++;
      }
      const pre = kind + ':';
      for (const key in meta) {
        if (key.startsWith(pre) && !seen.has(key) && !meta[key].del) { meta[key] = { h: null, u: now, d: true, del: true }; changed++; }
      }
      return changed;
    },
    /* Server-Zeilen auf eine lokale Liste anwenden (Last-write-wins). Gibt die Anzahl Änderungen zurück. */
    applyRows(meta, kind, list, idOf, rows, keepIf) {
      const pos = new Map(); list.forEach((it, i) => pos.set(String(idOf(it)), i));
      let n = 0; const del = new Set();
      for (const row of rows) {
        if (row.kind !== kind) continue;
        const key = kind + ':' + row.id, e = meta[key], i = pos.get(String(row.id));
        if (i != null && keepIf && keepIf(list[i])) continue;
        const dec = SyncCore.decide(e, row);
        if (dec !== 'apply') continue;
        const u = SyncCore.rowU(row);
        if (row.deleted) {
          if (i != null) { del.add(i); n++; }
          meta[key] = { h: null, u, d: false, del: true };
        } else {
          const it = Object.assign({}, row.data); delete it._dirty; it._u = u;
          if (i != null) list[i] = it; else { pos.set(String(row.id), list.length); list.push(it); }
          meta[key] = { h: SyncCore.hash(it), u, d: false }; n++;
        }
      }
      if (del.size) { const keep = list.filter((_, i) => !del.has(i)); list.length = 0; keep.forEach((x) => list.push(x)); }
      return n;
    },
    settingsPart(s) { const o = JSON.parse(JSON.stringify(s || {})); for (const k of SyncCore.DEVICE_KEYS) delete o[k]; return o; },
    /* Fehlertexte */
    authError(status, j) {
      const c = (j && (j.error_code || j.error || j.code)) || '', m = String((j && (j.msg || j.error_description || j.message)) || '');
      if (c === 'email_not_confirmed' || /not confirmed/i.test(m)) return 'Bitte E-Mail bestätigen – den Link in der Mail öffnen und danach hier anmelden.';
      if (c === 'invalid_credentials' || c === 'invalid_grant' || /invalid login/i.test(m)) return 'E-Mail oder Passwort falsch.';
      if (c === 'user_already_exists' || /already registered/i.test(m)) return 'Diese E-Mail ist schon registriert – bitte anmelden.';
      if (c === 'weak_password' || /password/i.test(m) && status === 422) return 'Passwort zu schwach – mindestens 6 Zeichen.';
      if (status === 429 || c === 'over_request_rate_limit' || c === 'over_email_send_rate_limit') return 'Zu viele Versuche – bitte kurz warten.';
      if (c === 'validation_failed' || /email/i.test(m) && status === 400) return 'Bitte eine gültige E-Mail eingeben.';
      return 'Anmeldung fehlgeschlagen (' + status + ').';
    },
    restError(status, j) {
      const c = (j && j.code) || '';
      if (status === 404 || c === '42P01' || c === 'PGRST205') return 'Sync-Tabelle fehlt – Setup-Skript in Supabase ausführen (tools/supabase-setup.sql).';
      if (status === 401 || status === 403) return 'Keine Berechtigung – bitte neu anmelden.';
      return 'Sync-Fehler (' + status + (j && j.message ? ': ' + j.message : '') + ').';
    }
  };

  /* ---------- Laufzeit (Browser) ---------- */
  const Sync = {
    URL: 'https://pyrdgaqifsodbhaoxwcn.supabase.co',
    KEY: 'sb_publishable_-zPRKDnt6lOWKwnEAUH9FQ_Q1wXD919',
    KINDS: [
      { kind: 'trade', coll: 'journal', id: (x) => x && x.id },
      { kind: 'session', coll: 'sessions', id: (x) => x && x.id },
      { kind: 'strategy', coll: 'strategies', id: (x) => x && (x.id || x.name) }
    ],
    auth: null, meta: null, state: 'none', msg: '', busy: false, again: false, applying: 0, timer: null, iv: null, ready: false,
    PULL_LIMIT: 1000, PUSH_BATCH: 200, DEBOUNCE: 3000, PERIOD: 60000,

    loggedIn() { return !!(this.auth && this.auth.access_token && this.auth.user && this.auth.user.id); },
    uid() { return this.auth && this.auth.user ? this.auth.user.id : null; },
    keepLocal() { return store.get('elr.sync.keep', true) !== false; },
    async init() {
      this.auth = store.get('elr.auth', null);
      const m = await Store.load('syncmeta', null);
      this.meta = m && m.v === 1 ? m : { v: 1, items: {}, first: {}, cursor: null, last: 0, photoRetry: {} };
      this.install();
      this.ready = true;
      /* lokale Änderungen ab jetzt verfolgen (auch abgemeldet – damit Zeitstempel stimmen) */
      await this.scanAll().catch((e) => console.warn('[Sync] scan', e));
      await this.saveMeta();
      addEventListener('online', () => this.run('online'));
      addEventListener('offline', () => { if (this.loggedIn()) this.setState('off', 'Offline – Änderungen werden später übertragen'); });
      addEventListener('focus', () => this.run('focus'));
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.run('visible'); });
      this.iv = setInterval(() => { if (document.visibilityState === 'visible') this.run('periodisch'); }, this.PERIOD);
      if (this.loggedIn()) { this.setState('run', 'Abgleich läuft …'); this.run('start'); } else this.setState('none', 'Nicht angemeldet');
      this.updateHint();
    },
    /* Speicher-Hooks: jede lokale Änderung plant einen Abgleich in 3 s */
    install() {
      if (this._inst) return; this._inst = true;
      const self = this, save = Store.save.bind(Store);
      Store.save = function (k, v) { const p = save(k, v); if (k !== 'syncmeta' && !self.applying) self.touch(); return p; };
      const ss = App.saveSettings.bind(App);
      App.saveSettings = function () { ss(); if (!self.applying) self.touch(); };
      if (typeof Photos !== 'undefined') for (const f of ['add', 'del', 'delOwner', 'put']) {
        const o = Photos[f].bind(Photos);
        Photos[f] = async function () { const r = await o.apply(null, arguments); if (!self.applying) self.touch(); return r; };
      }
    },
    touch() { if (!this.ready) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.run('änderung'), this.DEBOUNCE); },
    saveMeta() { return Store.save('syncmeta', this.meta); },

    /* ---------- HTTP ---------- */
    async http(path, opt) {
      opt = opt || {};
      const h = Object.assign({ apikey: this.KEY }, opt.headers || {});
      if (opt.auth !== false && this.auth && this.auth.access_token) h.Authorization = 'Bearer ' + this.auth.access_token;
      if (opt.json !== undefined) h['Content-Type'] = 'application/json';
      let r;
      try { r = await fetch(this.URL + path, { method: opt.method || 'GET', headers: h, body: opt.json !== undefined ? JSON.stringify(opt.json) : opt.body }); }
      catch (e) { const err = new Error('Keine Verbindung'); err.offline = true; throw err; }
      return r;
    },
    async body(r) { const t = await r.text().catch(() => ''); try { return t ? JSON.parse(t) : null; } catch (_) { return { message: t.slice(0, 200) }; } },
    /* authentifizierter Aufruf: vor Ablauf erneuern, bei 401 einmal erneuern und wiederholen */
    async api(path, opt) {
      if (!this.loggedIn()) throw new Error('Nicht angemeldet');
      if (this.auth.expires_at && this.auth.expires_at - Date.now() / 1000 < 60) await this.refresh();
      let r = await this.http(path, opt);
      if (r.status === 401) { await this.refresh(); r = await this.http(path, opt); }
      return r;
    },
    setSession(j) {
      if (!j || !j.access_token) return false;
      this.auth = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: { id: j.user && j.user.id, email: j.user && j.user.email } };
      store.set('elr.auth', this.auth);
      return true;
    },
    async refresh() {
      if (!this.auth || !this.auth.refresh_token) throw new Error('Sitzung abgelaufen – bitte neu anmelden.');
      if (this._ref) return this._ref;
      this._ref = (async () => {
        const r = await this.http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, json: { refresh_token: this.auth.refresh_token } });
        const j = await this.body(r);
        if (!r.ok || !this.setSession(Object.assign({ user: this.auth.user }, j))) {
          if (r.status >= 400 && r.status < 500) { this.dropAuth(); const e = new Error('Sitzung abgelaufen – bitte neu anmelden.'); e.auth = true; throw e; }
          throw new Error('Anmeldung konnte nicht erneuert werden (' + r.status + ').');
        }
      })();
      try { await this._ref; } finally { this._ref = null; }
    },
    dropAuth() { this.auth = null; try { localStorage.removeItem('elr.auth'); } catch (_) { /* egal */ } },

    /* ---------- Konto ---------- */
    async signUp(email, pw) {
      const r = await this.http('/auth/v1/signup', { method: 'POST', auth: false, json: { email, password: pw } });
      const j = await this.body(r);
      if (!r.ok) throw new Error(SyncCore.authError(r.status, j));
      if (this.setSession(j)) { await this.afterLogin(); return { session: true }; }
      return { session: false, msg: 'Fast geschafft: Bestätige deine E-Mail über den Link in der Mail. Der Link kann auf eine andere Seite führen – danach hier mit E-Mail und Passwort anmelden.' };
    },
    async signIn(email, pw) {
      const r = await this.http('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, json: { email, password: pw } });
      const j = await this.body(r);
      if (!r.ok || !this.setSession(j)) throw new Error(SyncCore.authError(r.status, j));
      await this.afterLogin();
    },
    async recover(email) {
      const r = await this.http('/auth/v1/recover', { method: 'POST', auth: false, json: { email } });
      if (!r.ok) throw new Error(SyncCore.authError(r.status, await this.body(r)));
    },
    /* Erstabgleich: alles Lokale als „hochzuladen“ markieren (Zeitstempel bleiben – Neueres gewinnt), Server komplett holen, nichts löschen */
    async afterLogin() {
      const m = this.meta;
      if (m.uid !== this.uid()) { for (const k in m.items) { if (m.items[k].del) delete m.items[k]; else m.items[k].d = true; } m.cursor = null; m.photoRetry = {}; m.uid = this.uid(); }
      await this.saveMeta();
      this.updateHint();
      await this.run('anmeldung');
    },
    async signOut() {
      const keep = this.keepLocal();
      try { if (this.loggedIn()) await this.http('/auth/v1/logout', { method: 'POST' }); } catch (_) { /* offline: lokal trotzdem abmelden */ }
      this.dropAuth();
      const m = this.meta; m.cursor = null; m.uid = null; m.photoRetry = {};
      for (const k in m.items) { if (m.items[k].del) delete m.items[k]; else m.items[k].d = true; }
      if (!keep) {
        this.applying++;
        try {
          App.journal = []; App.sessions = App.sessions.filter((s) => s.running); App.strategies = App.defaultStrategies();
          await Store.save('journal', App.journal); await Store.save('sessions', App.sessions); await Store.save('strategies', App.strategies);
          if (Photos.ok) for (const p of await Photos.all()) await Photos.del(p.id);
        } finally { this.applying--; }
        m.items = {}; m.first = {};
        await this.scanAll();
        this.refreshUi();
      }
      await this.saveMeta();
      this.setState('none', 'Abgemeldet'); this.updateHint();
    },

    /* ---------- Abgleich ---------- */
    async scanAll() {
      const m = this.meta, now = Date.now();
      for (const K of this.KINDS) {
        const list = App[K.coll]; if (!Array.isArray(list)) continue;
        SyncCore.scan(m.items, K.kind, list, K.id, now, !m.first[K.kind], K.kind === 'session' ? (s) => s.running : null);
        m.first[K.kind] = true;
      }
      const st = [Object.assign(SyncCore.settingsPart(App.settings), { id: 'main' })];
      SyncCore.scan(m.items, 'settings', st, (x) => x.id, now, !m.first.settings);
      m.first.settings = true;
      if (typeof Photos !== 'undefined' && Photos.ok) {
        const ps = (await Photos.all()).map((p) => ({ id: p.id, owner: p.owner, kind: p.kind, t: p.t, w: p.w, h: p.h, type: (p.blob && p.blob.type) || 'image/jpeg' }));
        SyncCore.scan(m.items, 'photo', ps, (x) => x.id, now, !m.first.photo);
        m.first.photo = true;
      }
    },
    async run(why) {
      if (!this.ready || !this.loggedIn()) return;
      if (this.busy) { this.again = true; return this.busy; }
      clearTimeout(this.timer);
      this.busy = (async () => {
        this.setState('run', 'Abgleich läuft …');
        try {
          await this.scanAll();
          await this.pull();
          await this.push();
          this.meta.last = Date.now();
          await this.saveMeta();
          this.setState('ok', 'Synchron');
        } catch (e) {
          await this.saveMeta().catch(() => {});
          if (e.offline || (typeof navigator !== 'undefined' && navigator.onLine === false)) this.setState('off', 'Offline – Änderungen werden später übertragen');
          else this.setState(this.loggedIn() ? 'err' : 'none', e.message || String(e));
          if (e.auth) this.updateHint();
        }
      })();
      try { await this.busy; } finally { this.busy = false; }
      if (this.again) { this.again = false; return this.run('nachlauf'); }
    },
    async pull() {
      const m = this.meta, rows = [];
      const since = m.cursor ? new Date(Date.parse(m.cursor) - 60000).toISOString() : null;
      for (let off = 0; ; off += this.PULL_LIMIT) {
        const q = '/rest/v1/elr_items?select=kind,id,data,deleted,updated_at' + (since ? '&updated_at=gt.' + encodeURIComponent(since) : '') + '&order=updated_at.asc,kind.asc,id.asc&limit=' + this.PULL_LIMIT + '&offset=' + off;
        const r = await this.api(q);
        const j = await this.body(r);
        if (!r.ok) throw new Error(SyncCore.restError(r.status, j));
        rows.push(...(j || []));
        if (!j || j.length < this.PULL_LIMIT) break;
      }
      for (const row of rows) if (!m.cursor || row.updated_at > m.cursor) m.cursor = row.updated_at;
      if (!rows.length) return 0;
      let n = 0;
      this.applying++;
      try {
        for (const K of this.KINDS) {
          const list = App[K.coll]; if (!Array.isArray(list)) continue;
          const c = SyncCore.applyRows(m.items, K.kind, list, K.id, rows, K.kind === 'session' ? (s) => s.running : null);
          if (c) { n += c; await Store.save(K.coll, list); }
        }
        const sr = rows.filter((r) => r.kind === 'settings' && r.id === 'main');
        if (sr.length) {
          const cur = [Object.assign(SyncCore.settingsPart(App.settings), { id: 'main' })];
          if (SyncCore.applyRows(m.items, 'settings', cur, (x) => x.id, sr)) {
            const s = Object.assign({}, cur[0]); delete s.id; delete s._u;
            App.settings = deepMerge(App.settings, s); store.set('elr.settings', App.settings); n++;
            if (typeof UI !== 'undefined' && UI.fillTicket) try { UI.fillTicket(); } catch (_) { /* egal */ }
          }
        }
        n += await this.pullPhotos(rows.filter((r) => r.kind === 'photo'));
      } finally { this.applying--; }
      if (n) this.refreshUi();
      return n;
    },
    photoPath(id) { return encodeURIComponent(this.uid()) + '/' + encodeURIComponent(id) + '.jpg'; },
    async pullPhotos(rows) {
      if (typeof Photos === 'undefined' || !Photos.ok) return 0;
      const m = this.meta; let n = 0;
      for (const id in m.photoRetry) if (!rows.some((r) => r.id === id)) rows.push(m.photoRetry[id]);
      const have = new Set((await Photos.all()).map((p) => p.id));
      for (const row of rows) {
        const key = 'photo:' + row.id, e = m.items[key];
        const dec = SyncCore.decide(e, row);
        if (dec !== 'apply') { delete m.photoRetry[row.id]; continue; }
        const u = SyncCore.rowU(row);
        if (row.deleted) {
          if (have.has(row.id)) { await Photos.del(row.id); n++; }
          m.items[key] = { h: null, u, d: false, del: true }; delete m.photoRetry[row.id];
          continue;
        }
        const d = row.data || {};
        if (!have.has(row.id)) {
          const r = await this.api('/storage/v1/object/authenticated/elr-photos/' + this.photoPath(row.id));
          if (!r.ok) { m.photoRetry[row.id] = row; continue; }
          const blob = await r.blob();
          await Photos.put({ id: row.id, owner: String(d.owner), kind: d.kind || 'upload', t: d.t || 0, w: d.w || 0, h: d.h || 0, blob: new Blob([blob], { type: d.type || 'image/jpeg' }) });
          n++;
        }
        const it = { id: row.id, owner: d.owner, kind: d.kind, t: d.t, w: d.w, h: d.h, type: d.type || 'image/jpeg' };
        m.items[key] = { h: SyncCore.hash(it), u, d: false }; delete m.photoRetry[row.id];
      }
      return n;
    },
    async push() {
      const m = this.meta, uid = this.uid(), out = [];
      const byKind = {};
      for (const K of this.KINDS) { const mp = new Map(); for (const it of App[K.coll] || []) mp.set(String(K.id(it)), it); byKind[K.kind] = mp; }
      byKind.settings = new Map([['main', Object.assign(SyncCore.settingsPart(App.settings), { id: 'main' })]]);
      let photos = null;
      for (const key in m.items) {
        const e = m.items[key]; if (!e.d) continue;
        const i = key.indexOf(':'), kind = key.slice(0, i), id = key.slice(i + 1);
        if (e.del) { out.push({ key, row: { user_id: uid, kind, id, data: { _u: e.u }, deleted: true } }); continue; }
        let data;
        if (kind === 'photo') {
          if (!photos) photos = new Map((await Photos.all()).map((p) => [p.id, p]));
          const p = photos.get(id); if (!p) continue;
          const type = (p.blob && p.blob.type) || 'image/jpeg';
          const r = await this.api('/storage/v1/object/elr-photos/' + this.photoPath(id), { method: 'POST', headers: { 'x-upsert': 'true', 'Content-Type': /^image\/(jpeg|png|webp)$/.test(type) ? type : 'image/jpeg' }, body: p.blob });
          if (!r.ok) { const j = await this.body(r); throw new Error(/bucket/i.test((j && (j.message || j.error)) || '') ? 'Foto-Speicher fehlt – Setup-Skript in Supabase ausführen.' : 'Foto-Upload fehlgeschlagen (' + r.status + ').'); }
          data = { owner: p.owner, kind: p.kind, t: p.t, w: p.w, h: p.h, type };
        } else {
          const it = byKind[kind] && byKind[kind].get(id); if (!it) continue;
          data = JSON.parse(JSON.stringify(it)); delete data._dirty;
        }
        data._u = e.u;
        out.push({ key, row: { user_id: uid, kind, id, data, deleted: false } });
      }
      /* gelöschte Fotos auch im Speicher entfernen */
      for (const o of out) if (o.row.kind === 'photo' && o.row.deleted) { try { await this.api('/storage/v1/object/elr-photos/' + this.photoPath(o.row.id), { method: 'DELETE' }); } catch (e) { if (e.offline) throw e; } }
      for (let k = 0; k < out.length; k += this.PUSH_BATCH) {
        const part = out.slice(k, k + this.PUSH_BATCH);
        const r = await this.api('/rest/v1/elr_items?on_conflict=user_id,kind,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, json: part.map((o) => o.row) });
        const j = await this.body(r);
        if (!r.ok) throw new Error(SyncCore.restError(r.status, j));
        for (const o of part) {
          const e = m.items[o.key]; if (!e || e.u !== o.row.data._u) continue; /* inzwischen erneut geändert → bleibt dirty */
          e.d = false;
          const back = (j || []).find((x) => x.kind === o.row.kind && x.id === o.row.id); if (back) e.s = back.updated_at;
          const it = byKind[o.row.kind] && byKind[o.row.kind].get(o.row.id); if (it) delete it._dirty;
        }
      }
      return out.length;
    },
    refreshUi() {
      try {
        App.renderStratSelects();
        if (typeof UI !== 'undefined' && App.view && App.view !== 'charts') UI.showView(App.view);
        App.requestRender();
      } catch (e) { console.warn('[Sync] UI', e); }
    },

    /* ---------- Anzeige ---------- */
    setState(s, msg) {
      this.state = s; this.msg = msg || '';
      const b = typeof document !== 'undefined' && document.getElementById('btnSync');
      if (typeof document !== 'undefined' && document.body) document.body.dataset.sync = s;
      if (b) {
        b.dataset.state = s;
        const last = this.meta && this.meta.last ? ' · letzter Abgleich ' + new Date(this.meta.last).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
        const t = s === 'none' ? 'Sync: nicht angemeldet – Handy und PC verbinden' : s === 'ok' ? 'Sync: synchron' + last : s === 'run' ? 'Sync: Abgleich läuft …' : s === 'off' ? 'Sync: offline – Änderungen werden später übertragen' : 'Sync-Fehler: ' + this.msg;
        b.title = t; b.setAttribute('aria-label', t);
      }
      if (typeof document !== 'undefined' && document.getElementById('syncPanel') && !document.getElementById('settingsModal').hidden) this.renderPanel();
    },
    updateHint() {
      const el = typeof document !== 'undefined' && document.getElementById('stSync');
      if (el) el.hidden = this.loggedIn() || !!store.get('elr.sync.hintOff', false);
    },
    count() { let n = 0; for (const k in (this.meta || {}).items || {}) if (!this.meta.items[k].del) n++; return n; },
    pending() { let n = 0; for (const k in (this.meta || {}).items || {}) if (this.meta.items[k].d) n++; return n; },
    renderPanel(note) {
      const host = document.getElementById('syncPanel'); if (!host) return;
      const st = { ok: 'Synchron', run: 'Abgleich läuft …', off: 'Offline', err: 'Fehler', none: 'Nicht angemeldet' }[this.state] || '–';
      const priv = '<p class="hint">Deine Daten liegen in deinem eigenen Supabase-Projekt (Tabelle elr_items, privater Foto-Ordner) und sind per Row Level Security nur für dein Konto lesbar. Die laufende Replay-Session und Fenster-Layout bleiben auf dem Gerät.</p>';
      if (!this.loggedIn()) {
        host.innerHTML = '<fieldset><legend>Konto</legend><p class="hint">Melde dich an, um Journal, Backtests, Strategien, Einstellungen und Fotos zwischen Handy und PC abzugleichen. Ohne Anmeldung bleibt alles nur in diesem Browser.</p>' +
          '<div class="grid2"><label class="fld"><span>E-Mail</span><input id="syEmail" type="email" autocomplete="username" spellcheck="false" value="' + esc(this._email || '') + '"></label>' +
          '<label class="fld"><span>Passwort</span><input id="syPw" type="password" autocomplete="current-password" minlength="6"></label></div>' +
          '<div class="toolbar"><button type="button" class="btn primary" id="syIn">Anmelden</button><button type="button" class="btn" id="syUp">Registrieren</button><button type="button" class="linkbtn" id="syForgot">Passwort vergessen?</button></div>' +
          '<p class="status' + (note && note.k ? ' ' + note.k : '') + '" id="syMsg" role="status">' + esc(note ? note.t : (this.state === 'err' ? this.msg : '')) + '</p></fieldset>' + priv;
        const em = () => host.querySelector('#syEmail').value.trim(), pw = () => host.querySelector('#syPw').value;
        const act = async (btn, fn) => {
          const e = em(); this._email = e;
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { this.renderPanel({ t: 'Bitte eine gültige E-Mail eingeben.', k: 'bad' }); return; }
          setBusy(btn, true);
          try { const r = await fn(e); this.renderPanel(r && r.msg ? { t: r.msg, k: 'ok' } : null); }
          catch (err) { this.renderPanel({ t: err.message, k: 'bad' }); }
        };
        host.querySelector('#syIn').onclick = (ev) => { const p = pw(); if (!p) { this.renderPanel({ t: 'Bitte Passwort eingeben.', k: 'bad' }); return; } act(ev.currentTarget, (e) => this.signIn(e, p)); };
        host.querySelector('#syUp').onclick = (ev) => { const p = pw(); if (p.length < 6) { this.renderPanel({ t: 'Passwort: mindestens 6 Zeichen.', k: 'bad' }); return; } act(ev.currentTarget, (e) => this.signUp(e, p)); };
        host.querySelector('#syForgot').onclick = (ev) => act(ev.currentTarget, async (e) => { await this.recover(e); return { msg: 'Wenn ein Konto existiert, kommt gleich eine Mail zum Zurücksetzen. Danach hier mit dem neuen Passwort anmelden.' }; });
        host.querySelector('#syPw').onkeydown = (e) => { if (e.key === 'Enter') host.querySelector('#syIn').click(); };
        return;
      }
      const last = this.meta.last ? new Date(this.meta.last).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'noch nie';
      const pend = this.pending();
      host.innerHTML = '<fieldset><legend>Konto</legend><dl class="kv"><dt>Angemeldet als</dt><dd id="syUser">' + esc(this.auth.user.email || '–') + '</dd><dt>Status</dt><dd id="syState" data-state="' + this.state + '">' + esc(st) + (this.state === 'err' || this.state === 'off' ? ' – ' + esc(this.msg) : '') + '</dd>' +
        '<dt>Letzter Abgleich</dt><dd id="syLast">' + esc(last) + '</dd><dt>Einträge</dt><dd id="syCount">' + this.count() + (pend ? ' · ' + pend + ' noch zu übertragen' : '') + '</dd></dl>' +
        '<div class="toolbar"><button type="button" class="btn primary" id="syNow">Jetzt abgleichen</button><button type="button" class="btn" id="syOut">Abmelden</button></div>' +
        '<label class="ck"><input type="checkbox" id="syKeep"' + (this.keepLocal() ? ' checked' : '') + '> Lokale Daten nach Abmelden behalten</label>' +
        (note ? '<p class="status ' + (note.k || '') + '">' + esc(note.t) + '</p>' : '') + '</fieldset>' + priv;
      host.querySelector('#syNow').onclick = async (ev) => { setBusy(ev.currentTarget, true); await this.run('knopf'); this.renderPanel(); };
      host.querySelector('#syOut').onclick = async (ev) => {
        if (!this.keepLocal() && !(await App.confirm('Abmelden und lokale Daten löschen?', 'Journal, Backtests, Strategien und Fotos werden auf diesem Gerät gelöscht. Was schon abgeglichen ist, bleibt im Konto.', 'Abmelden'))) return;
        setBusy(ev.currentTarget, true); await this.signOut(); this.renderPanel({ t: 'Abgemeldet.', k: 'ok' });
      };
      host.querySelector('#syKeep').onchange = (e) => store.set('elr.sync.keep', e.target.checked);
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SyncCore;
  else { root.SyncCore = SyncCore; root.Sync = Sync; }
})(typeof self !== 'undefined' ? self : this);
