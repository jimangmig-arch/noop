#!/usr/bin/env node
// Rebuild noopcoin.fun from the Solana ledger and check the hash. No trust required.
//   node tools/verify.mjs <root signature> [--devnet] [--rpc=https://...]
// Writes verified.noop.html.gz and verified.noop.html next to this script's parent dir.
import { Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const [root] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!root) { console.log('usage: node tools/verify.mjs <root signature> [--devnet]'); process.exit(1); }
const devnet = process.argv.includes('--devnet');
const rpc = (process.argv.find(a => a.startsWith('--rpc=')) || '').slice(6) || (devnet ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com');
const conn = new Connection(rpc, 'confirmed');

const data = async sig => {
  for (let i = 0; i < 5; i++) {
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 1 });
    if (tx) return Buffer.from(bs58.decode(tx.transaction.message.instructions[0].data));
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('tx not found ' + sig);
};
const many = async sigs => { const out = []; for (let i = 0; i < sigs.length; i += 10) { out.push(...await Promise.all(sigs.slice(i, i + 10).map(data))); process.stdout.write(`\r  ${out.length}/${sigs.length}`); } console.log(); return out; };

const r = await data(root);
if (r.subarray(0, 4).toString() !== 'NOOP') throw new Error('not a NOOP root');
const sha = r.subarray(5, 37).toString('hex'), size = r.readUInt32LE(37), nchunks = r.readUInt16LE(41), nindex = r.readUInt16LE(43);
console.log(`root ok · ${size} bytes · ${nchunks} chunks · ${nindex} index · sha256 ${sha}`);
const idx = await many(Array.from({ length: nindex }, (_, i) => bs58.encode(r.subarray(45 + i * 64, 45 + i * 64 + 64))));
const chunkSigs = []; for (const d of idx) for (let o = 0; o + 64 <= d.length; o += 64) chunkSigs.push(bs58.encode(d.subarray(o, o + 64)));
if (chunkSigs.length !== nchunks) throw new Error('index mismatch');
const gz = Buffer.concat(await many(chunkSigs));
const got = createHash('sha256').update(gz).digest('hex');
console.log(got === sha && gz.length === size ? 'HASH MATCHES. The page is what the ledger says it is.' : 'HASH MISMATCH');
writeFileSync('verified.noop.html.gz', gz); writeFileSync('verified.noop.html', gunzipSync(gz));
console.log('wrote verified.noop.html');
