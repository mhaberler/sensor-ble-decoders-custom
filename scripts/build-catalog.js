// Build the catalog site from decoders/*.js into site/:
//
//   site/decoders.json      machine-readable catalog (schema 1) for apps
//   site/index.html         browsable page, with a <link rel="alternate"> to the JSON
//   site/decoders/*.js      the decoder files, served as-is
//
// For every decoder it runs the module's `tests`, checks the Sensor Logger
// sandbox rule (no import/require) and records a sha256 of the file. Any
// failure exits non-zero, so CI never publishes a broken catalog.
//
// Zero dependencies: Node >= 20 only (QR encoder vendored in scripts/vendor/).
//
// Env: CATALOG_URL — public URL of the site (CI passes the GitHub Pages URL);
// defaults to catalog.config.json "siteUrl", then http://localhost:8080/.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'decoders');
const OUT = path.join(ROOT, 'site');
const qrcode = createRequire(import.meta.url)('./vendor/qrcode.cjs');

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog.config.json'), 'utf8'));
const siteUrl = withSlash(process.env.CATALOG_URL || config.siteUrl || 'http://localhost:8080/');

function withSlash(u) {
  return u.endsWith('/') ? u : u + '/';
}

// Drop comments, so a comment mentioning "import" doesn't trip the check.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

function runTests(decoder, tests, file) {
  tests.forEach((t, i) => {
    const md = t.given.manufacturerData ? Buffer.from(t.given.manufacturerData, 'hex') : undefined;
    const sd = Object.fromEntries(
      Object.entries(t.given.serviceData ?? {}).map(([uuid, hex]) => [uuid, Buffer.from(hex, 'hex')]),
    );
    const got = decoder.advertisementDecode(md, sd, t.given.meta ?? {});
    try {
      assert.deepStrictEqual(got, t.expected);
    } catch {
      throw new Error(`${file}: test ${i + 1} failed\n  expected ${JSON.stringify(t.expected)}\n  got      ${JSON.stringify(got)}`);
    }
  });
}

async function loadDecoder(file) {
  const full = path.join(SRC, file);
  const src = fs.readFileSync(full);
  if (/\bimport\b|\brequire\s*\(/.test(stripComments(src.toString()))) {
    throw new Error(`${file}: uses import/require — decoders must be self-contained`);
  }
  const mod = await import(pathToFileURL(full).href);
  const d = mod.decoder;
  if (!d || typeof d.decoderName !== 'string' || !d.decoderName) throw new Error(`${file}: no decoder.decoderName`);
  if (typeof d.advertisementDecode !== 'function') throw new Error(`${file}: no advertisementDecode()`);
  const tests = mod.tests ?? [];
  if (!tests.length) throw new Error(`${file}: no tests — add at least one given/expected pair`);
  runTests(d, tests, file);

  const mdFile = path.join(SRC, file.replace(/\.js$/, '.md'));
  const matchers = {};
  for (const k of ['manufacturer', 'serviceUUID', 'name', 'matchAll']) if (d[k] !== undefined) matchers[k] = d[k];
  return {
    entry: {
      decoderName: d.decoderName,
      title: d.title ?? d.decoderName,
      description: d.description ?? '',
      version: d.version ?? '0.0.0',
      author: d.author ?? '',
      license: d.license ?? '',
      tags: d.tags ?? [],
      url: `decoders/${file}`,
      sha256: crypto.createHash('sha256').update(src).digest('hex'),
      matchers,
      updated: fs.statSync(full).mtime.toISOString().slice(0, 10),
    },
    longText: fs.existsSync(mdFile) ? fs.readFileSync(mdFile, 'utf8') : '',
    tests,
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Minimal Markdown: paragraphs, `code`, [text](url), **bold**. Enough for
// decoder notes; anything fancier is shown as plain text.
function markdown(md) {
  return md.trim().split(/\n\s*\n/).map((p) => '<p>' + esc(p)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>') + '</p>').join('\n');
}

// Quiet zone of 4 modules (margin is in pixels: 4 × cellSize) — scanners
// need it, especially on the dark theme.
function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true, alt: 'QR code: ' + text });
}

function importTarget() {
  if (config.qrTarget === 'deeplink') return `sensorble://catalog?url=${encodeURIComponent(siteUrl)}`;
  if (config.webAppUrl) return `${withSlash(config.webAppUrl)}?catalog=${encodeURIComponent(siteUrl)}`;
  return siteUrl;
}

function matcherText(m) {
  return Object.entries(m).map(([k, v]) => `${k}: ${v}`).join(', ') || '—';
}

function page(catalog, extras) {
  const target = importTarget();
  const cards = catalog.decoders.map((e, i) => {
    const { longText, tests } = extras[i];
    const abs = new URL(e.url, siteUrl).href;
    return `<article class="card" id="${esc(e.decoderName)}">
  <h2>${esc(e.title)} <span class="ver">v${esc(e.version)}</span></h2>
  <p>${esc(e.description)}</p>
  ${longText ? markdown(longText) : ''}
  <dl>
    <dt>decoderName</dt><dd><code>${esc(e.decoderName)}</code></dd>
    <dt>Matches</dt><dd><code>${esc(matcherText(e.matchers))}</code></dd>
    <dt>Author</dt><dd>${esc(e.author || '—')}</dd>
    <dt>License</dt><dd>${esc(e.license || '—')}</dd>
    <dt>Tags</dt><dd>${e.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ') || '—'}</dd>
    <dt>sha256</dt><dd><code class="hash">${esc(e.sha256)}</code></dd>
  </dl>
  <div class="url"><input readonly value="${esc(abs)}" aria-label="Decoder URL"><button data-copy="${esc(abs)}">Copy URL</button>
    <a href="${esc(e.url)}">view source</a></div>
  <details><summary>${tests.length} test vector${tests.length === 1 ? '' : 's'}</summary>
    <pre>${esc(JSON.stringify(tests, null, 2))}</pre></details>
</article>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(catalog.title)}</title>
<meta name="description" content="${esc(catalog.description)}">
<link rel="alternate" type="application/vnd.sensorble.catalog+json" href="decoders.json">
<style>
  :root { --bg: #fff; --fg: #1d1d1f; --muted: #5f6368; --card: #f6f7f9; --line: #dfe1e5; --accent: #1565c0; }
  @media (prefers-color-scheme: dark) { :root { --bg: #121417; --fg: #e8eaed; --muted: #9aa0a6; --card: #1d2025; --line: #33373d; --accent: #8ab4f8; } }
  * { box-sizing: border-box; }
  body { margin: 0 auto; max-width: 880px; padding: 1.5rem 16px 3rem; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
  a { color: var(--accent); }
  header { display: flex; gap: 1.5rem; align-items: flex-start; flex-wrap: wrap; }
  header .intro { flex: 1; min-width: 16rem; }
  h1 { margin: 0 0 .4rem; font-size: 1.6rem; }
  .muted { color: var(--muted); }
  .qr { width: 132px; text-align: center; font-size: 12px; }
  .qr svg { width: 132px; height: 132px; background: #fff; border-radius: 6px; }
  .add { display: inline-block; margin: .6rem 0; padding: .5rem .9rem; border-radius: 6px; background: var(--accent); color: var(--bg); text-decoration: none; font-weight: 600; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 1rem 1.1rem; margin: 1rem 0; }
  .card h2 { margin: 0 0 .3rem; font-size: 1.15rem; }
  .ver { font-size: .8rem; color: var(--muted); font-weight: 400; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .2rem .8rem; font-size: 13px; }
  dt { color: var(--muted); } dd { margin: 0; min-width: 0; }
  code { font-family: ui-monospace, monospace; font-size: 12.5px; }
  .hash { word-break: break-all; }
  .tag { display: inline-block; padding: 0 .5rem; border-radius: 999px; border: 1px solid var(--line); font-size: 12px; }
  .url { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin: .6rem 0; }
  .url input { flex: 1; min-width: 12rem; font: 13px ui-monospace, monospace; padding: .4rem; background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 4px; }
  button { padding: .4rem .8rem; border-radius: 4px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); cursor: pointer; }
  pre { overflow: auto; font-size: 12px; background: var(--bg); padding: .5rem; border-radius: 4px; }
  footer { margin-top: 2rem; font-size: 13px; }
</style>
</head>
<body>
<header>
  <div class="intro">
    <h1>${esc(catalog.title)}</h1>
    <p>${esc(catalog.description)}</p>
    ${config.webAppUrl ? `<a class="add" href="${esc(importTarget())}">Add to Sensor-BLE</a>` : ''}
    <p class="muted">${catalog.decoders.length} decoder${catalog.decoders.length === 1 ? '' : 's'} ·
      machine-readable: <a href="decoders.json">decoders.json</a> ·
      Sensor Logger: copy a decoder URL into <em>Custom Decoders → Add Decoder</em>.</p>
  </div>
  <div class="qr">${qrSvg(target)}<div class="muted">Scan to add this catalog</div></div>
</header>
<main>
${cards}
</main>
<footer class="muted">Built ${esc(catalog.generated)} from
  ${catalog.homepage ? `<a href="${esc(catalog.homepage)}">${esc(catalog.homepage)}</a>` : 'this repository'}.
  Decoders follow the <a href="https://github.com/tszheichoi/sensor-ble#sensor-ble-api">sensor-ble API</a>.</footer>
<script>
  for (const b of document.querySelectorAll('button[data-copy]')) {
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; }
      catch { b.previousElementSibling.select(); b.textContent = 'Press ⌘/Ctrl-C'; }
      setTimeout(() => { b.textContent = 'Copy URL'; }, 1500);
    });
  }
</script>
</body>
</html>
`;
}

async function main() {
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
  if (!files.length) throw new Error('no decoders in decoders/');
  const loaded = [];
  for (const f of files) loaded.push(await loadDecoder(f));

  const names = loaded.map((l) => l.entry.decoderName);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`duplicate decoderName: ${dup}`);

  const catalog = {
    schema: 1,
    title: config.title,
    description: config.description,
    homepage: config.homepage ?? '',
    generated: new Date().toISOString(),
    decoders: loaded.map((l) => l.entry),
  };

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'decoders'), { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(SRC, f), path.join(OUT, 'decoders', f));
  fs.writeFileSync(path.join(OUT, 'decoders.json'), JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'index.html'), page(catalog, loaded));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  console.log(`built ${files.length} decoder(s) into site/ for ${siteUrl}`);
  for (const e of catalog.decoders) console.log(`  ${e.decoderName} v${e.version}  ${e.sha256.slice(0, 12)}…`);
}

main().catch((e) => {
  console.error(`build-catalog: ${e.message}`);
  process.exit(1);
});
