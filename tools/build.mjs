// Build: inline style.css, game.js and site.js into one self-contained HTML file,
// gzip it, print sizes + sha-256. Output: dist/noop.html, dist/noop.html.gz, site/bundle.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = p => readFileSync(resolve(root, 'src', p), 'utf8');

let html = src('index.html');
html = html.replace('<link rel="stylesheet" href="style.css">', () => '<style>' + src('style.css') + '</style>');
html = html.replace('<script src="game.js"></script>', () => '<script>' + src('game.js') + '</script>');
html = html.replace('<script src="site.js"></script>', () => '<script>' + src('site.js') + '</script>');
// light minify: strip blank lines and leading indentation (safe: no template literals span lines with meaningful whitespace)
html = html.split('\n').map(l => l.replace(/^\s+/, '')).filter(l => l.length).join('\n');

mkdirSync(resolve(root, 'dist'), { recursive: true });
const raw = Buffer.from(html, 'utf8');
const gz = gzipSync(raw, { level: 9 });
writeFileSync(resolve(root, 'dist', 'noop.html'), raw);
writeFileSync(resolve(root, 'dist', 'noop.html.gz'), gz);
writeFileSync(resolve(root, 'site', 'bundle.html'), raw);
const sha = createHash('sha256').update(gz).digest('hex');
const PAYLOAD = Number(process.env.NOOP_PAYLOAD || 1100);
console.log(`raw ${raw.length.toLocaleString()} B · gzip ${gz.length.toLocaleString()} B · sha256(gz) ${sha}`);
console.log(`at ${PAYLOAD} B/tx: ${Math.ceil(gz.length / PAYLOAD)} data txs`);
