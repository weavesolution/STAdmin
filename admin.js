/* ST Admin — master control for Shani Traders.
   Keeps a copy of all data on this phone and asks the server only for what changed. */
(() => {
  'use strict';
  const S = window.SHOP || {};
  const APP_VERSION = '4.1';
  // No pinch zoom on iPhone either (Android follows the viewport setting)
  ['gesturestart', 'gesturechange'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));

  const NEED_SERVER = '4.1';   // Code.gs version this admin expects
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const num = v => { if (v === '' || v == null) return ''; const n = Number(String(v).replace(/[^\d.\-]/g, '')); return isFinite(n) ? n : ''; };
  const bool = (v, d) => v === true || v === false ? v : (v === '' || v == null ? d : ['TRUE', '1', 'YES', 'Y'].includes(String(v).trim().toUpperCase()));
  const when = iso => { try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5z"/><path d="M4 7.5 12 11l8-3.5M12 11v9"/></svg>';
  const imgUrl = v => !v ? '' : (/^(https?:|images\/)/i.test(v) ? v : 'images/' + v);
  const thumb = v => `<span class="ico">${ICON}</span>${imgUrl(v) ? `<img src="${esc(imgUrl(v))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}`;
  const parseOpts = v => { try { const a = typeof v === 'string' ? (v.trim() ? JSON.parse(v) : []) : v; return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  let toastT;
  function toast(m) {
    let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.style.bottom = '84px'; document.body.appendChild(el); }
    el.textContent = m; requestAnimationFrame(() => el.classList.add('show')); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2800);
  }

  /* ---------- Local copy of the data ---------- */
  const DKEY = 'sta_data_v2';
  try { localStorage.removeItem('sta_data_v1'); } catch (e) { }
  const blankDB = () => ({ api: S.apiUrl, since: 0, v: '', orders: {}, customers: {}, reds: {}, products: [], gifts: [], categories: [], offers: [], settings: [] });
  let DB = (() => { try { return JSON.parse(localStorage.getItem(DKEY)) || null; } catch (e) { return null; } })() || blankDB();
  if (DB.api !== S.apiUrl) DB = blankDB();   // a different Google Sheet: start fresh
  DB.offers = DB.offers || [];
  function saveDB() {
    try { localStorage.setItem(DKEY, JSON.stringify(DB)); }
    catch (e) {  // phone storage full: keep the newest 1500 orders
      const keep = Object.values(DB.orders).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 1500);
      DB.orders = {}; keep.forEach(o => { DB.orders[o.orderId] = o; });
      try { localStorage.setItem(DKEY, JSON.stringify(DB)); } catch (e2) { }
    }
  }
  const normOrder = o => { const x = { ...o, orderId: String(o.orderId), phone: String(o.phone) }; if (typeof x.items === 'string') { try { x.items = JSON.parse(x.items || '[]'); } catch (e) { x.items = []; } } delete x.itemsText; return x; };
  const stNorm = s => (s === 'Delivered' || s === 'Cancelled') ? s : 'Placed';

  /* ---------- Server ---------- */
  let key = sessionStorage.getItem('st_admin_key') || localStorage.getItem('st_admin_key') || '';
  async function call(action, body = {}) {
    let r;
    try { r = await fetch(S.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, key, ...body }) }); }
    catch (e) { throw new Error('No internet. Your changes were not saved.'); }
    const j = await r.json();
    if (!j.ok) {
      if (/admin key/i.test(j.error || '')) { localStorage.removeItem('st_admin_key'); sessionStorage.removeItem('st_admin_key'); alert('Session ended. Sign in again.'); location.reload(); }
      throw new Error(j.error === 'BUSY' ? 'The server is busy. Try again in a moment.' : (j.error || 'Request failed'));
    }
    if (j.v !== undefined && !j.products && DB.products.length && action !== 'admin_sync') DB.vPending = j.v;
    return j;
  }
  let syncing = false;
  async function sync(quiet) {
    if (syncing) return; syncing = true;
    const pill = $('#sync'); pill.hidden = false; pill.textContent = 'Syncing…';
    try {
      const j = await call('admin_sync', { since: DB.since, v: DB.vPending && DB.vPending !== DB.v ? '' : DB.v });
      const first = !DB.since;
      const fresh = j.orders.filter(o => !DB.orders[String(o.orderId)] && stNorm(o.status) === 'Placed');
      const newReds = j.redemptions.filter(r => !DB.reds[r.redeemId] && r.status === 'Requested').length;
      j.orders.forEach(o => { DB.orders[String(o.orderId)] = normOrder(o); });
      j.customers.forEach(c => { DB.customers[String(c.phone)] = c; });
      j.redemptions.forEach(r => { DB.reds[r.redeemId] = r; });
      if (j.products) { DB.products = j.products; DB.gifts = j.gifts; DB.categories = j.categories; DB.offers = j.offers || []; DB.settings = j.settings; dirty = {}; }
      DB.since = j.now; DB.v = j.v; delete DB.vPending; saveDB();
      // Redraw only what changed, so typing in a box is never interrupted
      if (j.orders.length || j.customers.length || j.redemptions.length) { renderOrders(); renderCustomers(); renderReds(); }
      if (j.products) { renderItems(true); renderCats(); renderGifts(); renderOffers(); renderSettings(); }
      if (!first && (fresh.length || newReds)) alertNew(fresh, newReds);
      pill.textContent = 'Synced ' + new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    } catch (err) { pill.textContent = 'Offline'; if (!quiet) toast(err.message); }
    syncing = false;
  }

  /* ---------- Sign in ---------- */
  $('#lf').addEventListener('submit', async e => {
    e.preventDefault();
    key = $('#key').value.trim(); if (!key) return;
    const b = $('#lf .btn'); b.disabled = true; b.textContent = 'Signing in…';
    try { await call('admin_login'); localStorage.setItem('st_admin_key', key); start(); }
    catch (err) { $('#lmsg').innerHTML = `<p class="msg err">${esc(err.message)}</p>`; }
    b.disabled = false; b.textContent = 'Sign in';
  });
  $('#logout').addEventListener('click', () => {
    if (!confirm('Sign out from ST Admin on this phone?')) return;
    localStorage.removeItem('st_admin_key'); sessionStorage.removeItem('st_admin_key'); localStorage.removeItem(DKEY); location.reload();
  });
  /* Check that Google Apps Script has the matching Code.gs; explain how to fix it if not */
  async function checkServer() {
    const w = $('#srvwarn');
    try {
      const r = await fetch(S.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'ping' }) });
      const j = await r.json();
      if (j.ok && j.server && !(Number(j.server) < Number(NEED_SERVER))) { w.hidden = true; return true; }
      w.innerHTML = `<b>Google Apps Script still has an old Code.gs</b>${j.server ? ` (version ${esc(j.server)})` : ''}. Saving, photos and sync will not work until it is updated:
        <ol><li>Open the Google Sheet › Extensions › Apps Script.</li><li>Select all the code, delete it, paste the new Code.gs, press Save.</li>
        <li>Run <b>setup</b> once and allow permissions.</li><li>Deploy › <b>Manage deployments</b> › pencil icon › Version: <b>New version</b> › Deploy.
        Do not use “New deployment”; that makes a new link the apps do not know.</li></ol><button class="btn sm" data-sync>Check again</button>`;
    } catch (e) { w.innerHTML = '<b>Cannot reach Google Apps Script.</b> Check the internet, and that apiUrl in config.js is the /exec link of your deployment.'; }
    w.hidden = false; return false;
  }
  /* Checks for new orders every 30 seconds while ST Admin is open (every minute in the background).
     Each check costs almost nothing on Google's side when nothing has changed. */
  let tick = 0;
  function start() {
    $('#login').hidden = true; $('#app').hidden = false; $('#logout').hidden = false;
    renderAll(); checkServer().then(ok => { if (ok) sync(); });
    starterLoad();
    setInterval(() => { tick++; if (document.visibilityState === 'visible' || tick % 2 === 0) sync(true); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { sync(true); clearBadge(); } });
    window.addEventListener('focus', clearBadge);
  }

  /* ---------- New order alert: sound, vibration, phone notification ---------- */
  const PREF = (() => { try { return JSON.parse(localStorage.getItem('sta_prefs')) || {}; } catch (e) { return {}; } })();
  const savePref = () => { try { localStorage.setItem('sta_prefs', JSON.stringify(PREF)); } catch (e) { } };
  if (PREF.sound === undefined) PREF.sound = true;
  let actx = null;
  const unlockAudio = () => { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { } };
  document.addEventListener('pointerdown', unlockAudio, { capture: true });
  function chime() {
    if (!PREF.sound) return;
    try {
      unlockAudio(); if (!actx) return;
      const t0 = actx.currentTime;
      [0, 0.9, 1.8].forEach(rep => [[880, 0], [1175, 0.16], [1568, 0.32]].forEach(([f, d]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
        const st = t0 + rep + d; g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.6, st + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.5);
        o.start(st); o.stop(st + 0.55);
      }));
    } catch (e) { }
  }
  let unseen = 0;
  function clearBadge() { unseen = 0; document.title = 'ST Admin'; try { navigator.clearAppBadge && navigator.clearAppBadge(); } catch (e) { } }
  async function alertNew(fresh, newReds) {
    const n = fresh.length;
    const title = n ? (n === 1 ? `New order from ${fresh[0].name}` : `${n} new orders`) : `${newReds} new gift request${newReds > 1 ? 's' : ''}`;
    const body = n ? fresh.map(o => `${o.orderId} · ${o.village || ''} · ${inr(amt(o))}`).join('\n') : 'Open ST Admin › Gifts';
    toast(title); chime();
    try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 600]); } catch (e) { }
    if (document.visibilityState !== 'visible') { unseen += n || newReds; document.title = `(${unseen}) ST Admin`; try { navigator.setAppBadge && navigator.setAppBadge(unseen); } catch (e) { } }
    if (window.Notification && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const opt = { body, icon: 'images/admin-192.png', badge: 'images/admin-192.png', tag: 'st-order', renotify: true, vibrate: [300, 150, 300], requireInteraction: true, data: { order: n === 1 ? fresh[0].orderId : '' } };
        if (reg) await reg.showNotification(title, opt); else new Notification(title, opt);
      } catch (e) { }
    }
  }
  navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'open-order') { $('[data-tab=orders]').click(); if (e.data.order && DB.orders[e.data.order]) openOrder(e.data.order); }
  });
  /* Counter mode: keeps the screen on so alerts never stop while the phone sits at the counter */
  let wake = null;
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
      else if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) { }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && PREF.awake && !wake) keepAwake(true); });
  document.addEventListener('click', e => { if (e.target.closest('[data-sync]')) checkServer().then(ok => { if (ok) sync(); }); });

  /* Install as its own app */
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#install').hidden = false; });
  $('#install').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#install').hidden = true; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });

  /* ---------- Tabs ---------- */
  let pane = 'orders';
  $('.atabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    pane = b.dataset.tab;
    $$('.atabs [data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
    $$('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== pane; });
    bar();
  });
  function renderAll() { renderOrders(); renderItems(); renderCats(); renderCustomers(); renderGifts(); renderReds(); renderOffers(); renderSettings(); }

  /* ================= Orders ================= */
  const orders = () => Object.values(DB.orders).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const amt = o => Number(o.finalAmount) || Number(o.estTotal) || 0;
  function renderOrders() {
    const all = orders();
    const newN = all.filter(o => stNorm(o.status) === 'Placed').length;
    $('#n-orders').textContent = newN || '';
    const today = new Date().toDateString(), tod = all.filter(o => new Date(o.createdAt).toDateString() === today && stNorm(o.status) !== 'Cancelled');
    $('#ostats').innerHTML = `<span><b>${newN}</b> new</span><span><b>${tod.length}</b> today</span><span><b>${inr(tod.reduce((s, o) => s + amt(o), 0))}</b> today</span>`;
    const f = $('#ofilter').value, q = $('#oq').value.trim().toLowerCase();
    const list = all.filter(o => (f === 'all' || stNorm(o.status) === f) && (!q || [o.orderId, o.name, o.phone, o.village].join(' ').toLowerCase().includes(q)));
    $('#olist').innerHTML = list.length ? list.slice(0, 300).map(o => `<button class="orow s-${stNorm(o.status)}" data-oid="${esc(o.orderId)}">
        <span class="o1"><b>${esc(o.name)}</b><small>${esc(o.orderId)} · ${esc(o.village || '')} · ${(o.items || []).length} items</small></span>
        <span class="o2"><b>${inr(amt(o))}</b><small>${esc(when(o.createdAt))}</small></span>
        <span class="badge b-${stNorm(o.status)}">${stNorm(o.status) === 'Placed' ? 'New' : esc(stNorm(o.status))}</span></button>`).join('')
      : `<div class="empty"><h2>No orders here</h2><p>${f === 'Placed' ? 'New orders appear here and are emailed to you.' : 'Nothing matches.'}</p></div>`;
  }
  $('#ofilter').addEventListener('change', renderOrders);
  $('#oq').addEventListener('input', renderOrders);
  const odlg = $('#odlg');
  $('#olist').addEventListener('click', e => { const b = e.target.closest('[data-oid]'); if (b) openOrder(b.dataset.oid); });
  function openOrder(id) {
    const o = DB.orders[id]; if (!o) return;
    const its = o.items || [], st = stNorm(o.status), est = Number(o.estPoints) || 0;
    const msg = `Namaste ${o.name} ji, Shani Traders: your order ${o.orderId} is ${st === 'Placed' ? 'received' : st.toLowerCase()}.` + (o.finalAmount ? ` Bill: ₹${o.finalAmount}.` : '') +
      `\nनमस्ते ${o.name} जी, शनि ट्रेडर्स: आपका ऑर्डर ${o.orderId} ${st === 'Delivered' ? 'डिलीवर हो गया' : st === 'Cancelled' ? 'रद्द हो गया' : 'मिल गया है'}।` + (o.finalAmount ? ` बिल: ₹${o.finalAmount}।` : '');
    const cust = DB.customers[o.phone];
    $('#obody').innerHTML = `<div class="dh"><h2>${esc(o.orderId)} <span class="badge b-${st}">${st === 'Placed' ? 'New' : st}</span></h2><button class="btn sm ghost" data-oclose>Close</button></div>
      <div class="db">
        <p class="muted">${esc(when(o.createdAt))}${o.needBy ? ' · needed: ' + esc(o.needBy) : ''}</p>
        <p style="margin:6px 0 10px"><b>${esc(o.name)}</b> · ${esc(o.phone)}${cust ? ` · ${Number(cust.points || 0)} pts` : ''}<br>${esc([o.address, o.landmark, o.village].filter(Boolean).join(', '))}</p>
        <div class="btns" style="margin-bottom:12px"><a class="btn sm ghost" href="tel:+91${esc(o.phone)}">Call</a>
          <a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/91${esc(o.phone)}?text=${encodeURIComponent(msg)}">WhatsApp status</a></div>
        <table class="otable">${its.map(i => `<tr><td>${esc(i.name)}</td><td class="r">${esc(i.qty)} ${esc(i.unit)}</td><td class="r">${i.price ? inr(i.price * i.qty) : '<span class="red">price?</span>'}</td></tr>`).join('')}
          <tr class="tot"><td>Estimate</td><td></td><td class="r">${inr(o.estTotal)}</td></tr></table>
        ${o.note ? `<p class="muted">Note: ${esc(o.note)}</p>` : ''}
        <p class="muted">${Number(o.pointsCredited) ? `${o.pointsCredited} points given` : `${est} points on delivery`}</p>
        <div class="field" style="margin-top:12px"><span style="font-weight:600;font-size:.92rem">Status</span>
          <div class="opts">${['Placed', 'Delivered', 'Cancelled'].map(s => `<label><input type="radio" name="ost" value="${s}"${s === st ? ' checked' : ''}><span>${s === 'Placed' ? 'Order placed' : s}</span></label>`).join('')}</div></div>
        <div class="row2"><div class="field"><label for="ofa">Bill amount ₹</label><input id="ofa" type="number" inputmode="decimal" min="0" value="${esc(o.finalAmount)}" placeholder="${esc(o.estTotal)}"></div>
          <div class="field"><label for="ofp">Points to give</label><input id="ofp" type="number" inputmode="numeric" min="0" value="${esc(o.finalPoints)}" placeholder="${est}"></div></div>
        <p class="muted" style="font-size:.82rem">Points are added when you save it as Delivered, and taken back if it is cancelled later.</p>
      </div>
      <div class="df"><span style="flex:1"></span><button class="btn sm ghost" data-oclose>Cancel</button><button class="btn sm" id="osave">Save</button></div>`;
    $$('[data-oclose]', odlg).forEach(b => b.onclick = () => odlg.close());
    $('#osave').onclick = async () => {
      const status = ($('input[name=ost]:checked') || {}).value || st;
      const body = { orderId: id, status, finalAmount: $('#ofa').value, finalPoints: $('#ofp').value };
      if (status === 'Delivered' && st !== 'Delivered' && !confirm(`Mark ${id} delivered and give ${body.finalPoints !== '' ? body.finalPoints : est} points to ${o.name}?`)) return;
      if (status === 'Cancelled' && st !== 'Cancelled' && !confirm(`Cancel order ${id}?`)) return;
      const b = $('#osave'); b.disabled = true; b.textContent = 'Saving…';
      try {
        const r = await call('set_order', body);
        DB.orders[id] = normOrder({ ...o, ...r.order });
        if (r.message && cust) { const m = r.message.match(/^(-?\d+) points (credited|taken back)/); if (m) cust.points = Number(cust.points || 0) + (m[2] === 'credited' ? 1 : -1) * Number(m[1]); }
        saveDB(); renderOrders(); renderCustomers(); odlg.close(); toast('Saved' + (r.message ? '. ' + r.message : ''));
      } catch (err) { alert('Not saved: ' + err.message); b.disabled = false; b.textContent = 'Save'; }
    };
    odlg.showModal();
  }

  /* ================= Items ================= */
  let dirty = {}, starter = null;
  const prodNorm = p => ({ ...p, id: String(p.id), price: num(p.price), points: num(p.points), sort: Number(p.sort) || 9999,
    inStock: bool(p.inStock, true), visible: bool(p.visible, true) });
  const products = () => DB.products.map(prodNorm).filter(p => p.id).sort((a, b) => a.sort - b.sort || String(a.name).localeCompare(b.name));
  /* Categories from the sheet; if the sheet has none yet, the standard list is shown so items still have their categories */
  const sheetCats = () => (DB.categories || []).filter(c => c.id);
  const cats = () => (sheetCats().length ? sheetCats() : (starterCats.length ? starterCats : (window.CATEGORIES || [])))
    .map(c => ({ ...c, id: String(c.id), sort: Number(c.sort) || 99 })).sort((a, b) => a.sort - b.sort);
  let starterCats = [], starterMoves = [];
  const catName = id => (cats().find(c => c.id === id) || (window.CATEGORIES || []).find(c => c.id === id) || {}).name || id || '—';
  const findP = id => DB.products.find(p => String(p.id) === String(id));
  async function starterLoad() {
    try { const j = await (await fetch('starter-items.json', { cache: 'no-store' })).json(); starter = j.products; starterCats = j.categories || []; starterMoves = j.moves || []; renderItems(); renderCats(); }
    catch (e) { starter = []; }
  }
  const cur = p => ({ ...p, ...(dirty[p.id] || {}) });
  const RETIRED = ['bricks', 'plumbing', 'hardware', 'curtain', 'tools', 'tapes', 'safety'];
  function starterUpdates() {
    if (!starter) return { add: [], upd: [], cats: [] };
    const catsAdd = sheetCats().length ? starterCats.filter(s => !sheetCats().some(c => String(c.id) === s.id)) : starterCats;
    const ps = products(), add = starter.filter(s => !ps.some(p => p.id === s.id));
    const upd = ps.map(p => { const s = starter.find(x => x.id === p.id); if (!s) return null;
      const ch = {};
      if (RETIRED.includes(p.category) || (!cats().some(c => c.id === p.category) && s.category !== p.category)) ch.category = s.category;
      // Items moved to a new category in this version (only if you have not moved them yourself)
      const mv = starterMoves.find(m => m.id === p.id && m.from === p.category); if (mv) ch.category = mv.to;
      if (p.price === '' && num(s.price) !== '') ch.price = s.price;
      if (!String(p.options || '').trim() && String(s.options || '').trim()) ch.options = s.options;
      if (!p.nameHi && s.nameHi) ch.nameHi = s.nameHi;
      return Object.keys(ch).length ? { ...p, ...ch } : null; }).filter(Boolean);
    return { add, upd, cats: catsAdd };
  }
  function renderItems(fromSync) {
    if (fromSync && document.activeElement && document.activeElement.closest('#ilist')) return;   // do not disturb typing
    const cl = cats(), sel = $('#icat'), keep = sel.value || 'all';
    sel.innerHTML = '<option value="all">All categories</option>' + cl.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    sel.value = keep === 'all' || cl.some(c => c.id === keep) ? keep : 'all';
    const su = starterUpdates();
    $('#istarter').hidden = !su.add.length && !su.upd.length && !su.cats.length;
    $('#istarter').textContent = `Update catalogue (${su.add.length} new items, ${su.upd.length} to update${su.cats.length ? ', ' + su.cats.length + ' categories' : ''})`;
    const ps = products(), q = $('#iq').value.trim().toLowerCase(), c = sel.value, sh = $('#ishow').value;
    const list = ps.map(cur).filter(p => (c === 'all' || p.category === c) &&
      (sh === 'all' || (sh === 'out' && !p.inStock) || (sh === 'hidden' && !p.visible) || (sh === 'noprice' && p.price === '' && !parseOpts(p.options).length) ||
        (sh === 'nophoto' && !p.image) || (sh === 'opts' && parseOpts(p.options).length)) &&
      (!q || [p.name, p.nameHi, p.brand, p.tags, p.id].join(' ').toLowerCase().includes(q)));
    $('#ilist').innerHTML = !ps.length ? '<div class="empty"><h2>No items yet</h2><p>Press “Update catalogue” to load the item list.</p></div>'
      : list.length ? list.map(p => { const op = parseOpts(p.options);
        return `<div class="irow${dirty[p.id] ? ' dirty' : ''}${p.visible ? '' : ' off'}" data-id="${esc(p.id)}">
        <button class="th" data-edit aria-label="Edit ${esc(p.name)}">${thumb(p.image)}</button>
        <div class="nm"><b>${esc(p.name)}</b><small>per ${esc(p.unit)} · code: ${esc(p.id)}${op.length ? ` · <b>${op.length} options</b>` : ''}</small></div>
        <label class="icat"><span class="sr">Category</span><select data-f="category">${catOpts(p.category)}</select></label>
        ${op.length ? `<span class="inum price muted" style="padding:0 8px">${inr(Math.min(...op.map(o => Number(o.p) || 0)))}+ <small>&nbsp;edit</small></span>` : `<label class="inum price">₹<input type="number" min="0" step="0.01" inputmode="decimal" data-f="price" value="${esc(p.price)}" placeholder="Ask" aria-label="Price"></label>`}
        <label class="inum" title="Points per unit">pts<input type="number" min="0" step="0.1" inputmode="decimal" data-f="points" value="${esc(p.points)}" placeholder="auto" aria-label="Points per unit"></label>
        <label class="sw sm s1"><input type="checkbox" data-f="inStock"${p.inStock ? ' checked' : ''}>In stock</label>
        <label class="sw sm s2"><input type="checkbox" data-f="visible"${p.visible ? ' checked' : ''}>In app</label>
        <button class="btn sm ghost" data-edit>Edit</button></div>`; }).join('') : '<p class="muted">No items match.</p>';
  }
  const catOpts = sel => { const cl = cats(); return (cl.some(c => c.id === sel) ? '' : `<option value="${esc(sel)}" selected>${esc(sel || 'No category')}</option>`) +
    cl.map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join(''); };
  ['#iq', '#icat', '#ishow'].forEach(s => $(s).addEventListener('input', () => renderItems()));
  $('#ilist').addEventListener('input', e => {
    const f = e.target.dataset.f; if (!f) return;
    const row = e.target.closest('.irow'), id = row.dataset.id, orig = prodNorm(findP(id));
    const v = e.target.type === 'checkbox' ? e.target.checked : f === 'category' ? e.target.value : num(e.target.value);
    const d = dirty[id] || {};
    if (v === orig[f]) delete d[f]; else d[f] = v;
    if (Object.keys(d).length) dirty[id] = d; else delete dirty[id];
    row.classList.toggle('dirty', !!dirty[id]); if (f === 'visible') row.classList.toggle('off', !v);
    bar();
  });
  $('#ilist').addEventListener('click', e => { const b = e.target.closest('[data-edit]') || (e.target.closest('.inum.price.muted')); if (b) openItem(prodNorm(cur(findP(b.closest('.irow').dataset.id)))); });
  function bar() {
    const n = Object.keys(dirty).length;
    $('#dcount').textContent = n + (n === 1 ? ' item changed' : ' items changed');
    $('#savebar').classList.toggle('show', n > 0 && pane === 'items');
  }
  async function saveProducts(list, msg) {
    const r = await call('save_products', { items: list });
    DB.products = r.products; DB.v = r.v; delete DB.vPending; saveDB(); renderItems(); renderCats();
    if (msg) toast(msg);
  }
  $('#discard').addEventListener('click', () => { dirty = {}; renderItems(); bar(); });
  $('#save').addEventListener('click', async () => {
    const list = Object.keys(dirty).map(id => ({ ...findP(id), ...dirty[id] }));
    const b = $('#save'); b.disabled = true; b.textContent = 'Saving…';
    try { dirty = {}; await saveProducts(list, `Saved ${list.length} items. Customers see it within 10 minutes.`); bar(); }
    catch (err) { alert('Not saved: ' + err.message); }
    b.disabled = false; b.textContent = 'Save changes';
  });
  window.addEventListener('beforeunload', e => { if (Object.keys(dirty).length) { e.preventDefault(); e.returnValue = ''; } });
  $('#istarter').addEventListener('click', async () => {
    const su = starterUpdates(), list = [...su.add, ...su.upd];
    if ((!list.length && !su.cats.length) || !confirm(`Add ${su.add.length} new items, ${su.cats.length} categories, and update ${su.upd.length} items (categories, empty prices and options are filled)? Prices you already set are not changed.`)) return;
    const b = $('#istarter'); b.disabled = true; b.textContent = 'Saving…';
    try {
      if (su.cats.length) { const r = await call('save_categories', { items: su.cats }); DB.categories = r.categories; saveDB(); renderCats(); }
      if (list.length) await saveProducts(list, 'Catalogue updated'); else toast('Categories added');
    } catch (err) { alert(err.message); }
    b.disabled = false; renderItems();
  });

  /* ---------- Dialog helpers ---------- */
  const dlg = $('#dlg'), pf = $('#pf');
  let editing = null, kind = 'item';
  const F = (name, label, val, attrs = '') => `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" value="${esc(val ?? '')}" ${attrs}></div>`;
  const TA = (name, label, val) => `<div class="field"><label for="f-${name}">${label}</label><textarea id="f-${name}" name="${name}" maxlength="600">${esc(val ?? '')}</textarea></div>`;
  const photoBox = () => `<div class="field" style="margin-bottom:4px"><span style="font-weight:600;font-size:.92rem">Photo</span></div>
    <div class="photo"><div class="pv" id="pv"></div><div><div class="pa">
      <label class="btn sm" for="pfile">Upload photo</label><input type="file" id="pfile" accept="image/*" class="sr">
      <button type="button" class="btn sm ghost" id="prm">Remove</button></div>
      <p class="muted" id="pnote" style="margin-top:6px;font-size:.82rem"></p></div></div>`;
  $$('[data-close]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
  function shrink(file, max = 800) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('This file could not be read as a photo. Use a JPG or PNG.')); };
      img.src = url;
    });
  }
  const uploadFile = async (f, name, max) => (await call('upload_image', { data: await shrink(f, max), mime: 'image/jpeg', name: name || f.name })).url;
  /* Photo box: the new photo is kept in the form and saved with the Save button */
  let formImage = '';
  function bindPhoto(current) {
    formImage = current || '';
    const show = () => { $('#pv').innerHTML = thumb(formImage); $('#prm').hidden = !formImage; };
    show();
    $('#pnote').textContent = 'Photos are stored in your Google Drive.';
    $('#pfile').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      $('#pnote').textContent = 'Uploading…';
      try { formImage = await uploadFile(f, null, kind === 'offer' ? 1400 : 800); show(); $('#pnote').textContent = 'Photo ready. Press Save.'; } catch (err) { alert('Photo not uploaded: ' + err.message); $('#pnote').textContent = ''; }
    });
    $('#prm').addEventListener('click', () => { formImage = ''; show(); $('#pnote').textContent = 'Photo removed. Press Save.'; });
  }

  /* ---------- Item dialog with options ---------- */
  let optRows = [];
  function optHTML() {
    return optRows.map((o, i) => `<div class="orow2" data-oi="${i}">
      <label class="oth" title="Option photo">${thumb(o.img)}<input type="file" accept="image/*" class="sr" data-oimg="${i}"></label>
      <input placeholder="Option (e.g. 6 mm)" value="${esc(o.n)}" data-of="n" aria-label="Option name">
      <input placeholder="Hindi" value="${esc(o.nh || '')}" data-of="nh" lang="hi" aria-label="Option name in Hindi">
      <input placeholder="₹" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(o.p)}" data-of="p" aria-label="Option price">
      <button type="button" class="btn sm ghost" data-odel="${i}" aria-label="Remove option">✕</button></div>`).join('');
  }
  function openItem(p) {
    kind = 'item'; editing = p || null;
    p = p || { name: '', nameHi: '', category: $('#icat').value !== 'all' ? $('#icat').value : (cats()[0] || {}).id, brand: '', unit: 'piece', price: '', points: '', description: '', descriptionHi: '', tags: '', image: '', inStock: true, visible: true, sort: '', options: '' };
    optRows = parseOpts(p.options).map(o => ({ n: o.n || '', nh: o.nh || '', p: o.p ?? '', img: o.img || '' }));
    $('#dtitle').textContent = editing ? 'Edit item' : 'Add item';
    $('#pdel').hidden = !editing;
    $('#dbody').innerHTML = `${photoBox()}
      ${F('name', 'Name (English)', p.name, 'required maxlength="120"')}${F('nameHi', 'Name in Hindi', p.nameHi, 'lang="hi" maxlength="120"')}
      <div class="row2"><div class="field"><label for="f-category">Category</label><select id="f-category" name="category">${cats().map(c => `<option value="${esc(c.id)}"${c.id === p.category ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        ${F('unit', 'Sold per', p.unit, 'list="units" required maxlength="30"')}</div>
      <datalist id="units">${Object.keys(window.UNITS_HI || {}).map(u => `<option>${u}</option>`).join('')}</datalist>
      <p class="muted" style="margin:-6px 0 10px;font-size:.82rem">For fencing, pipes or wire sold by length, use metre or ft; for area use sq ft. Customers can then order 12.5 metre or enter length × height.</p>
      <div class="row2">${F('price', 'Price ₹', p.price, 'type="number" min="0" step="0.01" placeholder="Ask"')}${F('points', 'Points per unit', p.points, 'type="number" min="0" step="0.1" placeholder="auto"')}</div>
      <div class="field"><span style="font-weight:600;font-size:.92rem">Options (sizes, designs, colours)</span>
        <p class="muted" style="font-size:.82rem;margin:2px 0 6px">Each option has its own price and can have its own photo (tap the box). With options, the price above is not used.</p>
        <div id="optrows">${optHTML()}</div><button type="button" class="btn sm ghost" id="optadd">Add option</button></div>
      <div class="row2">${F('brand', 'Brand', p.brand, 'maxlength="60"')}${F('sort', 'Display order', p.sort === 9999 ? '' : p.sort, 'type="number" placeholder="Smaller shows first"')}</div>
      ${TA('description', 'Description (English)', p.description)}${TA('descriptionHi', 'Description in Hindi', p.descriptionHi)}
      ${F('tags', 'Search words (Hindi or local names)', p.tags, 'maxlength="200" placeholder="e.g. kabja hinge darwaja"')}
      <div class="checks"><label class="sw"><input type="checkbox" name="inStock"${p.inStock ? ' checked' : ''}>In stock</label>
        <label class="sw"><input type="checkbox" name="visible"${p.visible ? ' checked' : ''}>In app</label></div>
      ${editing ? `<p class="muted" style="font-size:.82rem">Item code: <b>${esc(p.id)}</b> · photo file name for bulk upload: ${esc(p.id)}.jpg, option photos ${esc(p.id)}--1.jpg, --2.jpg …</p>` : ''}`;
    bindPhoto(p.image);
    const box = $('#optrows');
    const syncRows = () => { $$('[data-oi]', box).forEach(r => { const o = optRows[r.dataset.oi]; $$('[data-of]', r).forEach(i => { o[i.dataset.of] = i.dataset.of === 'p' ? num(i.value) : i.value; }); }); };
    $('#optadd').onclick = () => { syncRows(); optRows.push({ n: '', nh: '', p: '', img: '' }); box.innerHTML = optHTML(); const l = $$('[data-of="n"]', box).pop(); l && l.focus(); };
    box.onclick = e => { const d = e.target.closest('[data-odel]'); if (d) { syncRows(); optRows.splice(Number(d.dataset.odel), 1); box.innerHTML = optHTML(); } };
    box.onchange = async e => {
      const f = e.target.dataset.oimg; if (f === undefined) return;
      const file = e.target.files[0]; if (!file) return; syncRows();
      const th = e.target.closest('.oth'); th.style.opacity = '.5';
      try { optRows[Number(f)].img = await uploadFile(file); } catch (err) { alert('Photo not uploaded: ' + err.message); }
      box.innerHTML = optHTML();
    };
    pf.dataset.sync = '1'; pf._syncRows = syncRows;
    dlg.showModal();
  }
  function openGift(g) {
    kind = 'gift'; editing = g || null;
    g = g || { name: '', nameHi: '', points: '', stock: '', description: '', descriptionHi: '', active: true, sort: '', image: '' };
    $('#dtitle').textContent = editing ? 'Edit gift' : 'Add gift';
    $('#pdel').hidden = !editing;
    $('#dbody').innerHTML = `${photoBox()}${F('name', 'Gift name (English)', g.name, 'required maxlength="120"')}${F('nameHi', 'Gift name in Hindi', g.nameHi, 'lang="hi" maxlength="120"')}
      <div class="row3">${F('points', 'Points needed', g.points, 'type="number" min="1" required')}${F('stock', 'Stock (empty = no limit)', g.stock, 'type="number" min="0"')}${F('sort', 'Order', g.sort, 'type="number"')}</div>
      ${TA('description', 'Description', g.description)}${TA('descriptionHi', 'Description in Hindi', g.descriptionHi)}
      <div class="checks"><label class="sw"><input type="checkbox" name="active"${bool(g.active, false) ? ' checked' : ''}>Show in app</label></div>`;
    bindPhoto(g.image); pf._syncRows = null; dlg.showModal();
  }
  const ICONS = ['cement', 'steel', 'sand', 'ms', 'garden', 'sanitary', 'bathroom', 'kitchen', 'doors', 'power', 'paints', 'electrical', 'fasteners', 'tiles', 'site', 'cleaning', 'other'];
  function openCat(c) {
    kind = 'category'; editing = c || null;
    c = c || { name: '', nameHi: '', icon: 'other', sort: (cats().length + 1), visible: true, image: '' };
    $('#dtitle').textContent = editing ? 'Edit category' : 'Add category';
    $('#pdel').hidden = !editing;
    $('#dbody').innerHTML = `${photoBox()}${F('name', 'Name (English)', c.name, 'required maxlength="60"')}${F('nameHi', 'Name in Hindi', c.nameHi, 'lang="hi" maxlength="60"')}
      <div class="row2"><div class="field"><label for="f-icon">Drawing (when there is no photo)</label><select id="f-icon" name="icon">${ICONS.map(i => `<option${i === c.icon ? ' selected' : ''}>${i}</option>`).join('')}</select></div>
        ${F('sort', 'Order in app', c.sort, 'type="number" min="1"')}</div>
      <div class="checks"><label class="sw"><input type="checkbox" name="visible"${bool(c.visible, true) ? ' checked' : ''}>Show in app</label></div>
      ${editing ? `<p class="muted" style="font-size:.82rem">Category code: <b>${esc(c.id)}</b> · photo file name for bulk upload: cat-${esc(c.id)}.jpg</p>` : ''}`;
    bindPhoto(c.image); pf._syncRows = null; dlg.showModal();
  }
  pf.addEventListener('submit', async e => {
    e.preventDefault();
    if (pf._syncRows) pf._syncRows();
    const o = { id: editing ? editing.id : '' };
    $$('#dbody input[name], #dbody select[name], #dbody textarea[name]').forEach(i => { o[i.name] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
    o.image = formImage;
    if (kind === 'offer') o.name = o.title;
    if (!o.name) return alert(kind === 'offer' ? 'Enter a title.' : 'Enter a name.');
    const b = $('#psave'); b.disabled = true; b.textContent = 'Saving…';
    try {
      if (kind === 'item') {
        if (!o.unit) throw new Error('Enter “Sold per”.');
        const ops = optRows.filter(x => String(x.n).trim()).map(x => ({ n: String(x.n).trim(), nh: String(x.nh || '').trim(), p: num(x.p), img: x.img || '' }));
        o.options = ops.length ? JSON.stringify(ops) : '';
        if (!o.id) { const base = o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item'; let id = base, n = 2; while (findP(id)) id = base + '-' + n++; o.id = id; }
        if (o.sort === '') o.sort = 9999;
        delete dirty[o.id];
        await saveProducts([o]); bar();
      } else if (kind === 'offer') {
        if (!o.title) throw new Error('Enter a title.');
        if (o.ltype === 'p' && !findP(o.lprod)) throw new Error('Choose the item.');
        o.link = o.ltype === 'cat' ? 'cat:' + o.lcat : o.ltype === 'p' ? 'p:' + o.lprod : ''; delete o.ltype; delete o.lcat; delete o.lprod; delete o.name;
        if (o.start && o.end && o.end < o.start) throw new Error('The end date is before the start date.');
        const r = await call('save_offers', { items: [o] }); DB.offers = r.offers; DB.v = r.v; saveDB(); renderOffers();
      } else if (kind === 'gift') {
        if (!(Number(o.points) > 0)) throw new Error('Enter the points needed.');
        const r = await call('save_gifts', { items: [o] }); DB.gifts = r.gifts; DB.v = r.v; saveDB(); renderGifts();
      } else {
        if (!o.id) { const base = o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'cat'; let id = base, n = 2; while (cats().some(c => c.id === id)) id = base + '-' + n++; o.id = id; }
        const r = await call('save_categories', { items: [o] }); DB.categories = r.categories; DB.v = r.v; saveDB(); renderCats(); renderItems();
      }
      dlg.close(); toast('Saved');
    } catch (err) { alert('Not saved: ' + err.message); }
    b.disabled = false; b.textContent = 'Save';
  });
  $('#pdel').addEventListener('click', async () => {
    if (!editing) return;
    try {
      if (kind === 'item') {
        if (!confirm(`Delete “${editing.name}” for good?\nTip: switch off “In app” instead if you may sell it again.`)) return;
        await call('delete_product', { id: editing.id }); DB.products = DB.products.filter(p => String(p.id) !== editing.id); delete dirty[editing.id]; bar();
      } else if (kind === 'offer') {
        if (!confirm(`Delete offer “${editing.title}”?`)) return;
        await call('delete_offer', { id: editing.id }); DB.offers = DB.offers.filter(x => String(x.id) !== String(editing.id));
      } else if (kind === 'gift') {
        if (!confirm(`Delete gift “${editing.name}”?`)) return;
        await call('delete_gift', { id: editing.id }); DB.gifts = DB.gifts.filter(g => String(g.id) !== String(editing.id));
      } else {
        const inCat = products().filter(p => p.category === editing.id);
        if (inCat.length) {
          const others = cats().filter(c => c.id !== editing.id);
          const pick = prompt(`${inCat.length} items are in “${editing.name}”. Move them to which category? Type its number:\n` + others.map((c, i) => `${i + 1}. ${c.name}`).join('\n'));
          const to = others[Number(pick) - 1]; if (!to) return;
          await saveProducts(inCat.map(p => ({ ...findP(p.id), category: to.id })));
        } else if (!confirm(`Delete category “${editing.name}”?`)) return;
        await call('delete_category', { id: editing.id }); DB.categories = DB.categories.filter(c => String(c.id) !== editing.id);
      }
      saveDB(); renderAll(); dlg.close(); toast('Deleted');
    } catch (err) { alert('Not deleted: ' + err.message); }
  });
  $('#iadd').addEventListener('click', () => openItem(null));

  /* ---------- Many photos at once ----------
     item-code.jpg → item photo · item-code--2.jpg → photo of option 2 · cat-code.jpg → category photo */
  $('#bulkfile').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
    const msg = $('#bulkmsg'); msg.hidden = false;
    const base = f => f.name.replace(/\.[^.]+$/, '').trim().toLowerCase();
    const changedP = {}, changedC = {}, skip = [];
    const jobs = files.map(f => {
      const b = base(f), m = b.match(/^(.*)--(\d+)$/), cm = b.match(/^cat-(.+)$/);
      if (cm) { const c = cats().find(x => x.id.toLowerCase() === cm[1]); return c ? { f, cat: c } : null; }
      const p = DB.products.find(x => String(x.id).toLowerCase() === (m ? m[1] : b));
      if (!p) return null;
      if (m && !parseOpts(p.options)[Number(m[2]) - 1]) return null;
      return { f, p, opt: m ? Number(m[2]) - 1 : -1 };
    });
    jobs.forEach((j, i) => { if (!j) skip.push(files[i].name); });
    const optMiss = files.filter((f, i) => !jobs[i] && /--\d+$/.test(base(f)));
    if (optMiss.length && starterUpdates().upd.length && !confirm(`${optMiss.length} option photos have no matching option yet. Press “Update catalogue” first, then upload again.\n\nUpload the other photos now anyway?`)) return;
    const todo = jobs.filter(Boolean);
    let n = 0, ok = 0;
    for (const j of todo) {
      msg.textContent = `Uploading ${++n} of ${todo.length}…`;
      try {
        const url = await uploadFile(j.f, j.f.name);
        if (j.cat) { changedC[j.cat.id] = { ...(changedC[j.cat.id] || j.cat), image: url }; }
        else {
          const p = changedP[j.p.id] || { ...j.p };
          if (j.opt < 0) p.image = url;
          else { const ops = parseOpts(p.options); ops[j.opt].img = url; p.options = JSON.stringify(ops); }
          changedP[j.p.id] = p;
        }
        ok++;
      } catch (err) { skip.push(j.f.name + ' (' + err.message + ')'); }
    }
    msg.textContent = 'Saving…';
    try {
      if (Object.keys(changedP).length) await saveProducts(Object.values(changedP));
      if (Object.keys(changedC).length) { const r = await call('save_categories', { items: Object.values(changedC) }); DB.categories = r.categories; saveDB(); renderCats(); }
      msg.innerHTML = `<b>${ok} photos saved to Google Drive.</b>` + (skip.length ? ` Not matched: ${esc(skip.join(', '))}` : '');
    } catch (err) { msg.textContent = 'Photos uploaded but not linked: ' + err.message + '. Press “Link photos from Drive”.'; }
  });
  $('#ilink').addEventListener('click', async () => {
    const b = $('#ilink'); b.disabled = true; b.textContent = 'Checking Drive…';
    const msg = $('#bulkmsg'); msg.hidden = false;
    try {
      const r = await call('link_drive_photos');
      msg.innerHTML = `<b>${r.linked} photos linked.</b> ${r.withoutPhoto} items still have no photo. Put photos named <i>item-code.jpg</i> in <a href="${esc(r.folder)}" target="_blank" rel="noopener">your Drive photos folder</a> and press this again.`;
      if (r.linked) { DB.vPending = 'x'; await sync(); }
    } catch (err) { alert(err.message); }
    b.disabled = false; b.textContent = 'Link photos from Drive';
  });

  /* ================= Categories ================= */
  function renderCats() {
    const ps = products();
    const head = sheetCats().length ? '' : `<div class="srvwarn" style="background:#FFF8D9;border-color:#F0DB82;color:#5C4A00;margin:0 0 10px">
      <b>The Categories sheet is empty.</b> The app is showing the standard list below. Save it to the sheet so you can edit names, photos and order.
      <div style="margin-top:8px"><button class="btn sm" data-catseed>Save these ${cats().length} categories</button></div></div>`;
    $('#catlist').innerHTML = head + cats().map(c => { const n = ps.filter(p => p.category === c.id).length;
      return `<div class="agift" data-cid="${esc(c.id)}"><span class="th">${thumb(c.image || (ps.find(p => p.category === c.id && p.image) || {}).image)}</span>
        <div class="nm"><b>${esc(c.name)}</b><div class="muted">${esc(c.nameHi || '')}</div></div>
        <span class="muted">${n} items</span><span class="muted">Order ${esc(c.sort)}</span>
        <span class="muted">${bool(c.visible, true) ? 'In app' : '<b class="red">Hidden</b>'}</span>
        <button class="btn sm ghost" data-cedit>Edit</button></div>`; }).join('') || '<p class="muted">No categories yet. Sync first, or add one.</p>';
  }
  $('#cadd').addEventListener('click', () => openCat(null));
  $('#catlist').addEventListener('click', async e => {
    const b = e.target.closest('[data-catseed]'); if (!b) return;
    b.disabled = true; b.textContent = 'Saving…';
    try { const r = await call('save_categories', { items: cats().map(c => ({ id: c.id, name: c.name, nameHi: c.nameHi || '', icon: c.icon || 'other', sort: c.sort, visible: true, image: c.image || '' })) });
      DB.categories = r.categories; saveDB(); renderCats(); renderItems(); toast('Categories saved'); }
    catch (err) { alert(err.message); b.disabled = false; }
  });
  $('#catlist').addEventListener('click', e => { const b = e.target.closest('[data-cedit]'); if (b) openCat(cats().find(c => c.id === b.closest('[data-cid]').dataset.cid)); });

  /* ================= Customers ================= */
  function renderCustomers() {
    const q = $('#cq').value.trim().toLowerCase(), sort = $('#csort').value;
    const tot = {}; Object.values(DB.orders).forEach(o => { if (stNorm(o.status) === 'Cancelled') return; const t = tot[o.phone] || (tot[o.phone] = { n: 0, amt: 0 }); t.n++; t.amt += amt(o); });
    const all = Object.values(DB.customers);
    const list = all.filter(c => !q || [c.name, c.phone, c.village].join(' ').toLowerCase().includes(q))
      .sort((a, b) => sort === 'points' ? (b.points || 0) - (a.points || 0) : sort === 'recent' ? String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)) : ((tot[b.phone] || {}).amt || 0) - ((tot[a.phone] || {}).amt || 0));
    const sum = Object.values(tot).reduce((s, t) => s + t.amt, 0);
    $('#clist').innerHTML = `<p class="muted" style="margin-bottom:8px">${all.length} customers · orders worth ${inr(sum)} · ${all.reduce((s, c) => s + (Number(c.points) || 0), 0).toLocaleString('en-IN')} points held</p>` +
      (list.length ? list.slice(0, 400).map(c => { const t = tot[c.phone] || { n: 0, amt: 0 };
        return `<div class="acust" data-ph="${esc(c.phone)}"><div class="hd"><div><b>${esc(c.name)}</b> · ${esc(c.phone)}<div class="muted">${esc(c.village || '')} · joined ${esc(when(c.createdAt))}${c.pinSet ? '' : ' · <b class="red">PIN reset, waiting for new PIN</b>'}</div></div>
        <div class="ctot"><b>${inr(t.amt)}</b><small>${t.n} orders · ${Number(c.points || 0).toLocaleString('en-IN')} pts</small></div></div>
        <div class="acts"><button class="btn sm ghost" data-pts>Add / remove points</button><button class="btn sm ghost" data-led>Points history</button>
          <button class="btn sm ghost" data-reset>Reset PIN</button><a class="btn sm ghost" href="tel:+91${esc(c.phone)}">Call</a>
          <a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/91${esc(c.phone)}">WhatsApp</a></div><div class="ledger" hidden></div></div>`; }).join('') : '<p class="muted">No customers yet.</p>');
  }
  $('#cq').addEventListener('input', renderCustomers);
  $('#csort').addEventListener('change', renderCustomers);
  $('#clist').addEventListener('click', async e => {
    const card = e.target.closest('[data-ph]'); if (!card) return;
    const c = DB.customers[card.dataset.ph];
    if (e.target.closest('[data-pts]')) {
      const d = prompt(`Points to add for ${c.name} (use minus to remove, e.g. -50):`); if (!d || !Number(d)) return;
      const reason = prompt('Reason (shown to the customer):', Number(d) > 0 ? 'Bonus from shop' : 'Adjusted by shop') || '';
      try { const r = await call('adjust_points', { phone: c.phone, delta: Number(d), reason }); c.points = r.balance; saveDB(); renderCustomers(); toast('Points updated'); } catch (err) { alert(err.message); }
    }
    if (e.target.closest('[data-reset]')) {
      if (!confirm(`Reset the PIN for ${c.name}? They set a new PIN at their next login. Their points stay safe.`)) return;
      try { await call('reset_pin', { phone: c.phone }); c.pinSet = false; saveDB(); renderCustomers(); toast('PIN reset. Tell the customer to log in again.'); } catch (err) { alert(err.message); }
    }
    if (e.target.closest('[data-led]')) {
      const box = $('.ledger', card); box.hidden = !box.hidden; if (box.hidden) return;
      box.innerHTML = '<p class="muted">Loading…</p>';
      try { const l = (await call('customer_ledger', { phone: c.phone })).ledger;
        box.innerHTML = l.length ? l.map(x => `<div class="hist"><span>${esc(x.reason)}<small>${esc(when(x.date))}</small></span><b class="${Number(x.delta) >= 0 ? 'green' : 'red'}">${Number(x.delta) >= 0 ? '+' : ''}${x.delta} → ${x.balance}</b></div>`).join('') : '<p class="muted">No points yet.</p>'; }
      catch (err) { box.innerHTML = `<p class="msg err">${esc(err.message)}</p>`; }
    }
  });

  /* ================= Gifts and requests ================= */
  function renderGifts() {
    const gifts = (DB.gifts || []).slice().sort((a, b) => (Number(a.sort) || 99) - (Number(b.sort) || 99));
    $('#glist').innerHTML = gifts.length ? gifts.map(g => `<div class="agift" data-gid="${esc(g.id)}"><span class="th">${thumb(g.image)}</span>
      <div class="nm"><b>${esc(g.name)}</b><div class="muted">${esc(g.nameHi || '')}</div></div>
      <span class="chip-pts">${esc(g.points)} pts</span><span class="muted">${g.stock === '' || g.stock == null ? 'No limit' : 'Stock ' + esc(g.stock)}</span>
      <label class="sw sm"><input type="checkbox" data-gact${bool(g.active, false) ? ' checked' : ''}>In app</label>
      <button class="btn sm ghost" data-gedit>Edit</button></div>`).join('') : '<p class="muted">No gifts yet. Add the gifts customers can get for points.</p>';
  }
  function renderReds() {
    const reds = Object.values(DB.reds).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    $('#n-gifts').textContent = reds.filter(r => r.status === 'Requested').length || '';
    $('#rlist').innerHTML = reds.length ? reds.slice(0, 80).map(r => `<div class="areq${r.status === 'Requested' ? ' req' : ''}" data-rid="${esc(r.redeemId)}">
      <div><b>${esc(r.giftName)}</b> · ${esc(r.points)} pts<div class="muted">${esc(r.name)} · ${esc(r.phone)} · ${esc(when(r.createdAt))}</div></div>
      ${r.status === 'Requested' ? `<div class="btns"><button class="btn sm gold" data-rs="Given">Mark given</button><button class="btn sm danger" data-rs="Rejected">Reject and refund</button></div>` : `<span class="badge b-${esc(r.status)}">${r.status === 'Rejected' ? 'Refunded' : esc(r.status)}</span>`}</div>`).join('')
      : '<p class="muted">No gift requests yet.</p>';
  }
  $('#gadd').addEventListener('click', () => openGift(null));
  $('#glist').addEventListener('click', e => { const b = e.target.closest('[data-gedit]'); if (b) openGift(DB.gifts.find(g => String(g.id) === b.closest('[data-gid]').dataset.gid)); });
  $('#glist').addEventListener('change', async e => {
    if (!e.target.matches('[data-gact]')) return;
    const g = DB.gifts.find(x => String(x.id) === e.target.closest('[data-gid]').dataset.gid);
    try { const r = await call('save_gifts', { items: [{ ...g, active: e.target.checked }] }); DB.gifts = r.gifts; DB.v = r.v; saveDB(); renderGifts(); toast(e.target.checked ? 'Gift shown in app' : 'Gift hidden'); }
    catch (err) { alert(err.message); e.target.checked = !e.target.checked; }
  });
  $('#rlist').addEventListener('click', async e => {
    const b = e.target.closest('[data-rs]'); if (!b) return;
    const r = DB.reds[b.closest('[data-rid]').dataset.rid];
    if (!confirm(b.dataset.rs === 'Given' ? `Mark “${r.giftName}” as given to ${r.name}?` : `Reject and give ${r.points} points back to ${r.name}?`)) return;
    try { await call('set_redemption', { redeemId: r.redeemId, status: b.dataset.rs }); r.status = b.dataset.rs; saveDB(); renderReds(); toast('Updated'); } catch (err) { alert(err.message); }
  });

  /* ================= Offers ================= */
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const offerState = o => !bool(o.active, true) ? 'Off' : (o.end && o.end < todayStr()) ? 'Ended' : (o.start && o.start > todayStr()) ? 'Starts ' + o.start : 'Live';
  const linkText = l => { const m = String(l || '').match(/^(cat|p):(.+)$/); if (!m) return 'No link';
    return m[1] === 'cat' ? 'Opens category: ' + catName(m[2]) : 'Opens item: ' + ((findP(m[2]) || {}).name || m[2]); };
  function renderOffers() {
    const os = (DB.offers || []).filter(o => o.id).slice().sort((a, b) => (Number(a.sort) || 99) - (Number(b.sort) || 99));
    const live = os.filter(o => offerState(o) === 'Live').length;
    $('#n-offers').textContent = live || '';
    $('#oflist').innerHTML = os.length ? os.map(o => { const stt = offerState(o);
      return `<div class="aoffer${stt === 'Live' ? '' : ' off'}" data-ofid="${esc(o.id)}">
        <span class="ob">${o.image ? `<img src="${esc(imgUrl(o.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<b>${esc(o.title)}</b>`}</span>
        <div class="nm"><b>${esc(o.title)}</b><div class="muted">${esc(o.titleHi || '')}</div>
          <div class="muted" style="font-size:.84rem">${esc(linkText(o.link))} · ${o.start || o.end ? esc((o.start || 'now') + ' to ' + (o.end || 'no end')) : 'No end date'}</div></div>
        <span class="badge ${stt === 'Live' ? 'b-Delivered' : 'b-Cancelled'}">${esc(stt)}</span>
        <label class="sw sm"><input type="checkbox" data-ofact${bool(o.active, true) ? ' checked' : ''}>On</label>
        <button class="btn sm ghost" data-ofedit>Edit</button></div>`; }).join('')
      : '<div class="empty"><h2>No offers yet</h2><p>Add a banner for a sale, a new arrival or a festival. It shows on the home page of the customer app.</p></div>';
  }
  function openOffer(o) {
    kind = 'offer'; editing = o || null;
    o = o || { title: '', titleHi: '', link: '', start: todayStr(), end: '', active: true, sort: (DB.offers || []).length + 1, image: '' };
    const m = String(o.link || '').match(/^(cat|p):(.+)$/), lt = m ? m[1] : '', lv = m ? m[2] : '';
    $('#dtitle').textContent = editing ? 'Edit offer' : 'Add offer';
    $('#pdel').hidden = !editing;
    $('#dbody').innerHTML = `${photoBox()}<p class="muted" style="margin:-4px 0 10px;font-size:.82rem">Best size: a wide photo, 1200 × 500 (12 : 5). Without a photo the title shows on a yellow banner.</p>
      ${F('title', 'Title (English)', o.title, 'required maxlength="80" placeholder="e.g. Diwali offer on paints"')}${F('titleHi', 'Title in Hindi', o.titleHi, 'lang="hi" maxlength="80"')}
      <div class="field"><label for="f-ltype">When tapped, open</label><select id="f-ltype" name="ltype">
        <option value=""${!lt ? ' selected' : ''}>Nothing (banner only)</option><option value="cat"${lt === 'cat' ? ' selected' : ''}>A category</option><option value="p"${lt === 'p' ? ' selected' : ''}>An item</option></select></div>
      <div class="field" id="lcatw"${lt === 'cat' ? '' : ' hidden'}><label for="f-lcat">Category</label><select id="f-lcat" name="lcat">${cats().map(c => `<option value="${esc(c.id)}"${c.id === lv ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field" id="lprodw"${lt === 'p' ? '' : ' hidden'}><label for="f-lprod">Item</label><select id="f-lprod" name="lprod">${products().map(p => `<option value="${esc(p.id)}"${p.id === lv ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="row3">${F('start', 'Starts', o.start, 'type="date"')}${F('end', 'Ends (empty = no end)', o.end, 'type="date"')}${F('sort', 'Order', o.sort, 'type="number" min="1"')}</div>
      <div class="checks"><label class="sw"><input type="checkbox" name="active"${bool(o.active, true) ? ' checked' : ''}>Show in app</label></div>`;
    $('#f-ltype').onchange = e => { $('#lcatw').hidden = e.target.value !== 'cat'; $('#lprodw').hidden = e.target.value !== 'p'; };
    bindPhoto(o.image); pf._syncRows = null; dlg.showModal();
  }
  $('#ofadd').addEventListener('click', () => openOffer(null));
  $('#oflist').addEventListener('click', e => { const b = e.target.closest('[data-ofedit]'); if (b) openOffer(DB.offers.find(o => String(o.id) === b.closest('[data-ofid]').dataset.ofid)); });
  $('#oflist').addEventListener('change', async e => {
    if (!e.target.matches('[data-ofact]')) return;
    const o = DB.offers.find(x => String(x.id) === e.target.closest('[data-ofid]').dataset.ofid);
    try { const r = await call('save_offers', { items: [{ ...o, active: e.target.checked }] }); DB.offers = r.offers; DB.v = r.v; saveDB(); renderOffers(); toast(e.target.checked ? 'Offer shown in app' : 'Offer hidden'); }
    catch (err) { alert(err.message); e.target.checked = !e.target.checked; }
  });

  /* ================= Settings ================= */
  const SET = [['pointsPer100', 'Points for every ₹100 (all items without their own points)', 'number'], ['welcomePoints', 'Welcome points for a new account', 'number'],
    ['notice', 'Message at the top of the app (English)'], ['noticeHi', 'Message at the top of the app (Hindi)'],
    ['deliveryNote', 'Delivery note at checkout (English)'], ['deliveryNoteHi', 'Delivery note at checkout (Hindi)'],
    ['emailOrders', 'Email every new order to the shop (yes / no)']];
  function renderSettings() {
    if (document.activeElement && document.activeElement.closest('#sf')) return;
    const v = {}; (DB.settings || []).forEach(r => { v[r.key] = r.value; });
    $('#sf').innerHTML = SET.map(([k, l, ty]) => `<div class="field"><label for="s-${k}">${esc(l)}</label><input id="s-${k}" name="${k}" ${ty === 'number' ? 'type="number" min="0" step="0.1"' : 'maxlength="300"'} value="${esc(v[k] ?? '')}"></div>`).join('') +
      `<p class="muted" style="margin-bottom:12px">With 1 point per ₹100, a ₹25,000 order gives 250 points, added when you mark the order Delivered.</p><button class="btn">Save settings</button>
      <div class="sblock"><b>New order alerts</b><p class="muted" style="margin:4px 0 10px">While ST Admin is open, or in the background, a new order rings, vibrates and shows a notification. If the phone closes ST Admin to save battery, the alert comes the moment you open it again.</p>
        <div class="btns"><button type="button" class="btn sm${notifOn() ? ' ghost' : ' gold'}" data-notif>${notifOn() ? 'Notifications are on' : 'Turn on notifications'}</button>
          <button type="button" class="btn sm ghost" data-testalert>Test the alert</button></div>
        <div class="checks" style="margin-top:10px"><label class="sw"><input type="checkbox" data-pref="sound"${PREF.sound ? ' checked' : ''}>Ring for new orders</label>
          <label class="sw"><input type="checkbox" data-pref="awake"${PREF.awake ? ' checked' : ''}>Counter mode: keep the screen on</label></div></div>
      <div class="sblock"><b>Backup</b><p class="muted" style="margin:4px 0 10px">The whole sheet is saved as an Excel file in your Google Drive every night, and the newest 30 are kept. You can also save one now, for example before big price changes.</p>
        <div class="btns"><button type="button" class="btn sm gold" data-backup>Backup now</button><a class="btn sm ghost" id="bkfolder" target="_blank" rel="noopener" hidden>Open backups folder</a></div>
        <p class="muted" id="bkinfo" style="margin-top:8px;font-size:.86rem">Checking…</p></div>
      <div style="margin-top:22px;border-top:1px solid var(--line);padding-top:14px"><b>App version ${APP_VERSION}</b><p class="muted" style="margin:4px 0 10px">After uploading new files to GitHub, press this on each phone to load them.</p>
      <button type="button" class="btn ghost" data-hardupdate>Update to latest version</button></div>`;
    paintStatus();
  }
  const notifOn = () => !!(window.Notification && Notification.permission === 'granted');
  let statusT = 0, lastStatus = null;
  function paintStatus() {
    const el = $('#bkinfo'), r = lastStatus; if (!el) return;
    if (!r) { el.textContent = statusT ? '' : 'Checking…'; return; }
    el.textContent = (r.lastBackup ? 'Last backup: ' + when(r.lastBackup) : 'No backup yet.') + (r.emailsLeft !== '' ? ` · Order emails left today: ${r.emailsLeft} of 100` : '');
    const a = $('#bkfolder'); a.href = r.backupFolder; a.hidden = false;
  }
  async function loadStatus(force) {
    if (!force && Date.now() - statusT < 60000) return; statusT = Date.now();
    try { lastStatus = await call('status'); } catch (e) { }
    paintStatus();
  }
  $('.atabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b && b.dataset.tab === 'settings') loadStatus(); });
  $('#sf').addEventListener('click', async e => {
    if (e.target.closest('[data-notif]')) {
      if (!window.Notification) return alert('This phone does not support notifications in this browser. Install ST Admin from Chrome.');
      const p = await Notification.requestPermission();
      if (p !== 'granted') alert('Notifications are blocked. Open phone Settings › Apps › ST Admin (or Chrome) › Notifications and allow them.');
      renderSettings(); loadStatus(true);
    }
    if (e.target.closest('[data-testalert]')) { unlockAudio(); setTimeout(() => alertNew([{ orderId: 'ST-TEST', name: 'Test customer', village: 'Patsendri', estTotal: 1250 }], 0), 300); }
    if (e.target.closest('[data-backup]')) {
      const b = e.target.closest('[data-backup]'); b.disabled = true; b.textContent = 'Saving backup…';
      try { const r = await call('backup_now'); toast('Backup saved: ' + r.name); loadStatus(true); } catch (err) { alert('Backup failed: ' + err.message); }
      b.disabled = false; b.textContent = 'Backup now';
    }
  });
  $('#sf').addEventListener('change', e => {
    const k = e.target.dataset.pref; if (!k) return;
    PREF[k] = e.target.checked; savePref();
    if (k === 'awake') keepAwake(PREF.awake);
    if (k === 'sound' && PREF.sound) chime();
  });
  if (PREF.awake) keepAwake(true);
  $('#sf').addEventListener('submit', async e => {
    e.preventDefault();
    const b = $('#sf .btn'); b.disabled = true;
    try { const r = await call('save_settings', { settings: Object.fromEntries(new FormData($('#sf'))) }); DB.settings = r.settings; DB.v = r.v; saveDB(); toast('Settings saved'); } catch (err) { alert(err.message); }
    b.disabled = false;
  });

  /* ---------- Update to the latest version ---------- */
  async function hardUpdate() {
    toast('Updating ST Admin…');
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) { try { await reg.update(); } catch (e) { } if (reg.waiting) reg.waiting.postMessage({ type: 'skip' }); }
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.filter(k => k.startsWith('sta-app')).map(k => caches.delete(k))); }
    } catch (e) { }
    setTimeout(() => location.reload(), 400);
  }
  async function checkVersion() {
    try {
      const j = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
      const n = String(j.version || '').split('.').map(Number), c = APP_VERSION.split('.').map(Number);
      const isNew = (n[0] || 0) > (c[0] || 0) || ((n[0] || 0) === (c[0] || 0) && (n[1] || 0) > (c[1] || 0));
      $('#updbtn').hidden = !isNew; if (isNew) $('#updbtn').textContent = 'Update to ' + j.version;
    } catch (e) { }
  }
  $('#updbtn').addEventListener('click', hardUpdate);
  document.addEventListener('click', e => { if (e.target.closest('[data-hardupdate]')) hardUpdate(); });
  checkVersion();

  if (key) start();
})();
