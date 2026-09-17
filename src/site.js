/* NOOP site logic: tabs, proof facts, and the Do Nothing button.
   No libraries. Base58 + legacy Solana message serialization are hand-rolled below (~60 lines). */
(function () {
  'use strict';
  const C = Object.assign({
    root: '', rpc: 'https://api.mainnet-beta.solana.com', nothing: '', chunks: 0, bytes: 0, cost_lamports: 0, sha: '',
    wallet: '', fees: '', ca: '', x: 'https://x.com/noopcoin', pump: '', git: 'https://github.com/Lindophx/noop', loaded_from_chain: false,
  }, window.NOOP_CONFIG || {});
  const $ = id => document.getElementById(id);
  const NOOP_PROGRAM = 'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV';
  const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

  // ---------- tabs ----------
  const tabs = ['play', 'nothing', 'proof'];
  function show(t) {
    if (!tabs.includes(t)) t = 'play';
    for (const id of tabs) $(id).hidden = id !== t;
    document.querySelectorAll('nav a[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === t));
    if (t === 'nothing') refreshNothing();
    if (history.replaceState) history.replaceState(null, '', '#' + t);
  }
  document.querySelectorAll('a[data-tab]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); show(a.dataset.tab); }));
  show((location.hash || '#play').slice(1));

  // ---------- links + proof facts ----------
  const setHref = (id, url) => { const a = $(id); if (!a) return; if (url) { a.href = url; } else { a.style.display = 'none'; } };
  setHref('lnk-x', C.x); setHref('lnk-pump', C.pump); setHref('lnk-git', C.git);
  if (C.git) $('foot-git').innerHTML = '<a href="' + C.git + '" target="_blank" rel="noopener">source</a>';
  if (C.ca) { $('ca-box').hidden = false; $('ca').textContent = C.ca; $('ca-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(C.ca); $('ca-copy').textContent = 'copied'; setTimeout(() => $('ca-copy').textContent = 'copy', 1200); }; }
  $('served').textContent = C.loaded_from_chain ? 'served from the Solana ledger · 0 servers' : 'preview build · not inscribed yet';
  const short = s => s ? s.slice(0, 6) + '…' + s.slice(-6) : '—';
  if (C.root) { $('p-root').textContent = short(C.root); $('p-root').href = 'https://solscan.io/tx/' + C.root; }
  if (C.chunks) $('p-chunks').textContent = C.chunks + ' (1 root, ' + (C.index || 0) + ' index, ' + (C.chunks - 1 - (C.index || 0)) + ' data)';
  if (C.bytes) $('p-bytes').textContent = C.bytes.toLocaleString() + ' bytes gzipped';
  if (C.cost_lamports) $('p-cost').textContent = C.cost_lamports.toLocaleString() + ' lamports = ' + (C.cost_lamports / 1e9).toFixed(6) + ' SOL';
  if (C.sha) $('p-sha').textContent = C.sha;
  if (C.wallet) { $('p-wallet').textContent = C.wallet; $('p-wallet').href = 'https://solscan.io/account/' + C.wallet; }
  if (C.fees) { $('p-fees').textContent = C.fees; $('p-fees').href = 'https://solscan.io/account/' + C.fees; } else $('p-fees').textContent = 'published at launch';
  if (C.git) $('verify').innerHTML = '<code>// node tools/verify.mjs ' + (C.root || '&lt;root signature&gt;') + '\n// rebuilds noop.html.gz from chain, checks the sha-256 in the root, writes the file\n// source: ' + C.git + '/blob/main/tools/verify.mjs</code>';

  // ---------- base58 ----------
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58decode(s) {
    const bytes = [0];
    for (const ch of s) {
      let carry = B58.indexOf(ch); if (carry < 0) throw new Error('bad base58');
      for (let i = 0; i < bytes.length; i++) { carry += bytes[i] * 58; bytes[i] = carry & 0xff; carry >>= 8; }
      while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
    }
    for (const ch of s) { if (ch !== '1') break; bytes.push(0); }
    return new Uint8Array(bytes.reverse());
  }
  function b58encode(buf) {
    const digits = [0];
    for (const b of buf) {
      let carry = b;
      for (let i = 0; i < digits.length; i++) { carry += digits[i] << 8; digits[i] = carry % 58; carry = (carry / 58) | 0; }
      while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    let s = ''; for (const b of buf) { if (b !== 0) break; s += '1'; }
    for (let i = digits.length - 1; i >= 0; i--) s += B58[digits[i]];
    return s;
  }
  function cu16(n) { const out = []; do { let b = n & 0x7f; n >>= 7; if (n) b |= 0x80; out.push(b); } while (n); return out; }
  const utf8 = s => Array.from(new TextEncoder().encode(s));

  // Legacy message: [payer(sw), nothing(r), noop(r), memo(r)] + 2 instructions
  function buildMessage(payer, blockhash) {
    const keys = [payer, C.nothing, NOOP_PROGRAM, MEMO_PROGRAM];
    const note = utf8('did nothing'), memo = utf8('noop ' + payer);
    const msg = [1, 0, 3, ...cu16(keys.length)];
    for (const k of keys) msg.push(...b58decode(k));
    msg.push(...b58decode(blockhash));
    msg.push(...cu16(2));
    msg.push(2, ...cu16(1), 1, ...cu16(note.length), ...note);
    msg.push(3, ...cu16(0), ...cu16(memo.length), ...memo);
    return new Uint8Array(msg);
  }

  // ---------- rpc ----------
  let rpcId = 1;
  async function rpc(method, params) {
    const r = await fetch(C.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }) });
    const j = await r.json(); if (j.error) throw new Error(j.error.message || 'rpc error'); return j.result;
  }

  // ---------- nothing counter ----------
  let nothingBusy = false;
  async function refreshNothing() {
    if (nothingBusy) return; nothingBusy = true;
    const count = $('count'), leaders = $('leaders'), recent = $('recent');
    if (!C.nothing) { count.textContent = '0'; leaders.innerHTML = '<li class="dim">goes live with the coin</li>'; recent.innerHTML = '<li class="dim">nothing yet</li>'; nothingBusy = false; return; }
    try {
      const all = []; let before = undefined;
      for (let page = 0; page < 20; page++) {
        const batch = await rpc('getSignaturesForAddress', [C.nothing, { limit: 1000, before }]);
        for (const s of batch) if (!s.err) all.push(s);
        if (batch.length < 1000) break; before = batch[batch.length - 1].signature;
      }
      count.textContent = all.length.toLocaleString();
      const by = {};
      for (const s of all) { const m = /noop ([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(s.memo || ''); if (m) by[m[1]] = (by[m[1]] || 0) + 1; }
      const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10);
      leaders.innerHTML = top.length ? top.map(([k, n]) => '<li><b>' + short(k) + '</b> <span class="n">' + n + '</span></li>').join('') : '<li class="dim">nobody has done nothing yet</li>';
      recent.innerHTML = all.slice(0, 8).map(s => { const m = /noop ([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(s.memo || ''); const who = m ? short(m[1]) : 'someone'; const when = s.blockTime ? ago(s.blockTime) : ''; return '<li><a href="https://solscan.io/tx/' + s.signature + '" target="_blank" rel="noopener">' + who + '</a> did nothing <span class="dim">' + when + '</span></li>'; }).join('') || '<li class="dim">nothing yet</li>';
    } catch (e) { count.textContent = '?'; leaders.innerHTML = '<li class="dim">rpc busy, try again</li>'; recent.innerHTML = ''; }
    nothingBusy = false;
  }
  function ago(t) { const s = (Date.now() / 1000 - t) | 0; if (s < 60) return s + 's ago'; if (s < 3600) return ((s / 60) | 0) + 'm ago'; if (s < 86400) return ((s / 3600) | 0) + 'h ago'; return ((s / 86400) | 0) + 'd ago'; }

  // ---------- do nothing ----------
  const btn = $('do-nothing'), status = $('nothing-status');
  btn.addEventListener('click', async () => {
    if (!C.nothing) { status.textContent = 'not live yet. soon.'; return; }
    const w = window.phantom?.solana || window.solana || window.solflare;
    if (!w) { status.innerHTML = 'no wallet found. install <a href="https://phantom.app" target="_blank" rel="noopener">Phantom</a> and come back to do nothing.'; return; }
    btn.disabled = true;
    try {
      status.textContent = 'connecting…';
      const res = await w.connect(); const payer = (res && res.publicKey ? res.publicKey : w.publicKey).toString();
      status.textContent = 'preparing to do nothing…';
      const bh = (await rpc('getLatestBlockhash', [{ commitment: 'finalized' }])).value.blockhash;
      const message = b58encode(buildMessage(payer, bh));
      status.textContent = 'sign it. it does nothing.';
      let sig;
      if (w.request) { const out = await w.request({ method: 'signAndSendTransaction', params: { message } }); sig = out.signature || out; }
      else throw new Error('wallet has no request()');
      status.innerHTML = 'nothing done. <a href="https://solscan.io/tx/' + sig + '" target="_blank" rel="noopener">receipt</a>';
      setTimeout(refreshNothing, 4000);
    } catch (e) { status.textContent = (e && e.message) ? e.message : 'nothing happened, but not the good kind'; }
    btn.disabled = false;
  });
})();
