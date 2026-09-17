# NOOP — Does nothing. Forever.

`$NOOP` is a memecoin honest enough to say it does nothing. The whole site at [noopcoin.fun](https://noopcoin.fun), game included, is stored on Solana through a **no-op program**, a program that does nothing. We write through `noopXHpJChmCfa1JpS69Y3AesNc27mz3b2JsxwizYCX`, [Dean Little's 336-byte assembly noop](https://github.com/deanmlittle/sbpf-asm-noop): the smallest Solana program, immutable, 1 compute unit per call. Credit where due. The domain serves a 2 KB loader; everything else comes out of the ledger.

- **Play:** an original first-person shooter. You are a NOOP instruction inside a CPU. Every other instruction (ADD, MOV, JMP, MUL) is trying to do something. Halt them. The last level is called RUG.
- **Nothing:** a button that sends a real No-op transaction from your wallet, "did nothing", recorded forever. Live counter and leaderboard read straight from chain.
- **Proof:** root transaction, byte count, real cost to the lamport, SHA-256, and a verify script.

## On chain

| | |
|---|---|
| root transaction | `386xVdYTGeMckFsDpS8yhzyUrEpQd17LFm4mCtHokGEwhFyw2RexRm4aSa22FJLccoGojeHpkHAkoLhParcD1LzE` |
| transactions | 20 (1 root, 2 index, 17 data) |
| bytes | 16,903 gzipped |
| real cost | 100,000 lamports = 0.0001 SOL |
| inscription wallet | `AEPJKDwWdRbnbvc5cQRqF4VUh8V7mqFE8JmYqTywAYzb` |

## Check it yourself

```
npm install
node tools/verify.mjs 386xVdYTGeMckFsDpS8yhzyUrEpQd17LFm4mCtHokGEwhFyw2RexRm4aSa22FJLccoGojeHpkHAkoLhParcD1LzE
```

Reads the root transaction, follows the index, pulls every chunk, gunzips, checks the SHA-256 in the root, writes `verified.noop.html`. If the hash matches, the page is what the ledger says it is.

## Layout on chain

Every transaction is one No-op instruction whose data is the payload.

| tx | data |
|---|---|
| data | raw gzip bytes, 1,024 per tx |
| index | 64-byte signatures of the data txs, in order |
| root | `NOOP` · version (1) · sha256 (32) · size u32 · nchunks u16 · nindex u16 · index signatures |

## Repo

```
src/        page + game source (index.html, style.css, game.js, site.js)
tools/      build.mjs (inline + gzip), inscribe.mjs (write to chain), verify.mjs (read back + hash check)
site/       what noopcoin.fun serves: loader index.html, config.js (root tx etc.), og image
dist/       build output (gitignored)
```

Build: `node tools/build.mjs`. Inscribe: `node tools/inscribe.mjs` (prints the wallet to fund on first run, resumes if interrupted, writes `site/config.js` with the real numbers).

## The honest part

- One coin. No sequel, no v2, no "real" launch.
- Real cost posted to the lamport. Inscription wallet funded in the open.
- Creator fee wallet is public; what happens to fees is in the pinned post and never changes.
- Built by one person and an AI (Claude Code). Game and loader are original code. Libraries used: `@solana/web3.js` and `bs58` in the Node tools only. The page itself has zero dependencies.

Nothing here is financial advice. Nothing here is anything. MIT.
