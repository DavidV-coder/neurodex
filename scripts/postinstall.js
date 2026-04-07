#!/usr/bin/env node
/**
 * postinstall.js
 * 1. Rebuild native modules for Electron ABI
 * 2. Fix spawn-helper permissions for node-pty on macOS
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// 1. Fix node-pty spawn-helper permissions (required on macOS)
const spawnHelpers = [
  path.join(ROOT, 'node_modules', 'node-pty', 'prebuilds', 'darwin-arm64', 'spawn-helper'),
  path.join(ROOT, 'node_modules', 'node-pty', 'prebuilds', 'darwin-x64', 'spawn-helper'),
  path.join(ROOT, 'node_modules', 'node-pty', 'build', 'Release', 'spawn-helper'),
];

for (const p of spawnHelpers) {
  if (fs.existsSync(p)) {
    try {
      fs.chmodSync(p, 0o755);
      console.log('[postinstall] chmod +x', path.relative(ROOT, p));
    } catch (e) {
      console.warn('[postinstall] chmod failed:', e.message);
    }
  }
}

// 2. Rebuild native modules for Electron
async function rebuild() {
  try {
    const electronPkgPath = path.join(ROOT, 'node_modules', 'electron', 'package.json');
    if (!fs.existsSync(electronPkgPath)) {
      console.log('[postinstall] electron not installed yet, skipping rebuild');
      return;
    }
    const electronVersion = require(electronPkgPath).version;
    console.log('[postinstall] Rebuilding native modules for Electron', electronVersion);
    const { rebuild: doRebuild } = require('@electron/rebuild');
    await doRebuild({
      buildPath: ROOT,
      electronVersion,
      force: false,
      onlyModules: ['better-sqlite3', 'node-pty', 'bufferutil', 'keytar'],
    });
    console.log('[postinstall] Native modules rebuilt OK');
  } catch (e) {
    console.warn('[postinstall] Rebuild skipped:', e.message);
  }
}

rebuild();
