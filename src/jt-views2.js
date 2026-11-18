/* Jarvis-Terminal — Bereiche: Handels-Desk, Funded-Tracker, Risk Command, Quant Lab, Marktregime, Research Desk, Copilot */
'use strict';
{
  const { $, $$, esc, num, pct, cls, price } = J;
  const V = J.V;
  const val = (b, id) => b.querySelector('#' + id)?.value;
  const fnum = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
/* jüngste Kerzen für Live-Kurs/ATR: feinster verfügbarer Zeitrahmen */
J.lastData = async (s, atr, force) => { for (const tf of (atr ? ['15m', '1h', '1T'] : ['5m', '1h', '1T'])) { try { return await J.load(s, tf, force); } catch (e) { if (e?.code !== 'tf') throw e; } } throw { code: 'nodata' }; };
/* ===================== Handels-Desk ===================== */
V.desk = el => {
  const R = J.S.risk;
  const head = `<div class="page-hd"><div><h1>Handels-Desk</h1><p class="mut">Positionsrechner, Checkliste und Paper-Trading – geschlossene Trades landen in deinem Journal</p></div></div>`;
  const accs = J.S.funded;
  el.innerHTML = head + `<div class="split"><div class="card"><h3>Order-Ticket <small>Paper-Trading & Positionsrechner</small></h3>
    <div class="form">
      <label class="f w2">Konto<select id="dacc"><option value="">Eigenes Konto</option>${accs.map(a => `<option value="${a.id}">${esc(a.name)} · ${esc(a.firm || '')}</option>`).join('')}</select></label>
      <label class="f">Kontostand<input id="dbal" inputmode="decimal" value="${esc(J.S.settings.bal || (typeof App !== 'undefined' ? App.settings.account?.start : '') || '')}" placeholder="z. B. 50000"></label>
      <label class="f w2">Symbol<select id="dsym">${J.symOptions(J.S.settings.sym)}</select></label>
      <label class="f">Kontrakt<select id="dmic"><option value="0">Standard</option><option value="1">Micro</option></select></label>
      <div class="f full"><span class="note">Richtung</span><div class="seg" id="dside"><button class="on" data-s="1">Long</button><button data-s="-1">Short</button></div></div>
      <label class="f">Einstieg<input id="dentry" inputmode="decimal"></label><label class="f">Stop-Loss<input id="dsl" inputmode="decimal"></label><label class="f">Ziel<input id="dtp" inputmode="decimal"></label>
      <label class="f">Risiko %<input id="drisk" inputmode="decimal" value="${R.maxRiskPct || 1}"></label>
      <label class="f w2">Strategie<input id="dstrat" list="dstl"><datalist id="dstl">${J.stratNames().map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
      <label class="f full">Plan – warum dieser Trade?<textarea id="dplan" placeholder="Setup, Trigger, Invalidierung"></textarea></label>
    </div>
    <div class="row" style="margin-top:12px"><button class="btn sm" id="dlive">Live-Kurs holen</button><button class="btn sm" id="datr">Stop/Ziel aus ATR</button><div class="sp"></div></div>
    <div class="kpis" id="dcalc" style="margin-top:14px"></div>
    <div id="dcheck" style="margin-top:14px"></div>
    <div class="row" style="margin-top:14px"><button class="btn long" id="dopen" style="flex:1">Position eröffnen (Paper)</button></div></div>
  <div class="grid" style="align-content:start"><div class="card"><h3>Risiko-Ampel</h3><div id="dlamp"></div></div><div class="card"><h3>Offene Positionen <span class="sp"></span><button class="btn sm" id="dref">${J.icon('refresh')}Kurse</button></h3><div id="dpos"></div></div></div></div>`;
  let side = 1, live = {};
  const g = id => fnum($('#' + id).value);
  const calc = () => {
    const acc = accs.find(a => a.id === $('#dacc').value); const bal = acc ? fundedNow(acc).cur : g('dbal');
    const e = g('dentry'), sl = g('dsl'), tp = g('dtp'), rp = g('drisk'), sym = $('#dsym').value, micro = $('#dmic').value === '1';
    const pv = J.pv(sym, micro), fut = J.isFut(sym);
    const out = [];
    if (bal && e && sl && rp && e !== sl) {
      const risk = bal * rp / 100, dist = Math.abs(e - sl), per = dist * pv;
      const qty = fut ? Math.floor(risk / per) : risk / dist; const realRisk = fut ? qty * per : risk;
      const rr = tp ? Math.abs(tp - e) / dist : null; const wrongSide = (side === 1 && sl >= e) || (side === -1 && sl <= e);
      out.push(['Risiko', J.cash(realRisk), `${num(realRisk / bal * 100, 2)} % vom Konto`], [fut ? 'Kontrakte' : 'Stückzahl', fut ? String(qty) : num(qty, qty < 10 ? 4 : 2), fut ? `${micro ? 'Micro' : 'Standard'} · ${pv} ${J.S.settings.cur}/Punkt` : 'Einheiten'], ['Stop-Abstand', num(dist, 2), fut ? 'Punkte' : ''], ['Chance-Risiko', rr ? '1 : ' + num(rr, 2) : '–', tp ? 'Ziel ' + J.cash(fut ? qty * Math.abs(tp - e) * pv : qty * Math.abs(tp - e)) : 'kein Ziel']);
      if (fut && qty < 1) out.push(['Hinweis', 'Zu enger Spielraum', 'Risiko reicht für keinen Kontrakt – Micro wählen']);
      if (wrongSide) out.push(['Achtung', 'Stop falsch', side === 1 ? 'Long-Stop muss unter dem Einstieg liegen' : 'Short-Stop muss über dem Einstieg liegen']);
      if (R.maxRiskPct && realRisk / bal * 100 > R.maxRiskPct + 1e-9) out.push(['Regel', 'Zu viel Risiko', `Maximal ${R.maxRiskPct} % laut Risk Command`]);
      $('#dcalc').innerHTML = out.map(([a, b, c]) => `<div class="kpi" ${['Achtung', 'Regel', 'Hinweis'].includes(a) ? 'style="border-color:#5b2333"' : ''}><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join('');
      return { bal, e, sl, tp, qty, pv, risk: realRisk, sym, ok: !wrongSide && qty > 0 };
    }
    $('#dcalc').innerHTML = '<p class="note">Kontostand, Einstieg, Stop und Risiko eintragen – der Rechner zeigt Größe, Risiko und Chance-Risiko.</p>'; return null;
  };
  let rules = [];
  const renderCheck = () => { const st = (typeof App !== 'undefined' ? App.strategies || [] : []).find(x => x.name === $('#dstrat').value.trim()); rules = [...(R.rules || '').split('\n'), ...((st && st.rules) || '').split('\n')].map(s => s.trim()).filter(Boolean);
  $('#dcheck').innerHTML = rules.length ? `<div class="note" style="margin-bottom:6px">Checkliste vor dem Einstieg</div>${rules.map((r, i) => `<label class="row nw" style="margin:5px 0"><input type="checkbox" class="dck" id="dck${i}"> ${esc(r)}</label>`).join('')}` : `<p class="note">Lege in <a href="#risk">Risk Command</a> deine Checkliste an oder wähle eine Strategie mit Regeln – sie erscheint dann hier vor jedem Trade.</p>`; };
  renderCheck(); $('#dstrat').addEventListener('change', renderCheck);
  const lamp = () => { const st = riskState(); $('#dlamp').innerHTML = `<div class="row nw"><div class="lamp ${st.cls}">${st.word}</div><div><b>${st.title}</b><div class="note">${st.text}</div></div></div>`; return st; };
  lamp();
  $$('#dside button').forEach(b => b.onclick = () => { side = +b.dataset.s; $$('#dside button').forEach(x => x.classList.toggle('on', x === b)); $('#dopen').className = 'btn ' + (side === 1 ? 'long' : 'short'); calc(); });
  $$('#dentry,#dsl,#dtp,#drisk,#dbal,#dacc,#dsym,#dmic').forEach(i => i.addEventListener('input', calc));
  $('#dbal').addEventListener('change', () => { J.S.settings.bal = $('#dbal').value; J.store.save('settings'); });
  $('#dacc').onchange = () => { const a = accs.find(x => x.id === $('#dacc').value); $('#dbal').disabled = !!a; if (a) $('#dbal').value = fundedNow(a).cur; calc(); };
  $('#dlive').onclick = async () => { try { const s = $('#dsym').value; const d = await J.lastData(s); const q = J.quote(d); $('#dentry').value = +q.last.toPrecision(7); live[s] = q.last; calc(); J.toast(`${J.short(s)}: ${price(q.last)} (Stand ${J.dt(q.t)})`); } catch (e) { J.toast(J.errText(e)); } };
  $('#datr').onclick = async () => { try { const s = $('#dsym').value; const d = await J.lastData(s, true); const a = TA.atr(d.candles); const at = a[a.length - 1]; const e = g('dentry') || d.candles[d.candles.length - 1].c; $('#dentry').value = +e.toPrecision(7); $('#dsl').value = +(e - side * at * 1.5).toPrecision(7); $('#dtp').value = +(e + side * at * 3).toPrecision(7); calc(); J.toast(`Stop 1,5 × ATR (${d.tf}), Ziel 3 × ATR`); } catch (e) { J.toast(J.errText(e)); } };
  $('#dopen').onclick = () => {
    const c = calc(); if (!c || !c.ok) return J.toast('Bitte Eingaben prüfen');
    if (rules.length && $$('.dck').some(x => !x.checked)) return J.toast('Checkliste zuerst abhaken');
    const st = lamp(); if (st.cls === 'stop') return J.toast('Risk Command steht auf STOPP – heute kein neuer Trade');
    const plan = $('#dplan').value.trim();
    J.S.positions.push({ id: J.uid(), t: Date.now(), sym: c.sym, side, entry: c.e, sl: c.sl, tp: c.tp, qty: c.qty, pv: c.pv, risk: c.risk, acc: $('#dacc').value, strat: $('#dstrat').value.trim(), plan });
    J.store.save('positions'); renderPos(); J.toast('Paper-Position eröffnet', 'good');
  };
  const renderPos = () => {
    const P = J.S.positions;
    $('#dpos').innerHTML = P.length ? P.map(p => { const l = live[p.sym]; const up = l != null ? (l - p.entry) * p.side * p.qty * p.pv : null; return `<div class="pos" style="margin-bottom:8px"><span class="chip ${p.side === 1 ? 'up' : 'dn'}">${p.side === 1 ? 'Long' : 'Short'}</span><b>${esc(J.short(p.sym))}</b><span class="note">${num(p.qty, J.isFut(p.sym) ? 0 : 3)} @ ${price(p.entry)} · SL ${price(p.sl)}${p.tp ? ' · TP ' + price(p.tp) : ''}</span><div class="sp"></div>${up != null ? `<b class="${cls(up)}">${J.money(up)}</b>` : ''}<button class="btn sm" data-pclose="${p.id}">Schließen</button></div>`; }).join('') : '<p class="note">Keine offenen Positionen.</p>';
    $$('[data-pclose]').forEach(b => b.onclick = () => closePos(b.dataset.pclose));
  };
  const closePos = id => {
    const p = J.S.positions.find(x => x.id === id); if (!p) return;
    J.modal('Position schließen', `<p class="mut">${p.side === 1 ? 'Long' : 'Short'} ${esc(J.short(p.sym))} · ${num(p.qty, J.isFut(p.sym) ? 0 : 3)} @ ${price(p.entry)}</p><div class="form"><label class="f">Ausstieg<input id="cx" inputmode="decimal" value="${live[p.sym] != null ? +live[p.sym].toPrecision(7) : ''}"></label><label class="f full">Review – was lief gut, was nicht?<textarea id="cn"></textarea></label></div><p class="note">Der Trade landet in deinem Journal (Quelle „Desk“) und zählt für Statistik, Analyse und Pass.</p><div class="row" style="justify-content:flex-end"><button class="btn pri" id="cs">In Journal schließen</button></div>`, (b, close) => {
      b.querySelector('#cs').onclick = () => {
        const x = fnum(b.querySelector('#cx').value); if (x == null) return J.toast('Ausstiegskurs eintragen');
        const pnl = (x - p.entry) * p.side * p.qty * p.pv, risk = Math.abs(p.entry - p.sl) * p.qty * p.pv;
        J.toJournal({ sym: p.sym, side: p.side, qty: p.qty, entryT: p.t / 1000, entry: p.entry, exitT: Date.now() / 1000, exit: x, sl: p.sl, tp: p.tp, pnl, r: risk ? pnl / risk : null, risk, strat: p.strat, note: [p.plan ? 'Plan: ' + p.plan : '', b.querySelector('#cn').value.trim() ? 'Review: ' + b.querySelector('#cn').value.trim() : ''].filter(Boolean).join('\n'), pv: p.pv });
        J.S.positions = J.S.positions.filter(z => z.id !== id); J.store.save('positions'); close(); renderPos(); lamp(); J.toast('Im Journal gespeichert: ' + J.money(pnl), pnl >= 0 ? 'good' : 'bad');
      };
    });
  };
  $('#dref').onclick = async () => { try { const syms = [...new Set(J.S.positions.map(p => p.sym))]; for (const s of syms) { try { const d = await J.lastData(s, false, true); live[s] = J.quote(d).last; } catch { } } renderPos(); } catch (e) { J.toast(J.errText(e)); } };
  renderPos(); calc();
};


/* ===================== Risk-Status ===================== */
  const riskState = () => {
  const s = Jarvis.riskToday(), R = J.S.risk; const reasons = []; let lvl = 0;
  if (R.maxDayLoss > 0) { if (s.pnlHeute <= -R.maxDayLoss) { lvl = 2; reasons.push('Tagesverlust-Limit erreicht'); } else if (s.pnlHeute <= -R.maxDayLoss * .7) { lvl = Math.max(lvl, 1); reasons.push('70 % des Tagesverlust-Limits'); } }
  if (R.maxTrades > 0) { if (s.tradesHeute >= R.maxTrades) { lvl = 2; reasons.push('Max. Trades erreicht'); } else if (s.tradesHeute >= R.maxTrades - 1) { lvl = Math.max(lvl, 1); reasons.push('nur noch 1 Trade erlaubt'); } }
  if (R.maxLossStreak > 0) { if (s.verlustserie >= R.maxLossStreak) { lvl = 2; reasons.push(`${s.verlustserie} Verluste in Folge`); } else if (s.verlustserie === R.maxLossStreak - 1 && s.verlustserie > 0) { lvl = Math.max(lvl, 1); reasons.push('ein Verlust bis zur Pause'); } }
  const base = `Heute: ${s.tradesHeute} Trades · ${J.money(s.pnlHeute)}`;
  return lvl === 2 ? { cls: 'stop', word: 'STOPP', title: 'Handel pausieren', text: reasons.join(' · ') + ' · ' + base, s } : lvl === 1 ? { cls: 'warn', word: 'Vorsicht', title: 'Nahe an deinen Grenzen', text: reasons.join(' · ') + ' · ' + base, s } : { cls: 'ok', word: 'Frei', title: 'Handel freigegeben', text: base + (R.maxDayLoss || R.maxTrades ? '' : ' · Lege Limits in Risk Command fest'), s };
};
J.riskState = riskState;


/* ===================== Funded-Tracker ===================== */
  const fundedNow = a => {
  const E = [...(a.entries || [])].sort((x, y) => x.d.localeCompare(y.d)); const cur = E.length ? E[E.length - 1].bal : a.size;
  const peak = Math.max(a.size, ...E.map(e => e.bal)); const floor = a.ddType === 'trailing' ? Math.min(peak - a.maxDD, a.size) : a.size - a.maxDD;
  const prevDay = [...E].reverse().find(e => e.d < J.today()); const todayE = E.filter(e => e.d === J.today()); const dayPnl = todayE.length ? todayE[todayE.length - 1].bal - (prevDay ? prevDay.bal : a.size) : 0;
  const profit = cur - a.size; const paid = (a.payouts || []).reduce((s, p) => s + p.amt, 0);
  return { cur, peak, floor, room: cur - floor, profit, dayPnl, paid, E };
};
V.funded = el => {
  const render = () => {
    const A = J.S.funded;
    const tot = A.reduce((s, a) => s + (a.phase === 'Funded' ? a.size : 0), 0), paid = A.reduce((s, a) => s + fundedNow(a).paid, 0);
    el.innerHTML = `<div class="page-hd"><div><h1>Funded-Tracker</h1><p class="mut">Deine Prop-Firm-Konten: Ziel, Drawdown-Puffer, Tageslimit, Auszahlungen</p></div></div><div class="row" style="margin-bottom:16px"><div class="kpis" style="flex:1"><div class="kpi"><span>Konten</span><b>${A.length}</b></div><div class="kpi"><span>Funded-Kapital</span><b>${J.cash(tot, 0)}</b></div><div class="kpi"><span>Auszahlungen gesamt</span><b class="up">${J.cash(paid, 0)}</b></div></div><button class="btn pri" id="fadd">${J.icon('plus')}Konto hinzufügen</button></div>
    <div class="grid g2">${A.length ? A.map(a => { const f = fundedNow(a); const tgt = a.target ? J.clamp(f.profit / a.target * 100, 0, 100) : 0; const ddUse = a.maxDD ? J.clamp((1 - f.room / a.maxDD) * 100, 0, 100) : 0; const dayUse = a.dayLimit ? J.clamp(-f.dayPnl / a.dayLimit * 100, 0, 100) : 0; const canPay = a.phase === 'Funded' && a.payoutMin && f.profit >= a.payoutMin;
      return `<div class="card"><h3>${esc(a.name)} <span class="chip ${a.phase === 'Funded' ? 'up' : 'acc'}">${esc(a.phase)}</span><span class="sp"></span><small>${esc(a.firm || '')}</small><button class="btn sm ghost" data-ed="${a.id}">Bearbeiten</button></h3>
      <div class="row nw" style="align-items:flex-end;gap:16px"><div><div class="note">Kontostand</div><div class="big">${J.cash(f.cur, 0)}</div></div><div class="${cls(f.profit)} mid">${J.money(f.profit, 0)}</div><div class="sp"></div><div style="width:42%;height:52px">${Spark([a.size, ...f.E.map(e => e.bal)], f.profit >= 0 ? '#2fcf9f' : '#ef5d78', 200, 52)}</div></div>
      <div style="margin-top:14px;display:grid;gap:10px">
        ${a.target ? `<div><div class="row nw note"><span>Gewinnziel</span><div class="sp"></div><span>${J.cash(Math.max(0, f.profit), 0)} / ${J.cash(a.target, 0)}</span></div><div class="bar"><i style="width:${tgt}%;background:var(--bull)"></i></div></div>` : ''}
        ${a.maxDD ? `<div><div class="row nw note"><span>Drawdown-Puffer (${a.ddType === 'trailing' ? 'trailing' : 'statisch'}) · Grenze ${J.cash(f.floor, 0)}</span><div class="sp"></div><span class="${f.room < a.maxDD * .3 ? 'dn' : ''}">${J.cash(f.room, 0)} übrig</span></div><div class="bar"><i style="width:${ddUse}%;background:${ddUse > 70 ? 'var(--bear)' : 'var(--warn)'}"></i></div></div>` : ''}
        ${a.dayLimit ? `<div><div class="row nw note"><span>Tagesverlust heute</span><div class="sp"></div><span>${J.money(f.dayPnl, 0)} / −${J.cash(a.dayLimit, 0)}</span></div><div class="bar"><i style="width:${dayUse}%;background:var(--bear)"></i></div></div>` : ''}
      </div>
      ${canPay ? `<div class="pos" style="margin-top:12px;border-color:#1e6b55"><b class="up">Auszahlung möglich</b><span class="note">Dein Anteil bei ${a.split || 100} %: ${J.cash(f.profit * (a.split || 100) / 100, 0)}</span><div class="sp"></div><button class="btn sm long" data-pay="${a.id}">Auszahlung eintragen</button></div>` : a.phase === 'Funded' && a.payoutMin ? `<p class="note">Auszahlung ab ${J.cash(a.payoutMin, 0)} Gewinn – noch ${J.cash(Math.max(0, a.payoutMin - f.profit), 0)}.</p>` : ''}
      <div class="row" style="margin-top:12px"><input type="date" id="fd${a.id}" value="${J.today()}" style="width:auto;flex:1"><input id="fb${a.id}" inputmode="decimal" placeholder="Kontostand" style="flex:1"><button class="btn sm" data-add="${a.id}">Eintragen</button></div>
      ${f.E.length ? `<details style="margin-top:10px"><summary class="note" style="cursor:pointer">Verlauf (${f.E.length})</summary><table style="margin-top:6px"><tbody>${[...f.E].reverse().slice(0, 30).map(e => `<tr><td>${J.date(e.d)}</td><td class="r">${J.cash(e.bal, 2)}</td><td class="r"><button class="btn sm ghost" data-rm="${a.id}|${e.d}|${e.bal}">✕</button></td></tr>`).join('')}</tbody></table></details>` : ''}
      ${(a.payouts || []).length ? `<p class="note">Auszahlungen: ${(a.payouts).map(p => `${J.date(p.d)} ${J.cash(p.amt, 0)}`).join(' · ')}</p>` : ''}</div>`; }).join('') : `<div class="card empty" style="grid-column:1/-1"><b>Noch kein Konto</b><span>Trage deine Prop-Firm-Konten ein (Challenge oder Funded) – mit Gewinnziel, Drawdown und Tageslimit. Der Tracker zeigt dir jederzeit, wie viel Luft du noch hast und wann eine Auszahlung möglich ist.</span></div>`}</div>`;
    $('#fadd').onclick = () => edit();
    $$('[data-ed]').forEach(b => b.onclick = () => edit(J.S.funded.find(a => a.id === b.dataset.ed)));
    $$('[data-add]').forEach(b => b.onclick = () => { const a = J.S.funded.find(x => x.id === b.dataset.add); const bal = fnum($('#fb' + a.id).value); if (bal == null) return J.toast('Kontostand eintragen'); (a.entries = a.entries || []).push({ d: $('#fd' + a.id).value || J.today(), bal }); J.store.save('funded'); render(); });
    $$('[data-rm]').forEach(b => b.onclick = () => { const [id, d, bal] = b.dataset.rm.split('|'); const a = J.S.funded.find(x => x.id === id); const i = a.entries.findIndex(e => e.d === d && String(e.bal) === bal); if (i >= 0) a.entries.splice(i, 1); J.store.save('funded'); render(); });
    $$('[data-pay]').forEach(b => b.onclick = () => { const a = J.S.funded.find(x => x.id === b.dataset.pay); const f = fundedNow(a); J.modal('Auszahlung eintragen', `<div class="form"><label class="f">Datum<input type="date" id="pd" value="${J.today()}"></label><label class="f">Betrag an dich<input id="pa" inputmode="decimal" value="${(f.profit * (a.split || 100) / 100).toFixed(0)}"></label><label class="f">Neuer Kontostand<input id="pb" inputmode="decimal" value="${a.size}"></label></div><div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn pri" id="ps">Speichern</button></div>`, (bx, close) => { bx.querySelector('#ps').onclick = () => { (a.payouts = a.payouts || []).push({ d: val(bx, 'pd'), amt: fnum(val(bx, 'pa')) || 0 }); const nb = fnum(val(bx, 'pb')); if (nb != null) (a.entries = a.entries || []).push({ d: val(bx, 'pd'), bal: nb }); J.store.save('funded'); close(); render(); J.toast('Auszahlung gespeichert'); }; }); });
  };
  const edit = a0 => {
    const a = a0 || { id: J.uid(), name: '', firm: '', phase: 'Challenge', size: '', target: '', maxDD: '', ddType: 'trailing', dayLimit: '', payoutMin: '', split: 90, entries: [], payouts: [] };
    J.modal(a0 ? 'Konto bearbeiten' : 'Konto hinzufügen', `<div class="form"><label class="f w2">Name<input id="an" value="${esc(a.name)}" placeholder="z. B. Apex 50K #1"></label><label class="f">Firma<input id="af" value="${esc(a.firm)}"></label><label class="f">Phase<select id="ap">${['Challenge', 'Verifikation', 'Funded'].map(p => `<option ${p === a.phase ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label class="f">Kontogröße<input id="as" inputmode="decimal" value="${esc(a.size)}"></label><label class="f">Gewinnziel<input id="at" inputmode="decimal" value="${esc(a.target)}"></label><label class="f">Max. Drawdown<input id="ad" inputmode="decimal" value="${esc(a.maxDD)}"></label><label class="f">Drawdown-Art<select id="ady"><option value="trailing" ${a.ddType === 'trailing' ? 'selected' : ''}>trailing (bis Startkapital)</option><option value="static" ${a.ddType === 'static' ? 'selected' : ''}>statisch</option></select></label>
      <label class="f">Tagesverlust-Limit<input id="al" inputmode="decimal" value="${esc(a.dayLimit)}"></label><label class="f">Auszahlung ab Gewinn<input id="am" inputmode="decimal" value="${esc(a.payoutMin)}"></label><label class="f">Gewinnanteil %<input id="asp" inputmode="decimal" value="${esc(a.split)}"></label></div>
      <p class="note">Trage die Werte genau so ein, wie sie in den Regeln deiner Prop-Firm stehen.</p><div class="row">${a0 ? '<button class="btn ghost" id="adel" style="color:var(--bear)">Konto löschen</button>' : ''}<div class="sp"></div><button class="btn pri" id="asave">Speichern</button></div>`, (b, close) => {
      b.querySelector('#asave').onclick = () => { const size = fnum(val(b, 'as')); if (!val(b, 'an').trim() || !size) return J.toast('Name und Kontogröße angeben'); Object.assign(a, { name: val(b, 'an').trim(), firm: val(b, 'af').trim(), phase: val(b, 'ap'), size, target: fnum(val(b, 'at')) || 0, maxDD: fnum(val(b, 'ad')) || 0, ddType: val(b, 'ady'), dayLimit: fnum(val(b, 'al')) || 0, payoutMin: fnum(val(b, 'am')) || 0, split: fnum(val(b, 'asp')) || 100 }); if (!a0) J.S.funded.push(a); J.store.save('funded'); close(); render(); };
      const d = b.querySelector('#adel'); if (d) d.onclick = async () => { close(); if (await J.confirm('Konto löschen?', `${a.name} mit Verlauf entfernen.`, 'Löschen')) { J.S.funded = J.S.funded.filter(x => x.id !== a.id); J.store.save('funded'); render(); } };
    });
  };
  render();
};
J.fundedNow = fundedNow;


/* ===================== Risk Command ===================== */
V.risk = el => {
  const R = J.S.risk; const st = riskState(); const js = TA.journalStats(J.journal());
  const exp = J.S.positions.reduce((a, p) => a + (p.risk || 0), 0);
  el.innerHTML = `<div class="page-hd"><div><h1>Risk Command</h1><p class="mut">Ampel, Tageslimits und Risiko-Simulation</p></div></div><div class="split"><div class="card glass"><div class="row nw" style="gap:20px"><div class="lamp ${st.cls}" style="width:110px;height:110px;font-size:17px">${st.word}</div><div><div class="mid">${st.title}</div><p class="mut" style="margin:6px 0 0">${esc(st.text)}</p></div></div>
    <div class="kpis" style="margin-top:16px"><div class="kpi"><span>P/L heute</span><b class="${cls(st.s.pnlHeute)}">${J.money(st.s.pnlHeute)}</b><small>${R.maxDayLoss ? 'Limit −' + J.cash(R.maxDayLoss, 0) : 'kein Limit gesetzt'}</small></div><div class="kpi"><span>Trades heute</span><b>${st.s.tradesHeute}</b><small>${R.maxTrades ? 'max. ' + R.maxTrades : 'kein Limit'}</small></div><div class="kpi"><span>Verlustserie</span><b>${st.s.verlustserie}</b><small>Pause ab ${R.maxLossStreak || '–'}</small></div><div class="kpi"><span>Offenes Risiko</span><b>${J.cash(exp, 0)}</b><small>${J.S.positions.length} Positionen</small></div></div>
    <p class="note">Zählt die Trades, die du heute im Handels-Desk geschlossen hast. Deine Replay-Backtests zählen hier nicht.</p></div>
  <div class="card"><h3>Deine Regeln</h3><div class="form"><label class="f">Max. Verlust/Tag<input id="rl" inputmode="decimal" value="${R.maxDayLoss || ''}" placeholder="z. B. 500"></label><label class="f">Max. Trades/Tag<input id="rt" inputmode="numeric" value="${R.maxTrades || ''}" placeholder="z. B. 3"></label><label class="f">Max. Risiko/Trade %<input id="rp" inputmode="decimal" value="${R.maxRiskPct || ''}"></label><label class="f">Pause nach Verlusten<input id="rs" inputmode="numeric" value="${R.maxLossStreak || ''}"></label><label class="f full">Checkliste vor jedem Trade (eine Regel pro Zeile)<textarea id="rr" placeholder="Bias auf höherem Zeitrahmen geprüft&#10;Kein Trade 5 Min. vor News&#10;Stop gesetzt, bevor ich einsteige">${esc(R.rules || '')}</textarea></label></div><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn pri" id="rsave">Regeln speichern</button></div></div></div>
  <div class="card" style="margin-top:16px"><h3>Risiko-of-Ruin-Simulator <small>2.000 Monte-Carlo-Durchläufe</small></h3><div class="form"><label class="f">Trefferquote %<input id="mw" inputmode="decimal" value="${js.n >= 10 && js.winRate != null ? js.winRate.toFixed(0) : 45}"></label><label class="f">Ø Gewinn in R<input id="mr" inputmode="decimal" value="${js.n >= 10 && js.avgWin && js.avgLoss ? Math.abs(js.avgWin / js.avgLoss).toFixed(2) : 2}"></label><label class="f">Risiko/Trade %<input id="mp" inputmode="decimal" value="${R.maxRiskPct || 1}"></label><label class="f">Trades<input id="mn" inputmode="numeric" value="100"></label><label class="f">Ruin-Grenze (DD %)<input id="md" inputmode="decimal" value="10"></label></div>
  <div class="row" style="margin-top:12px"><button class="btn pri" id="mgo">Simulieren</button><span class="note">${js.n >= 10 ? `Startwerte aus deinen ${js.n} Journal-Trades.` : 'Startwerte sind Beispielannahmen – ab 10 Journal-Trades nimmt Jarvis deine echten Werte.'}</span></div><div id="mout" style="margin-top:14px"></div></div>`;
  $('#rsave').onclick = () => { Object.assign(R, { maxDayLoss: fnum($('#rl').value) || 0, maxTrades: fnum($('#rt').value) || 0, maxRiskPct: fnum($('#rp').value) || 1, maxLossStreak: fnum($('#rs').value) || 0, rules: $('#rr').value.trim() }); J.store.save('risk'); J.toast('Regeln gespeichert'); J.route(); };
  $('#mgo').onclick = () => {
    const w = (fnum($('#mw').value) || 0) / 100, rw = fnum($('#mr').value) || 1, rp = (fnum($('#mp').value) || 1) / 100, n = fnum($('#mn').value) || 100, ruin = (fnum($('#md').value) || 10) / 100;
    const runs = 2000; let ruined = 0; const finals = [], dds = [], paths = [];
    for (let k = 0; k < runs; k++) { let e = 1, pk = 1, dd = 0, dead = false; const p = k < 30 ? [1] : null; for (let i = 0; i < n; i++) { e *= Math.random() < w ? 1 + rp * rw : 1 - rp; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); if (dd >= ruin) dead = true; p && p.push(e); } if (dead) ruined++; finals.push(e); dds.push(dd); p && paths.push(p); }
    finals.sort((a, b) => a - b); dds.sort((a, b) => a - b); const ev = w * rw - (1 - w);
    $('#mout').innerHTML = `<div class="kpis"><div class="kpi"><span>Erwartung je Trade</span><b class="${cls(ev)}">${num(ev, 2)} R</b></div><div class="kpi"><span>Ruin-Wahrscheinlichkeit</span><b class="${ruined / runs > .1 ? 'dn' : 'up'}">${num(ruined / runs * 100, 1)} %</b><small>DD ≥ ${num(ruin * 100, 0)} %</small></div><div class="kpi"><span>Median Drawdown</span><b>${num(dds[runs / 2] * 100, 1)} %</b></div><div class="kpi"><span>Endkapital Median</span><b>${pct((finals[runs / 2] - 1) * 100, 1)}</b><small>5 %: ${pct((finals[100] - 1) * 100, 1)} · 95 %: ${pct((finals[1900] - 1) * 100, 1)}</small></div></div><div class="fig" id="mfan" style="min-height:240px;margin-top:12px"></div>`;
    LineChart($('#mfan'), paths.map((p, i) => ({ v: p.map(x => (x - 1) * 100), color: p[p.length - 1] >= 1 ? '#2fcf9f' : '#ef5d78', w: 1, alpha: .45 })), { zero: true, fmt: x => num(x, 0) + '%' });
  };
};


/* ===================== Quant Lab ===================== */
V.quant = el => {
  const st = J.S.settings.quant = Object.assign({ sym: 'ar:NAS100', tf: '1h', strat: 'ema', params: {}, dir: 'both', cap: 10000, riskPct: 1, slAtr: 1.5, tpAtr: 3, fee: .02, lev: 5, oos: 30 }, J.S.settings.quant || {});
  let d = null, res = null, resO = null, chart = null; const offs = [];
  const pIn = () => { const S = TA.STRATS[st.strat]; const p = { ...TA.defParams(st.strat), ...(st.params[st.strat] || {}) }; return `<p class="note" style="margin:0 0 8px">${esc(S.desc)}${S.intraday ? ' <b class="gold">Nur Intraday (5m–1h).</b>' : ''}</p><div class="form">${S.params.map(([k, l, def, mn, mx, step]) => `<label class="f">${l}<input type="number" data-p="${k}" value="${p[k]}" min="${mn}" max="${mx}" step="${step}"></label>`).join('')}</div>`; };
  el.innerHTML = `<div class="page-hd"><div><h1>Quant Lab</h1><p class="mut">Strategien automatisch über dein Archiv testen – mit Out-of-Sample, Optimierung und Monte Carlo</p></div></div><div class="split" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr)"><div class="card"><h3>Strategie-Setup</h3>
    <div class="form"><label class="f w2">Symbol<select id="qsym">${J.symOptions(st.sym)}</select></label><label class="f">Zeitrahmen<select id="qtf">${Object.keys(J.TF).map(k => `<option ${k === st.tf ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <label class="f full">Strategie<select id="qstrat">${Object.entries(TA.STRATS).map(([k, s]) => `<option value="${k}" ${k === st.strat ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label></div>
    <div id="qp" style="margin-top:12px">${pIn()}</div><div class="hr"></div>
    <div class="form"><div class="f full"><span class="note">Richtung</span><div class="seg" id="qdir">${[['both', 'Beide'], ['long', 'Nur Long'], ['short', 'Nur Short']].map(([k, l]) => `<button data-d="${k}" class="${k === st.dir ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <label class="f">Kapital<input id="qcap" type="number" value="${st.cap}"></label><label class="f">Risiko/Trade %<input id="qrisk" type="number" step="0.1" value="${st.riskPct}"></label><label class="f">Stop (× ATR)<input id="qsl" type="number" step="0.1" value="${st.slAtr}"></label><label class="f">Ziel (× ATR, 0 = aus)<input id="qtp" type="number" step="0.1" value="${st.tpAtr}"></label><label class="f">Kosten % je Seite<input id="qfee" type="number" step="0.01" value="${st.fee}"></label><label class="f">Max. Hebel<input id="qlev" type="number" value="${st.lev}"></label><label class="f full">Out-of-Sample-Anteil<select id="qoos">${[0, 20, 30, 40, 50].map(v => `<option value="${v}" ${v == st.oos ? 'selected' : ''}>${v ? v + ' % am Ende zurückhalten' : 'aus'}</option>`).join('')}</select></label></div>
    <div class="row" style="margin-top:14px"><button class="btn pri" id="qrun" style="flex:1">Backtest starten</button></div><div class="row" style="margin-top:8px"><button class="btn sm" id="qopt" style="flex:1">Optimieren</button><button class="btn sm" id="qmc" style="flex:1">Monte Carlo</button></div>
    <p class="note">Signale auf Schlusskurs, Ausführung am nächsten Open, Stop vor Ziel bei gleicher Kerze – konservativ, ohne Blick in die Zukunft.</p></div>
  <div class="grid" style="align-content:start"><div class="card" id="qres"><div class="empty"><b>Bereit</b><span>Wähle Markt und Strategie und starte den Backtest – mit echten historischen Kursen.</span></div></div>
  <div class="chartbox" style="height:420px"><div class="ohlc" id="qohlc"></div><div class="cv" id="qcv" style="min-height:0"></div></div>
  <div class="card" id="qextra" style="display:none"></div><div class="card" id="qtrades" style="display:none;padding:6px"></div></div></div>`;
  chart = new JChart($('#qcv'), { tf: st.tf, onHover: i => { const c = chart.c, k = i ?? c.length - 1; $('#qohlc').innerHTML = J.ohlcHtml(c[k], c[k - 1]); } });
  const read = () => { st.sym = $('#qsym').value; st.tf = $('#qtf').value; st.strat = $('#qstrat').value; st.params[st.strat] = Object.fromEntries($$('#qp [data-p]').map(i => [i.dataset.p, +i.value])); st.cap = +$('#qcap').value || 10000; st.riskPct = +$('#qrisk').value || 1; st.slAtr = +$('#qsl').value; st.tpAtr = +$('#qtp').value; st.fee = +$('#qfee').value; st.lev = +$('#qlev').value || 5; st.oos = +$('#qoos').value; J.store.save('settings'); };
  const cfgOf = (from, to) => ({ strat: st.strat, params: { ...TA.defParams(st.strat), ...st.params[st.strat] }, dir: st.dir, cap: st.cap, riskPct: st.riskPct, slAtr: st.slAtr, tpAtr: st.tpAtr, fee: st.fee, lev: st.lev, from, to, off: d.off });
  const getData = async () => { d = await J.load(st.sym, st.sym.startsWith('CSV:') ? 'csv' : st.tf); return d; };
  const kp = (m, title) => `<div class="note" style="margin:6px 0">${title}</div><div class="kpis">${[['Netto', `<span class="${cls(m.netPct)}">${pct(m.netPct)}</span>`, J.money(m.net, 0)], ['Buy & Hold', pct(m.bh), 'gleicher Zeitraum'], ['Trades', m.trades, `Exposure ${num(m.exposure, 0)} %`], ['Trefferquote', m.winRate != null ? num(m.winRate, 1) + ' %' : '–', ''], ['Profit-Faktor', m.pf == null ? '–' : m.pf === Infinity ? '∞' : num(m.pf, 2), ''], ['Ø R', m.avgR != null ? num(m.avgR, 2) : '–', ''], ['Max. Drawdown', `<span class="dn">${num(m.maxDD, 1)} %</span>`, ''], ['Sharpe', m.sharpe != null ? num(m.sharpe, 2) : '–', m.cagr != null ? 'CAGR ' + pct(m.cagr, 1) : '']].map(([a, b, c]) => `<div class="kpi"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join('')}</div>`;
  const run = async () => {
    read(); $('#qres').innerHTML = '<p class="note"><span class="spin"></span> Lade Kurse und rechne …</p>';
    try { await getData(); } catch (e) { $('#qres').innerHTML = J.errBox(e, true); J.bindErr($('#qres'), run, k => { st.sym = k; J.store.save('settings'); J.route(); }); return; }
    const c = d.candles, n = c.length; if (n < 80) { $('#qres').innerHTML = '<p class="note">Zu wenige Kerzen für einen sinnvollen Test (mind. 80).</p>'; return; }
    const split = st.oos ? Math.floor(n * (1 - st.oos / 100)) : n - 1;
    res = TA.backtest(c, cfgOf(1, split)); const m = TA.metrics(res, c);
    resO = st.oos ? TA.backtest(c, cfgOf(split, n - 1)) : null; const mo = resO ? TA.metrics(resO, c) : null;
    const allT = [...res.trades, ...(resO ? resO.trades : [])];
    const warn = TA.STRATS[st.strat].intraday && ['1T', '1W'].includes(d.tf) ? '<p class="chip warn">Diese Strategie ist für Intraday gebaut – auf Tageskerzen ist das Ergebnis nicht aussagekräftig.</p>' : '';
    const degr = mo && m.trades >= 5 && mo.trades >= 3 && m.pf && mo.pf != null ? (mo.pf < m.pf * .6 ? '<span class="chip dn">OOS deutlich schwächer → Überanpassung möglich</span>' : '<span class="chip up">OOS hält stand</span>') : '';
    $('#qres').innerHTML = `<h3>${esc(TA.STRATS[st.strat].name)} · ${esc(J.short(st.sym))} ${esc(d.tf)} <span class="sp"></span><small>${J.date(c[0].t)} – ${J.date(c[n - 1].t)} · ${n} Kerzen</small></h3>${warn}${kp(m, st.oos ? `In-Sample (${100 - st.oos} %)` : 'Gesamter Zeitraum')}${mo ? kp(mo, `Out-of-Sample (${st.oos} %) ${degr}`) : ''}
      <div class="fig" id="qeq" style="min-height:220px;margin-top:14px"></div><div class="row note"><span><i style="display:inline-block;width:14px;height:3px;background:#f2c14e;vertical-align:middle"></i> Strategie</span><span><i style="display:inline-block;width:14px;height:3px;background:#5f6a86;vertical-align:middle"></i> Buy & Hold</span>${st.oos ? '<span>senkrechter Bruch = Beginn Out-of-Sample</span>' : ''}</div>
      <div class="row" style="margin-top:12px"><button class="btn sm" id="qsave">Als Strategie speichern</button><button class="btn gold sm" id="qj">Jarvis: Ergebnis prüfen</button></div><div id="qjout" class="md" style="margin-top:8px"></div>`;
    const eqS = new Array(n).fill(NaN), bh = new Array(n).fill(NaN);
    for (const p of res.curve) eqS[p.i] = (p.eq / st.cap - 1) * 100; let base = res.curve.at(-1)?.eq || st.cap; if (resO) for (const p of resO.curve) eqS[p.i] = ((base * p.eq / st.cap) / st.cap - 1) * 100;
    for (let i = 1; i < n; i++) bh[i] = (c[i].c / c[1].o - 1) * 100;
    offs.splice(0).forEach(f => f()); offs.push(LineChart($('#qeq'), [{ v: bh, color: '#5f6a86', w: 1.4 }, { v: eqS, color: '#f2c14e', w: 2, fill: '#f2c14e30' }], { zero: true, fmt: x => num(x, 0) + '%' }));
    const sig = res.sig; const lines = (sig.lines || []).map((l, k) => ({ v: l[0], color: ['#35d3b6', '#6f8dff', '#e879f9'][k % 3], w: 1.4 }));
    const markers = []; allT.forEach((t, k) => { markers.push({ i: t.ei, side: t.side, price: t.entry, link: 'x' + k }, { id: 'x' + k, i: t.xi, type: 'exit', price: t.exit, win: t.pnl > 0 }); });
    chart.opt.tf = d.tf; chart.set(c, { lines, markers, hlines: st.oos ? [] : [] }); $('#qohlc').innerHTML = J.ohlcHtml(c[n - 1], c[n - 2]);
    $('#qtrades').style.display = 'block';
    $('#qtrades').innerHTML = `<div class="scroll"><table><thead><tr><th>#</th><th>Richtung</th><th>Einstieg</th><th class="r">Kurs</th><th>Ausstieg</th><th class="r">Kurs</th><th>Grund</th><th class="r">R</th><th class="r">P/L</th></tr></thead><tbody>${allT.slice(-150).reverse().map((t, k) => `<tr class="click" data-i="${t.ei}"><td class="note">${allT.length - k}</td><td class="${t.side === 1 ? 'up' : 'dn'}">${t.side === 1 ? 'Long' : 'Short'}</td><td>${J.dt(t.et)}</td><td class="r">${price(t.entry)}</td><td>${J.dt(t.xt)}</td><td class="r">${price(t.exit)}</td><td>${t.why}</td><td class="r ${cls(t.r)}">${t.r != null ? num(t.r, 2) : '–'}</td><td class="r ${cls(t.pnl)}">${J.money(t.pnl, 0)}</td></tr>`).join('')}</tbody></table></div>`;
    $$('#qtrades tr[data-i]').forEach(tr => tr.onclick = () => { chart.end = +tr.dataset.i + chart.n / 2; chart.clampView(); chart.draw(); $('#qcv').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    $('#qsave').onclick = () => { const name = `${TA.STRATS[st.strat].name} ${J.short(st.sym)} ${d.tf}`; const p = cfgOf().params; App.strategies.push({ id: 'q' + J.uid(), name, desc: `${TA.STRATS[st.strat].desc} Quant Lab: ${Object.entries(p).map(([k, v]) => k + ' ' + v).join(', ')} · Netto ${num(m.netPct, 1)} %, PF ${m.pf === Infinity ? '∞' : num(m.pf, 2)}, Max-DD ${num(m.maxDD, 1)} %.`, rules: `${TA.STRATS[st.strat].desc}\nStop ${st.slAtr} × ATR, Ziel ${st.tpAtr} × ATR\nRisiko ${st.riskPct} % pro Trade` }); App.saveStrategies(); J.toast('In deinen Strategien gespeichert', 'good'); };
    $('#qj').onclick = async () => { const out = $('#qjout'); out.innerHTML = '<p class="note"><span class="spin"></span> Jarvis prüft …</p>'; const r2 = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, typeof v === 'number' && isFinite(v) ? +v.toFixed(2) : v]));
      try { const t = await Jarvis.think(`${Jarvis.persona()}\n\nBewerte diesen Backtest kritisch wie ein Quant: Robustheit, Überanpassung (In- vs. Out-of-Sample), Vergleich zu Buy & Hold, Drawdown, Stichprobengröße. Dann 3 konkrete Verbesserungs-Experimente. Max. 220 Wörter.\n\n${JSON.stringify({ strategie: TA.STRATS[st.strat].name, symbol: st.sym, zeitrahmen: d.tf, parameter: cfgOf().params, stopATR: st.slAtr, zielATR: st.tpAtr, kosten: st.fee, inSample: r2(m), outOfSample: r2(mo) })}`, { onText: ({ text }) => out.innerHTML = J.md(text) }); out.innerHTML = J.md(t); } catch (e) { out.innerHTML = `<p class="note">${esc(Jarvis.err(e))}</p>`; } };
  };
  const optimize = async () => {
    read(); const S = TA.STRATS[st.strat]; if (S.params.length < 2) { J.toast('Diese Strategie hat nur einen Parameter – nutze den Backtest.'); }
    try { await getData(); } catch (e) { J.toast(J.errText(e)); return; }
    const c = d.candles, n = c.length, split = st.oos ? Math.floor(n * (1 - st.oos / 100)) : n - 1;
    const [px, py] = [S.params[0], S.params[1] || S.params[0]];
    const span = p => { const cur = { ...TA.defParams(st.strat), ...st.params[st.strat] }[p[0]]; const lo = Math.max(p[3], cur * .4), hi = Math.min(p[4], cur * 2.2); return TA.range(lo, hi, 7, p[5]); };
    const xs = span(px), ys = S.params[1] ? span(py) : [st.params[st.strat]?.[py[0]] ?? py[2]];
    let metric = 'pf';
    const ex = $('#qextra'); ex.style.display = 'block';
    const draw = () => {
      const grid = TA.optimize(c, cfgOf(1, split), px[0], py[0], xs, ys, metric);
      const vals = grid.flat().map(g => g.v).filter(v => v != null && isFinite(v)); const lo = Math.min(...vals), hi = Math.max(...vals);
      const colr = v => { if (v == null || !isFinite(v)) return 'background:var(--side);color:var(--dim)'; const t = hi > lo ? (v - lo) / (hi - lo) : .5; return `background:hsl(${t * 140 + 350},62%,${22 + t * 18}%)`; };
      ex.innerHTML = `<h3>Parameter-Optimierung <small>${st.oos ? 'nur auf In-Sample-Daten' : 'gesamter Zeitraum'}</small><span class="sp"></span><div class="seg" id="qom">${[['pf', 'Profit-Faktor'], ['netPct', 'Netto %'], ['sharpe', 'Sharpe']].map(([k, l]) => `<button data-m="${k}" class="${k === metric ? 'on' : ''}">${l}</button>`).join('')}</div></h3>
      <div class="scroll"><table class="heat"><thead><tr><th>${esc(py[1])} ↓ / ${esc(px[1])} →</th>${xs.map(x => `<th class="r">${x}</th>`).join('')}</tr></thead><tbody>${grid.map(row => `<tr><th>${row[0].y}</th>${row.map(g => `<td class="hc" style="${colr(g.v)}" data-x="${g.x}" data-y="${g.y}" title="${g.m.trades} Trades">${g.v == null ? '–' : num(g.v, metric === 'netPct' ? 0 : 2)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="note">Tippe eine Zelle, um die Parameter zu übernehmen. Suche ein stabiles Plateau statt der einen hellsten Zelle – einzelne Ausreißer sind meist Zufall.</p>`;
      $$('#qom button').forEach(b => b.onclick = () => { metric = b.dataset.m; draw(); });
      $$('#qextra td[data-x]').forEach(td => td.onclick = () => { $(`#qp [data-p="${px[0]}"]`).value = td.dataset.x; if (S.params[1]) $(`#qp [data-p="${py[0]}"]`).value = td.dataset.y; run(); });
    };
    ex.innerHTML = '<p class="note"><span class="spin"></span> Rechne 49 Varianten …</p>'; setTimeout(draw, 30);
  };
  const monte = () => {
    if (!res) return J.toast('Erst Backtest starten');
    const all = [...res.trades, ...(resO ? resO.trades : [])]; const mc = TA.monteCarlo(all, st.cap); const ex = $('#qextra'); ex.style.display = 'block';
    if (!mc) { ex.innerHTML = '<p class="note">Mindestens 5 Trades nötig.</p>'; return; }
    ex.innerHTML = `<h3>Monte Carlo <small>1.000 Bootstrap-Durchläufe der ${all.length} Trades</small></h3><div class="kpis"><div class="kpi"><span>Endkapital 5 %</span><b class="${cls(mc.f5 - st.cap)}">${pct((mc.f5 / st.cap - 1) * 100, 1)}</b><small>schlechte Reihenfolge</small></div><div class="kpi"><span>Endkapital Median</span><b class="${cls(mc.f50 - st.cap)}">${pct((mc.f50 / st.cap - 1) * 100, 1)}</b></div><div class="kpi"><span>Endkapital 95 %</span><b>${pct((mc.f95 / st.cap - 1) * 100, 1)}</b></div><div class="kpi"><span>Drawdown Median</span><b>${num(mc.d50, 1)} %</b></div><div class="kpi"><span>Drawdown 95 %</span><b class="dn">${num(mc.d95, 1)} %</b><small>plane damit</small></div><div class="kpi"><span>Verlust-Wahrscheinlichkeit</span><b>${num(mc.lossProb, 1)} %</b></div></div><div class="fig" id="qmcf" style="min-height:240px;margin-top:12px"></div>`;
    offs.push(LineChart($('#qmcf'), mc.paths.map(p => ({ v: p.map(x => (x / st.cap - 1) * 100), color: p[p.length - 1] >= st.cap ? '#2fcf9f' : '#ef5d78', w: 1, alpha: .4 })), { zero: true, fmt: x => num(x, 0) + '%' }));
  };
  $('#qstrat').onchange = () => { st.strat = $('#qstrat').value; $('#qp').innerHTML = pIn(); };
  $$('#qdir button').forEach(b => b.onclick = () => { st.dir = b.dataset.d; $$('#qdir button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#qrun').onclick = run; $('#qopt').onclick = optimize; $('#qmc').onclick = monte;
  run();
  return () => { chart.destroy(); offs.forEach(f => f()); };
};


/* ===================== Marktregime ===================== */
V.regime = el => {
  let sym = J.S.settings.sym || 'ar:NAS100', tf = '1T', chart;
  el.innerHTML = `<div class="page-hd"><div><h1>Marktregime</h1><p class="mut">Trend oder Seitwärts? Und welche Strategie passt gerade?</p></div></div><div class="split"><div class="chartbox"><div class="chartbar"><div class="symsel"><select id="rsym">${J.symOptions(sym)}</select></div><div class="seg" id="rtf">${['1h', '4h', '1T', '1W'].map(k => `<button data-tf="${k}" class="${k === tf ? 'on' : ''}">${k}</button>`).join('')}</div><div class="sp"></div><div class="row note">${Object.values(TA.REG).map(([l, c]) => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};vertical-align:-1px"></i> ${l}</span>`).join('')}</div></div><div class="ohlc" id="rohlc"></div><div class="cv" id="rcv"></div></div>
  <div class="card glass" id="rnow"><p class="note">Lade …</p></div></div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h3>Statistik je Regime <small>Folge-Rendite über 10 Kerzen</small></h3><div id="rstat"></div></div><div class="card"><h3>Welche Strategie passt? <small>Standard-Parameter, Ø R je Regime beim Einstieg</small></h3><div id="rmat" class="scroll"></div></div></div>`;
  chart = new JChart($('#rcv'), { tf, onHover: i => { const c = chart.c, k = i ?? c.length - 1; $('#rohlc').innerHTML = J.ohlcHtml(c[k], c[k - 1]); } });
  const FIT = { up: 'Trendfolge (EMA-Crossover, Donchian-Breakout) und Pullback-Longs bevorzugen.', down: 'Trendfolge Short oder Abstand halten; Mean-Reversion-Longs meiden.', chop: 'Positionen kleiner, weitere Stops; Bollinger/RSI-Reversion an den Rändern.', calm: 'Mean-Reversion (RSI, Bollinger) funktioniert oft; Ausbrüche scheitern häufiger.' };
  const load = async () => {
    try {
      const d = await J.load(sym, sym.startsWith('CSV:') ? 'csv' : tf); const c = d.candles; const reg = TA.regime(c); const v = TA.closes(c);
      chart.opt.tf = d.tf; chart.set(c, { regime: reg, lines: [{ v: TA.ema(v, 50), color: '#e8edf7aa', w: 1.3 }], vol: false });
      const L = reg[reg.length - 1]; let since = 0; for (let i = reg.length - 1; i >= 0 && reg[i] === L; i--) since++;
      const adx = TA.adx(c); const a = TA.atr(c);
      $('#rnow').innerHTML = L ? `<div class="note">Aktuelles Regime · ${esc(J.short(sym))} ${esc(d.tf)}</div><div class="big" style="color:${TA.REG[L][1]};margin:6px 0">${TA.REG[L][0]}</div><p class="mut">seit ${since} Kerzen · ADX ${num(adx[adx.length - 1], 1)} · ATR ${num(a[a.length - 1] / c[c.length - 1].c * 100, 2)} % vom Kurs</p><div class="hr"></div><p>${FIT[L]}</p><p class="note">Regel: ADX ≥ 22 mit steigender/fallender EMA 50 = Trend, sonst Seitwärts – volatil, wenn die ATR über dem 60. Perzentil des letzten Jahres liegt.</p>` : '<p class="note">Zu wenige Kerzen für die Regime-Erkennung.</p>';
      const st = {}; for (let i = 0; i < c.length - 10; i++) { const r = reg[i]; if (!r) continue; const f = (c[i + 10].c / c[i].c - 1) * 100; (st[r] = st[r] || []).push(f); }
      const tot = Object.values(st).reduce((s, x) => s + x.length, 0) || 1;
      $('#rstat').innerHTML = `<table><thead><tr><th>Regime</th><th class="r">Anteil</th><th class="r">Ø Folge-Rendite</th><th class="r">positiv</th></tr></thead><tbody>${Object.keys(TA.REG).map(k => { const x = st[k] || []; const avg = x.reduce((s, y) => s + y, 0) / (x.length || 1); return `<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${TA.REG[k][1]}"></i> ${TA.REG[k][0]}</td><td class="r">${num(x.length / tot * 100, 0)} %</td><td class="r ${cls(avg)}">${x.length ? pct(avg) : '–'}</td><td class="r">${x.length ? num(x.filter(y => y > 0).length / x.length * 100, 0) + ' %' : '–'}</td></tr>`; }).join('')}</tbody></table>`;
      const rows = Object.entries(TA.STRATS).filter(([k, s]) => !s.intraday || !['1T', '1W'].includes(d.tf)).map(([k, s]) => { const r = TA.backtest(c, { strat: k, params: TA.defParams(k), dir: 'both', cap: 10000, riskPct: 1, slAtr: 1.5, tpAtr: 3, fee: .02, off: d.off }); const by = {}; for (const t of r.trades) { const g = reg[t.ei]; if (!g || t.r == null) continue; (by[g] = by[g] || []).push(t.r); } return [s.name, by]; });
      $('#rmat').innerHTML = `<table><thead><tr><th>Strategie</th>${Object.values(TA.REG).map(r => `<th class="r">${r[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(([n, by]) => `<tr><td>${esc(n)}</td>${Object.keys(TA.REG).map(k => { const x = by[k] || []; const avg = x.reduce((s, y) => s + y, 0) / (x.length || 1); return `<td class="r ${x.length ? cls(avg) : ''}">${x.length ? num(avg, 2) + ' R' : '–'}<div class="note">${x.length ? x.length + ' Trades' : ''}</div></td>`; }).join('')}</tr>`).join('')}</tbody></table><p class="note">Stop 1,5 × ATR, Ziel 3 × ATR. Wenige Trades = wenig Aussagekraft.</p>`;
    } catch (e) { $('#rnow').innerHTML = J.errBox(e, true); J.bindErr($('#rnow'), load, k => { sym = k; load(); }); }
  };
  $('#rsym').onchange = e => { sym = e.target.value; load(); };
  $$('#rtf button').forEach(b => b.onclick = () => { tf = b.dataset.tf; $$('#rtf button').forEach(x => x.classList.toggle('on', x === b)); load(); });
  load();
  return () => chart.destroy();
};


/* ===================== Research Desk ===================== */
V.research = el => {
  let sel = J.S.notes[0]?.id || null, q = '';
  const render = () => {
    const N = J.S.notes.filter(n => !q || (n.title + n.body + n.tags).toLowerCase().includes(q.toLowerCase()));
    const n = J.S.notes.find(x => x.id === sel);
    $('#rl').innerHTML = N.length ? N.map(x => `<button class="btn ghost" style="width:100%;justify-content:flex-start;text-align:left;height:auto;padding:10px;${x.id === sel ? 'background:var(--hover)' : ''}" data-n="${x.id}"><span><b>${esc(x.title || 'Ohne Titel')}</b><br><span class="note">${J.dt(x.t)}${x.tags ? ' · ' + esc(x.tags) : ''}</span></span></button>`).join('') : '<p class="note">Keine Notizen.</p>';
    $$('#rl [data-n]').forEach(b => b.onclick = () => { sel = b.dataset.n; render(); });
    $('#re').innerHTML = n ? `<input id="rtitle" value="${esc(n.title)}" placeholder="Titel" style="font:600 18px var(--ft)"><input id="rtags" value="${esc(n.tags || '')}" placeholder="Tags, z. B. NQ, Fed, Setup" style="margin-top:8px"><textarea id="rbody" style="margin-top:8px;min-height:340px">${esc(n.body)}</textarea><div class="row" style="margin-top:8px"><button class="btn ghost sm" id="rdel" style="color:var(--bear)">Löschen</button><div class="sp"></div><span class="note">wird automatisch gespeichert</span></div>` : '<div class="empty"><b>Keine Notiz gewählt</b><span>Lege eine Notiz an oder lass Jarvis recherchieren.</span></div>';
    if (n) { const save = J.debounce(() => { n.title = $('#rtitle').value; n.tags = $('#rtags').value; n.body = $('#rbody').value; n.t = Date.now(); J.store.save('notes'); }, 600); ['rtitle', 'rtags', 'rbody'].forEach(i => $('#' + i).oninput = save); $('#rdel').onclick = async () => { if (await J.confirm('Notiz löschen?', n.title || 'Ohne Titel', 'Löschen')) { J.S.notes = J.S.notes.filter(x => x.id !== n.id); sel = J.S.notes[0]?.id; J.store.save('notes'); render(); } }; }
  };
  el.innerHTML = `<div class="page-hd"><div><h1>Research Desk</h1><p class="mut">Recherchen und Notizen – synchron auf allen Geräten</p></div></div><div class="card glass"><h3>Jarvis recherchiert für dich</h3>${J.brainHint()}<form id="rf" class="row nw"><input id="rq" placeholder="z. B. Was bedeutet das Anthropic-IPO für den Nasdaq? / Wie trade ich die FOMC-Minutes?"><button class="btn gold">Recherche</button></form><div id="rjl" class="note" style="margin-top:8px">Jarvis sucht im Web, holt bei Bedarf echte Kurse und speichert die Antwort mit Quellen als Notiz.</div></div>
  <div class="split" style="margin-top:16px;grid-template-columns:minmax(0,1fr) minmax(0,2fr)"><div class="card"><h3>Notizen <span class="sp"></span><button class="btn sm" id="rnew">${J.icon('plus')}Neu</button></h3><input id="rsearch" placeholder="Suchen" style="margin-bottom:8px"><div id="rl" style="display:grid;gap:4px;max-height:520px;overflow:auto"></div></div><div class="card" id="re"></div></div>`;
  $('#rsearch').oninput = e => { q = e.target.value; render(); };
  $('#rnew').onclick = () => { const n = { id: J.uid(), t: Date.now(), title: '', tags: '', body: '' }; J.S.notes.unshift(n); sel = n.id; J.store.save('notes'); render(); };
  $('#rf').onsubmit = async e => {
    e.preventDefault(); const qq = $('#rq').value.trim(); if (!qq) return; const log = $('#rjl'); log.innerHTML = '<span class="spin"></span> Jarvis recherchiert …'; const used = [];
    const tools = Jarvis.tools().filter(t => ['web_suche', 'kurs_daten'].includes(t.name)).map(t => ({ ...t, execute: async (inp) => { used.push(t.name === 'web_suche' ? 'Websuche: ' + (inp.suchbegriffe || []).join(', ') : 'Kurse: ' + inp.symbol); log.innerHTML = '<span class="spin"></span> ' + esc(used[used.length - 1]); const r = await t.execute(inp); return r; } }));
    try {
      const ctx = Jarvis.canTools() ? null : await Jarvis.context(qq);
      const text = await Jarvis.think(`${Jarvis.persona()}\n\nRecherchiere gründlich${Jarvis.canTools() ? ' mit den Werkzeugen (mindestens eine Websuche)' : ' im Web'} und beantworte: „${qq}“. Struktur: ### Kurzantwort, ### Details, ### Was das für meinen Handel heißt, ### Quellen (als [Titel](URL)). Max. 400 Wörter.${ctx && Object.keys(ctx).length ? '\n\nEchte Daten aus meinem Terminal (JSON): ' + JSON.stringify(ctx) : ''}`, { tools: Jarvis.canTools() ? tools : undefined, search: true });
      const n = { id: J.uid(), t: Date.now(), title: qq.slice(0, 90), tags: 'Jarvis', body: text + (used.length ? '\n\n— Werkzeuge: ' + used.join(' · ') : '') }; J.S.notes.unshift(n); sel = n.id; J.store.save('notes'); render(); log.textContent = 'Fertig – als Notiz gespeichert.'; $('#rq').value = ''; 
    } catch (err) { log.textContent = Jarvis.err(err); }
  };
  render();
};


/* ===================== Intelligence Copilot ===================== */
V.copilot = el => {
  const S = J.S.settings; let busy = false, ctrl = null;
  const ai = Jarvis.ai();
  el.innerHTML = `<div class="page-hd"><div><h1>Intelligence Copilot</h1><p class="mut">Jarvis – dein Trading-Gehirn</p></div></div>
  <div class="split" style="grid-template-columns:minmax(0,1fr) minmax(0,1.6fr)"><div class="grid" style="align-content:start">
    <div class="card glass" style="text-align:center"><div class="orb-big"><canvas id="orbbig"></canvas></div><div class="mid gold" style="margin-top:6px">J.A.R.V.I.S.</div><p class="note" id="jst"></p>
      <div class="row" style="justify-content:center"><label class="row nw note"><input type="checkbox" id="jspk" ${S.speak ? 'checked' : ''}> Antworten vorlesen</label><select id="jvoice" style="width:auto;min-height:36px;padding:4px 8px;font-size:14px"></select></div>
      <label class="f" style="margin-top:8px">Sprechtempo <input type="range" id="jrate" min="0.7" max="1.5" step="0.1" value="${S.rate || 1}"></label></div>
    <div class="card"><h3>Jarvis verbinden <span class="sp"></span><span class="chip ${Jarvis.brain() ? 'up' : 'warn'}" id="jbrain">${esc(Jarvis.brainLabel())}</span></h3>
      <p class="note">Kostenlos: Erstelle in <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> einen API-Key und füge ihn hier ein. Der Key bleibt nur auf diesem Gerät gespeichert (nicht im Sync). In Claude geöffnet denkt Jarvis automatisch mit Claude.</p>
      <div class="form"><label class="f">Anbieter<select id="aprov"><option value="gemini" ${ai.provider === 'gemini' ? 'selected' : ''}>Gemini (Google, kostenlos)</option><option value="openrouter" ${ai.provider === 'openrouter' ? 'selected' : ''}>OpenRouter (Free-Modelle)</option></select></label>
      <label class="f">Modell<input id="amodel" value="${esc(ai.provider === 'openrouter' ? ai.omodel : ai.gmodel)}"></label>
      <label class="f full">API-Key<input id="akey" type="password" autocomplete="off" value="${esc(ai.provider === 'openrouter' ? ai.openrouter : ai.gemini)}" placeholder="Key einfügen"></label>
      <label class="f full row nw" style="flex-direction:row;align-items:center"><input type="checkbox" id="asearch" ${ai.search ? 'checked' : ''}> Websuche erlauben (Gemini mit Google-Suche)</label></div>
      <div class="row" style="margin-top:10px"><button class="btn pri sm" id="asave">Speichern & testen</button><span class="note" id="atest"></span></div></div></div>
  <div class="card" style="display:flex;flex-direction:column;min-height:min(640px,calc(100dvh - 200px))"><h3>Gespräch <span class="sp"></span><button class="btn sm ghost" id="jclr">Leeren</button></h3><div class="chat" id="jchat" style="flex:1;overflow:auto;padding:4px"></div>
    <div class="row" id="jchips" style="margin:10px 0;gap:6px">${['Wie steht der Nasdaq gerade?', 'Was ist heute wichtig an den Märkten?', 'Werte mein Journal aus', 'Backtest: Donchian-Breakout auf Nasdaq, Tageschart', 'Darf ich heute noch traden?'].map(q => `<button class="chip" style="cursor:pointer;min-height:32px">${q}</button>`).join('')}</div>
    <form id="jf" class="row nw">${Jarvis.canListen() ? `<button type="button" class="btn" id="jmic" aria-label="Sprechen">${J.icon('mic')}</button>` : ''}<textarea id="jin" placeholder="Frag Jarvis …" style="min-height:48px;height:48px;resize:none"></textarea><button class="btn gold" id="jsend" aria-label="Senden">${J.icon('send')}</button></form></div></div>`;
  const stopOrb = Jarvis.orb($('#orbbig'), true);
  const status = () => { $('#jst').textContent = !Jarvis.brain() ? 'Noch kein Gehirn verbunden – Key unten eintragen.' : Jarvis.state === 'speak' ? 'Jarvis spricht …' : Jarvis.state === 'listen' ? 'Ich höre zu …' : Jarvis.state === 'think' ? 'Jarvis denkt …' : 'Bereit. Frag mich nach Märkten, deinem Journal oder lass mich einen Backtest rechnen.'; };
  const offOrb = J.on('orb', status); Jarvis.ready.then(() => { status(); $('#jbrain').textContent = Jarvis.brainLabel(); });
  const fillVoices = () => { const vs = Jarvis.voices(); $('#jvoice').innerHTML = Jarvis.tts ? '<option>Claude-Stimme</option>' : vs.length ? vs.map(v => `<option value="${esc(v.name)}" ${v.name === S.voice ? 'selected' : ''}>${esc(v.name)}</option>`).join('') : '<option>Gerätestimme</option>'; };
  fillVoices(); if (window.speechSynthesis) speechSynthesis.onvoiceschanged = fillVoices;
  const chat = J.S.chat;
  const bubble = m => m.role === 'user' ? `<div class="msg u">${esc(m.content)}</div>` : `<div class="msg a"><div class="who">JARVIS</div>${m.tools?.length ? m.tools.map(t => `<div class="tool">⟢ ${esc(t)}</div>`).join('') : ''}<div class="md">${J.md(m.content)}</div></div>`;
  const render = () => { $('#jchat').innerHTML = chat.length ? chat.map(bubble).join('') : `<div class="empty"><b>${J.greet()}, ${esc(S.name)}.</b><span>Ich bin Jarvis. Was willst du heute wissen?</span></div>`; $('#jchat').scrollTop = 1e9; };
  render();
  const send = async (text) => {
    if (busy || !text.trim()) return; busy = true; $('#jsend').disabled = true;
    chat.push({ role: 'user', content: text.trim() }); const msg = { role: 'assistant', content: '', tools: [] }; chat.push(msg); render();
    const hist = chat.slice(-14, -1).filter(m => m.content); while (hist.length && hist[0].role !== 'user') hist.shift();
    let extra = '';
    if (!Jarvis.canTools() && Jarvis.brain()) { msg.tools.push('lese deine Terminal-Daten …'); render(); try { const ctx = await Jarvis.context(text); if (Object.keys(ctx).length) { extra = '\n\nECHTE DATEN AUS DEM TERMINAL (JSON):\n' + JSON.stringify(ctx).slice(0, 14000); msg.tools = Object.keys(ctx).map(k => k.replace('kurse_', 'Kurse ').replace('_', ' ')); } else msg.tools = []; } catch { msg.tools = []; } render(); }
    const msgs = hist.map((m, i) => ({ role: m.role, content: (i === 0 ? `${Jarvis.persona()}\nNutze für jede Zahl Werkzeuge oder die mitgeschickten Daten. Antworte in höchstens ~180 Wörtern, außer es wird mehr verlangt.\n\n` : '') + m.content + (i === hist.length - 1 ? extra : '') }));
    const tools = Jarvis.canTools() ? Jarvis.tools().map(t => ({ ...t, execute: async inp => { msg.tools.push(`${t.name}${inp.symbol ? ' · ' + inp.symbol : inp.strategie ? ' · ' + inp.strategie : ''}`); render(); try { return await t.execute(inp); } catch (e) { return { fehler: J.errText(e) }; } } })) : undefined;
    ctrl = new AbortController();
    try { const out = await Jarvis.think(msgs, { tools, search: /news|nachricht|heute|warum|aktuell|fed|ipo|earnings|zahlen/i.test(text), signal: ctrl.signal, onText: ({ text }) => { msg.content = text; const last = $('#jchat')?.lastElementChild; if (last) { last.querySelector('.md').innerHTML = J.md(text); $('#jchat').scrollTop = 1e9; } } }); msg.content = out; render(); Jarvis.speak(out); }
    catch (e) { msg.content = Jarvis.err(e); render(); }
    J.S.chat = chat.slice(-40); J.store.save('chat'); busy = false; if ($('#jsend')) $('#jsend').disabled = false; status();
  };
  $('#jf').onsubmit = e => { e.preventDefault(); const v = $('#jin').value; $('#jin').value = ''; send(v); };
  $('#jin').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#jf').requestSubmit(); } };
  const mic = $('#jmic'); if (mic) mic.onclick = async () => { try { const t = await Jarvis.listen(); $('#jin').value = t; if (t) send(t), $('#jin').value = ''; } catch (e) { J.toast(e.message); } };
  $$('#jchips .chip').forEach(c => c.onclick = () => send(c.textContent));
  $('#jclr').onclick = () => { chat.length = 0; J.S.chat = chat; J.store.save('chat'); render(); };
  $('#jspk').onchange = e => { S.speak = e.target.checked; J.store.save('settings'); if (S.speak) Jarvis.speak('Sprachausgabe aktiviert.', true); };
  $('#jvoice').onchange = e => { S.voice = e.target.value; J.store.save('settings'); Jarvis.speak('So klinge ich jetzt.', true); };
  $('#jrate').onchange = e => { S.rate = +e.target.value; J.store.save('settings'); };
  $('#aprov').onchange = e => { const a = Jarvis.ai(); $('#amodel').value = e.target.value === 'openrouter' ? a.omodel : a.gmodel; $('#akey').value = e.target.value === 'openrouter' ? a.openrouter : a.gemini; };
  $('#asave').onclick = async () => {
    const a = Jarvis.ai(); a.provider = $('#aprov').value; a.search = $('#asearch').checked;
    if (a.provider === 'openrouter') { a.openrouter = $('#akey').value.trim(); a.omodel = $('#amodel').value.trim() || a.omodel; } else { a.gemini = $('#akey').value.trim(); a.gmodel = $('#amodel').value.trim() || a.gmodel; }
    Jarvis.saveAi(a); $('#jbrain').textContent = Jarvis.brainLabel(); $('#jbrain').className = 'chip ' + (Jarvis.brain() ? 'up' : 'warn'); status();
    if (!Jarvis.brain()) return; $('#atest').innerHTML = '<span class="spin"></span> teste …';
    try { const t = await Jarvis.think('Antworte nur mit: Jarvis online.'); $('#atest').textContent = '✓ ' + t.slice(0, 60); } catch (e) { $('#atest').textContent = Jarvis.err(e); }
  };
  return () => { stopOrb(); offOrb(); ctrl && ctrl.abort(); Jarvis.stop(); if (window.speechSynthesis) speechSynthesis.onvoiceschanged = null; };
};

}
