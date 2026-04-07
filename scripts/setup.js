#!/usr/bin/env node
/**
 * NeuroDEX Setup Script
 * Interactive first-run configuration.
 */

const readline = require('readline');
const { execSync } = require('child_process');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (q) => new Promise(resolve => rl.question(q, resolve));

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

async function main() {
  console.clear();
  console.log(`
${CYAN}${BOLD}
  ⬡  NEURODEX SETUP
  ─────────────────────────────────────
  Sci-fi AI Terminal v1.0.0
${RESET}${DIM}
  Multi-model CLI with eDEX-UI interface
  Claude • OpenAI • Gemini • DeepSeek • Mistral • Ollama
${RESET}`);

  console.log(`\n${YELLOW}Checking dependencies...${RESET}`);

  // Check Node version
  const nodeVer = process.versions.node.split('.').map(Number);
  if (nodeVer[0] < 22) {
    console.error('❌ Node.js 22+ required. Current:', process.version);
    process.exit(1);
  }
  console.log(`${GREEN}✓${RESET} Node.js ${process.version}`);

  // Install dependencies
  console.log(`\n${YELLOW}Installing dependencies...${RESET}`);
  try {
    execSync('npm install', { stdio: 'inherit', cwd: path.dirname(__dirname) });
    console.log(`${GREEN}✓${RESET} Dependencies installed`);
  } catch {
    console.error('❌ Failed to install dependencies');
    process.exit(1);
  }

  // API Key setup
  console.log(`\n${YELLOW}API Key Configuration${RESET}`);
  console.log(`${DIM}Configure at least one AI provider to use NeuroDEX.${RESET}\n`);

  const providers = [
    { id: 'claude', name: 'Anthropic Claude', hint: 'sk-ant-...' },
    { id: 'openai', name: 'OpenAI', hint: 'sk-...' },
    { id: 'gemini', name: 'Google Gemini', hint: 'AIza...' },
    { id: 'deepseek', name: 'DeepSeek', hint: 'sk-...' },
    { id: 'mistral', name: 'Mistral AI', hint: 'your-key' },
  ];

  const keysToSave = [];

  for (const provider of providers) {
    const key = await question(`${provider.name} API Key (${DIM}${provider.hint}${RESET}, or skip): `);
    if (key?.trim()) keysToSave.push({ provider: provider.id, key: key.trim() });
  }

  // Check Ollama
  try {
    execSync('curl -s http://localhost:11434/api/tags > /dev/null 2>&1');
    console.log(`${GREEN}✓${RESET} Ollama detected (local models available)`);
  } catch {
    console.log(`${DIM}  Ollama not running (optional — for local models)${RESET}`);
  }

  if (keysToSave.length === 0) {
    console.log(`\n${YELLOW}⚠ No API keys configured. You can add them later in the Config panel.${RESET}`);
  } else {
    // Save keys using keyVault
    const { setApiKey } = await import('../src/security/keyVault.js');
    for (const { provider, key } of keysToSave) {
      await setApiKey(provider, key);
      console.log(`${GREEN}✓${RESET} Saved ${provider} API key`);
    }
  }

  console.log(`\n${GREEN}${BOLD}Setup complete!${RESET}\n`);
  console.log(`Run NeuroDEX:\n`);
  console.log(`  ${CYAN}npm run dev${RESET}   — Development mode`);
  console.log(`  ${CYAN}npm run build${RESET} — Build production app\n`);

  rl.close();
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
