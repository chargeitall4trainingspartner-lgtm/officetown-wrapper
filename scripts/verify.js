#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const POSTINSTALL = process.argv.includes('--postinstall');
const problems = [];
const ok = [];
const fail = (m) => problems.push(m);
const pass = (m) => ok.push(m);

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { fail(`${path.relative(ROOT, p)}: ${e.message}`); return null; }
}

function electronBinary() {
  const dist = path.join(ROOT, 'node_modules', 'electron', 'dist');
  if (process.platform === 'win32') return path.join(dist, 'electron.exe');
  if (process.platform === 'darwin') return path.join(dist, 'Electron.app', 'Contents', 'MacOS', 'Electron');
  return path.join(dist, 'electron');
}

/* 1 — Node major inside engines range */
const pkg = readJSON(path.join(ROOT, 'package.json'));
if (pkg) {
  const range = (pkg.engines && pkg.engines.node) || '';
  const min = Number((range.match(/>=\s*(\d+)/) || [])[1] || 0);
  const max = Number((range.match(/<\s*(\d+)/) || [])[1] || 0);
  const major = Number(process.versions.node.split('.')[0]);
  if (min && major < min) fail(`Node ${process.version} below required ${range}`);
  if (max && major >= max) fail(`Node ${process.version} outside required ${range}`);
  if (!problems.length) pass(`node ${process.version}`);
}

/* 2 — lockfile present and modern */
const lockPath = path.join(ROOT, 'package-lock.json');
if (!fs.existsSync(lockPath)) {
  fail('package-lock.json missing — commit it; `npm ci` depends on it');
} else {
  const lock = readJSON(lockPath);
  if (lock) {
    if (!(lock.lockfileVersion >= 3)) fail(`lockfileVersion ${lock.lockfileVersion} < 3`);
    else pass('package-lock.json (v3)');
  }
}

/* 3 — installed Electron equals the pin (drift guard) */
const elPkg = path.join(ROOT, 'node_modules', 'electron', 'package.json');
if (!fs.existsSync(elPkg)) {
  fail('electron not installed — run `npm ci --include=dev`');
} else {
  const installed = readJSON(elPkg);
  const pinned = pkg && pkg.devDependencies && pkg.devDependencies.electron;
  if (installed && pinned && installed.version !== pinned) {
    fail(`electron ${installed.version} installed, ${pinned} pinned — tree drifted from lockfile`);
  } else if (installed) {
    pass(`electron ${installed.version} (exact pin)`);
    const bin = electronBinary();
    if (!fs.existsSync(bin)) fail(`electron binary missing: ${path.relative(ROOT, bin)}`);
    else pass('electron binary present');
  }
}

/* 4 — app files exist and parse */
for (const rel of ['main.js', 'patches/auto-scroll-provenance.js']) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { fail(`missing ${rel}`); continue; }
  try {
    execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
    pass(`${rel} parses`);
  } catch (e) {
    fail(`${rel}: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
  }
}

/* 5 — Linux sandbox advisory */
if (process.platform === 'linux' && !POSTINSTALL) {
  const sb = path.join(ROOT, 'node_modules', 'electron', 'dist', 'chrome-sandbox');
  if (fs.existsSync(sb)) {
    const st = fs.statSync(sb);
    if (st.uid !== 0 || !(st.mode & 0o4000)) {
      ok.push('note: chrome-sandbox is not root:4755 — fine where unprivileged user namespaces are allowed, otherwise see README §Troubleshooting');
    }
  }
}

if (problems.length) {
  console.error('[verify] FAILED');
  for (const p of problems) console.error(`  x ${p}`);
  console.error('\nFix: npm ci --include=dev');
  process.exit(1);
}
if (!POSTINSTALL) {
  console.log('[verify] OK');
  for (const o of ok) console.log(`  + ${o}`);
}