#!/usr/bin/env node
// Inscribe dist/noop.html.gz on Solana with the SPL No-op program.
//
//   node tools/inscribe.mjs            # mainnet, uses keys/inscriber.json (creates it on first run and asks you to fund it)
//   node tools/inscribe.mjs --devnet   # same flow on devnet with an airdrop (free rehearsal)
//   node tools/inscribe.mjs --dry      # just print chunk plan + estimated cost
//
// Layout on chain (every tx = one No-op instruction, data = payload):
//   data tx  : raw gzip bytes, PAYLOAD per tx
//   index tx : 64-byte signatures of data txs, in order
//   root tx  : "NOOP" ver(1) sha256(32) size(u32 LE) nchunks(u16 LE) nindex(u16 LE) then index signatures (64 each)
// Progress is saved to dist/inscription.<cluster>.json so a crash resumes where it stopped.
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DEVNET = args.includes('--devnet');
const DRY = args.includes('--dry');
const PAYLOAD = Number((args.find(a => a.startsWith('--payload=')) || '--payload=1024').split('=')[1]);
const CLUSTER = DEVNET ? 'devnet' : 'mainnet';
const RPC = process.env.NOOP_RPC || (DEVNET ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com');
const NOOP = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
const PARALLEL = 6;

const keyPath = resolve(ROOT, 'keys', `inscriber.${CLUSTER}.json`);
const nothingPath = resolve(ROOT, 'keys', `nothing.${CLUSTER}.json`);
const progressPath = resolve(ROOT, 'dist', `inscription.${CLUSTER}.json`);
mkdirSync(resolve(ROOT, 'keys'), { recursive: true });

function loadOrCreate(path, label) {
  if (existsSync(path)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`created ${label} keypair -> ${path}`);
  return kp;
}
const payer = loadOrCreate(keyPath, 'inscriber');
const nothing = loadOrCreate(nothingPath, 'nothing');

const gz = readFileSync(resolve(ROOT, 'dist', 'noop.html.gz'));
const sha = createHash('sha256').update(gz).digest();
const chunks = []; for (let o = 0; o < gz.length; o += PAYLOAD) chunks.push(gz.subarray(o, o + PAYLOAD));
const perIndex = Math.floor(PAYLOAD / 64);
const nIndex = Math.ceil(chunks.length / perIndex);
const totalTx = chunks.length + nIndex + 1;
console.log(`${CLUSTER} · ${gz.length} B gzip · sha256 ${sha.toString('hex')}`);
console.log(`${chunks.length} data + ${nIndex} index + 1 root = ${totalTx} transactions at ${PAYLOAD} B payload`);
console.log(`estimated cost ${(totalTx * 5000).toLocaleString()} lamports = ${(totalTx * 5000 / LAMPORTS_PER_SOL).toFixed(6)} SOL (5,000 per signature)`);
console.log(`inscriber wallet ${payer.publicKey.toBase58()}`);
console.log(`nothing account ${nothing.publicKey.toBase58()}`);
if (DRY) process.exit(0);

const conn = new Connection(RPC, 'confirmed');
let bal = await conn.getBalance(payer.publicKey);
if (bal < totalTx * 5000 + 10000) {
  if (DEVNET) {
    console.log('devnet: requesting airdrop…');
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) {
      try { const sig = await conn.requestAirdrop(payer.publicKey, 0.2 * LAMPORTS_PER_SOL); await conn.confirmTransaction(sig, 'confirmed'); ok = true; }
      catch (e) { console.log(`  airdrop attempt ${i + 1} failed: ${e.message.slice(0, 80)}`); await new Promise(r => setTimeout(r, 4000)); }
    }
    if (!ok) { console.log(`devnet faucet is dry. Send devnet SOL to ${payer.publicKey.toBase58()} from https://faucet.solana.com and rerun.`); process.exit(2); }
    bal = await conn.getBalance(payer.publicKey);
  } else {
    console.log(`\nFund ${payer.publicKey.toBase58()} with at least ${((totalTx * 5000 + 10000) / LAMPORTS_PER_SOL).toFixed(4)} SOL (0.01 is plenty), then run again.`);
    process.exit(2);
  }
}
console.log(`balance ${(bal / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

const progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, 'utf8')) : { cluster: CLUSTER, sha: sha.toString('hex'), payload: PAYLOAD, data: [], index: [], root: null };
if (progress.sha !== sha.toString('hex') || progress.payload !== PAYLOAD) { console.log('bundle changed since last run: starting a fresh inscription'); Object.assign(progress, { sha: sha.toString('hex'), payload: PAYLOAD, data: [], index: [], root: null }); }
const save = () => writeFileSync(progressPath, JSON.stringify(progress, null, 2));

async function sendData(bytes, label) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const tx = new Transaction().add(new TransactionInstruction({ programId: NOOP, keys: [], data: Buffer.from(bytes) }));
      const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: 'confirmed', maxRetries: 3 });
      return sig;
    } catch (e) {
      console.log(`  ${label} attempt ${attempt} failed: ${e.message.slice(0, 120)}`);
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`${label} failed after 5 attempts`);
}
async function pool(items, fn) {
  let i = 0; const workers = Array.from({ length: PARALLEL }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } });
  await Promise.all(workers);
}

// 1. data chunks
const todo = chunks.map((c, i) => i).filter(i => !progress.data[i]);
console.log(`sending ${todo.length} data transactions (${chunks.length - todo.length} already done)…`);
await pool(todo, async i => { progress.data[i] = await sendData(chunks[i], `data ${i}`); save(); process.stdout.write(`\r  data ${progress.data.filter(Boolean).length}/${chunks.length}   `); });
console.log();

// 2. index txs
for (let k = 0; k < nIndex; k++) {
  if (progress.index[k]) continue;
  const sigs = progress.data.slice(k * perIndex, (k + 1) * perIndex).map(s => bs58.decode(s));
  progress.index[k] = await sendData(Buffer.concat(sigs), `index ${k}`); save();
  console.log(`  index ${k + 1}/${nIndex} ${progress.index[k]}`);
}

// 3. root
if (!progress.root) {
  const head = Buffer.alloc(45);
  head.write('NOOP', 0, 'ascii'); head[4] = 1; sha.copy(head, 5); head.writeUInt32LE(gz.length, 37); head.writeUInt16LE(chunks.length, 41); head.writeUInt16LE(nIndex, 43);
  progress.root = await sendData(Buffer.concat([head, ...progress.index.map(s => bs58.decode(s))]), 'root'); save();
}
console.log(`root ${progress.root}`);

// 4. real cost, to the lamport
console.log('summing real fees…');
let cost = 0; const all = [...progress.data, ...progress.index, progress.root];
for (let k = 0; k < all.length; k += 20) {
  const txs = await Promise.all(all.slice(k, k + 20).map(s => conn.getTransaction(s, { commitment: 'confirmed', maxSupportedTransactionVersion: 1 })));
  for (const t of txs) cost += t?.meta?.fee || 0;
}
progress.cost_lamports = cost; progress.wallet = payer.publicKey.toBase58(); progress.nothing = nothing.publicKey.toBase58(); progress.bytes = gz.length; progress.chunks = all.length; progress.nindex = nIndex; save();
console.log(`real cost ${cost.toLocaleString()} lamports = ${(cost / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

// 5. write site/config.js (mainnet only; devnet writes config.devnet.js next to it)
const cfgPath = resolve(ROOT, 'site', DEVNET ? 'config.devnet.js' : 'config.js');
const prev = existsSync(resolve(ROOT, 'site', 'config.js')) ? readFileSync(resolve(ROOT, 'site', 'config.js'), 'utf8') : '';
const keep = k => (prev.match(new RegExp(`${k}:\\s*"([^"]*)"`)) || [, ''])[1];
const cfg = {
  root: progress.root, rpc: DEVNET ? RPC : (keep('rpc') || 'https://api.mainnet-beta.solana.com'), nothing: progress.nothing,
  chunks: all.length, index: nIndex, bytes: gz.length, cost_lamports: cost, sha: sha.toString('hex'), wallet: progress.wallet,
  fees: keep('fees'), ca: keep('ca'), x: keep('x') || 'https://x.com/noopcoin', pump: keep('pump'), git: keep('git') || 'https://github.com/Lindophx/noop',
};
writeFileSync(cfgPath, '// written by tools/inscribe.mjs · ' + new Date().toISOString() + '\nwindow.NOOP_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n');
console.log(`wrote ${cfgPath}\nverify: node tools/verify.mjs ${progress.root}${DEVNET ? ' --devnet' : ''}`);
