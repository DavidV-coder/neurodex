#!/usr/bin/env node
/**
 * NeuroDEX CLI entry point
 * Calls the compiled TypeScript CLI or falls back to tsx for development
 */

const path = require('path');
const { existsSync } = require('fs');

const compiled = path.join(__dirname, '..', 'dist', 'cli', 'cli', 'index.js');
const source   = path.join(__dirname, '..', 'src',  'cli', 'index.ts');

if (existsSync(compiled)) {
  require(compiled);
} else if (existsSync(source)) {
  // Dev mode: run via tsx
  const tsx = path.join(__dirname, '..', 'node_modules', '.bin', 'tsx');
  const { spawnSync } = require('child_process');
  const result = spawnSync(tsx, [source, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(result.status ?? 0);
} else {
  console.error('NeuroDEX CLI not found. Run: npm run build:cli');
  process.exit(1);
}
