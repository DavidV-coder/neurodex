#!/usr/bin/env node
/**
 * NeuroDEX CLI
 * neurodex <command> [options]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { setApiKey, getApiKey, listProviders, deleteApiKey } from '../security/keyVault.js';
import { MODELS } from '../models/index.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'NeuroDEX');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');

const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const YELLOW= '\x1b[33m';
const DIM   = '\x1b[2m';
const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';

function q(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, a => { rl.close(); resolve(a.trim()); }));
}

function readSettings(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return {}; }
}

function writeSettings(s: Record<string, unknown>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {

  // ── config ──────────────────────────────────────────────────────────────
  'config': async (args) => {
    const sub = args[0];
    if (!sub || sub === 'show') {
      const s = readSettings();
      const providers = await listProviders();
      console.log(`\n${CYAN}${BOLD}NeuroDEX Configuration${RESET}\n`);
      console.log(`${DIM}Config dir:${RESET} ${CONFIG_DIR}`);
      console.log(`\n${CYAN}API Keys:${RESET}`);
      if (providers.length === 0) console.log(`  ${DIM}No keys configured${RESET}`);
      for (const p of providers) console.log(`  ${GREEN}✓${RESET} ${p}`);
      console.log(`\n${CYAN}Settings:${RESET}`);
      console.log(JSON.stringify(s, null, 2).split('\n').map(l => '  ' + l).join('\n'));
      console.log();
      return;
    }
    if (sub === 'set') {
      const [key, ...valueParts] = args.slice(1);
      const value = valueParts.join(' ');
      if (!key || !value) { console.error(`Usage: neurodex config set <key> <value>`); process.exit(1); }
      const s = readSettings();
      // Support nested keys: model.default, permissions.bash etc.
      const parts = key.split('.');
      let obj: Record<string, unknown> = s;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
        obj = obj[parts[i]] as Record<string, unknown>;
      }
      // Auto-cast value
      obj[parts[parts.length - 1]] = value === 'true' ? true : value === 'false' ? false
        : /^\d+$/.test(value) ? parseInt(value) : value;
      writeSettings(s);
      console.log(`${GREEN}✓${RESET} Set ${key} = ${value}`);
      return;
    }
    if (sub === 'get') {
      const key = args[1];
      if (!key) { console.error('Usage: neurodex config get <key>'); process.exit(1); }
      const s = readSettings();
      const parts = key.split('.');
      let val: unknown = s;
      for (const p of parts) val = (val as Record<string, unknown>)?.[p];
      console.log(val !== undefined ? String(val) : `${DIM}(not set)${RESET}`);
      return;
    }
    console.error(`Unknown config subcommand: ${sub}`);
  },

  // ── keys ────────────────────────────────────────────────────────────────
  'keys': async (args) => {
    const sub = args[0] || 'list';
    if (sub === 'list') {
      const providers = await listProviders();
      console.log(`\n${CYAN}${BOLD}API Keys${RESET}\n`);
      if (!providers.length) { console.log(`  ${DIM}No keys configured. Run: neurodex keys add${RESET}\n`); return; }
      for (const p of providers) {
        const key = await getApiKey(p);
        const masked = key ? key.slice(0, 8) + '...' + key.slice(-4) : '(error)';
        console.log(`  ${GREEN}✓${RESET}  ${p.padEnd(12)} ${DIM}${masked}${RESET}`);
      }
      console.log();
      return;
    }
    if (sub === 'add' || sub === 'set') {
      const providers = ['claude', 'openai', 'gemini', 'deepseek', 'mistral'];
      let provider = args[1];
      let key = args[2];
      if (!provider) {
        console.log(`\nProviders: ${providers.join(', ')}`);
        provider = await q('Provider: ');
      }
      if (!providers.includes(provider)) { console.error(`Unknown provider: ${provider}`); process.exit(1); }
      if (!key) key = await q(`${provider} API key: `);
      if (!key.trim()) { console.error('Key cannot be empty'); process.exit(1); }
      await setApiKey(provider, key.trim());
      console.log(`${GREEN}✓${RESET} Saved ${provider} API key`);
      return;
    }
    if (sub === 'remove' || sub === 'delete') {
      const provider = args[1] || await q('Provider to remove: ');
      await deleteApiKey(provider);
      console.log(`${GREEN}✓${RESET} Removed ${provider} API key`);
      return;
    }
    if (sub === 'test') {
      const provider = args[1];
      if (!provider) { console.error('Usage: neurodex keys test <provider>'); process.exit(1); }
      const key = await getApiKey(provider);
      if (!key) { console.log(`${RED}✗${RESET} No key for ${provider}`); return; }
      console.log(`Testing ${provider}...`);
      try {
        const { getAdapter } = await import('../models/registry.js');
        const model = MODELS.find(m => m.provider === provider);
        if (!model) throw new Error('No models for provider');
        const adapter = await getAdapter(provider as never, model.model);
        const ok = await adapter.isAvailable();
        console.log(ok ? `${GREEN}✓${RESET} ${provider} key is valid` : `${RED}✗${RESET} ${provider} key test failed`);
      } catch (e) {
        console.log(`${RED}✗${RESET} Error: ${(e as Error).message}`);
      }
      return;
    }
    console.error(`Usage: neurodex keys [list|add|remove|test]`);
  },

  // ── model ────────────────────────────────────────────────────────────────
  'model': async (args) => {
    const sub = args[0] || 'list';
    if (sub === 'list') {
      console.log(`\n${CYAN}${BOLD}Available Models${RESET}\n`);
      const byProvider: Record<string, typeof MODELS> = {};
      for (const m of MODELS) {
        if (!byProvider[m.provider]) byProvider[m.provider] = [];
        byProvider[m.provider].push(m);
      }
      for (const [provider, models] of Object.entries(byProvider)) {
        console.log(`${CYAN}${provider}${RESET}`);
        for (const m of models) {
          const caps = [
            m.supportsTools ? 'tools' : '',
            m.supportsVision ? 'vision' : '',
            m.supportsThinking ? 'thinking' : ''
          ].filter(Boolean).join(', ');
          console.log(`  ${m.model.padEnd(36)} ${DIM}${(m.contextWindow/1000).toFixed(0)}K ctx  ${caps}${RESET}`);
        }
      }
      console.log();
      const s = readSettings();
      const def = (s as Record<string, Record<string, string>>).model?.default;
      if (def) console.log(`${DIM}Default: ${def}${RESET}\n`);
      return;
    }
    if (sub === 'set') {
      const modelId = args[1];
      if (!modelId) { console.error('Usage: neurodex model set <model-id>'); process.exit(1); }
      const found = MODELS.find(m => m.model === modelId || m.displayName === modelId);
      if (!found) { console.error(`Model not found: ${modelId}`); process.exit(1); }
      const s = readSettings() as Record<string, Record<string, string>>;
      if (!s.model) s.model = {};
      s.model.default = found.model;
      s.model.provider = found.provider;
      writeSettings(s);
      console.log(`${GREEN}✓${RESET} Default model: ${found.displayName}`);
      return;
    }
    console.error('Usage: neurodex model [list|set <id>]');
  },

  // ── mcp ─────────────────────────────────────────────────────────────────
  'mcp': async (args) => {
    const sub = args[0] || 'list';
    const MCP_FILE = path.join(CONFIG_DIR, 'mcp-servers.json');
    const servers: Array<Record<string, unknown>> = (() => {
      try { return JSON.parse(fs.readFileSync(MCP_FILE, 'utf8')); } catch { return []; }
    })();

    if (sub === 'list') {
      console.log(`\n${CYAN}${BOLD}MCP Servers${RESET}\n`);
      if (!servers.length) { console.log(`  ${DIM}No MCP servers configured${RESET}\n`); return; }
      for (const s of servers) {
        console.log(`  ${GREEN}${s.id}${RESET}  ${DIM}${s.command} ${(s.args as string[])?.join(' ')}${RESET}`);
      }
      console.log();
      return;
    }
    if (sub === 'add') {
      const id = args[1] || await q('Server ID (e.g. filesystem): ');
      const command = args[2] || await q('Command (e.g. npx): ');
      const argsStr = args[3] || await q('Args (e.g. -y @modelcontextprotocol/server-filesystem ~/): ');
      const server = { id, name: id, transport: 'stdio', command, args: argsStr.split(' ').filter(Boolean) };
      const existing = servers.filter((s) => s.id !== id);
      existing.push(server);
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.writeFileSync(MCP_FILE, JSON.stringify(existing, null, 2), { mode: 0o600 });
      console.log(`${GREEN}✓${RESET} Added MCP server: ${id}`);
      return;
    }
    if (sub === 'remove') {
      const id = args[1] || await q('Server ID to remove: ');
      const filtered = servers.filter((s) => s.id !== id);
      fs.writeFileSync(MCP_FILE, JSON.stringify(filtered, null, 2));
      console.log(`${GREEN}✓${RESET} Removed: ${id}`);
      return;
    }
    if (sub === 'presets') {
      const { McpManager } = await import('../mcp/client.js');
      console.log(`\n${CYAN}${BOLD}MCP Presets${RESET}\n`);
      for (const p of McpManager.PRESETS) {
        console.log(`  ${GREEN}${p.id}${RESET}  ${DIM}${p.command} ${p.args?.join(' ')}${RESET}`);
      }
      console.log(`\nInstall preset: ${DIM}neurodex mcp add-preset <id>${RESET}\n`);
      return;
    }
    if (sub === 'add-preset') {
      const { McpManager } = await import('../mcp/client.js');
      const id = args[1];
      const preset = McpManager.PRESETS.find(p => p.id === id);
      if (!preset) { console.error(`Preset not found: ${id}. Run: neurodex mcp presets`); process.exit(1); }
      const existing = servers.filter((s) => s.id !== preset.id);
      existing.push(preset as unknown as Record<string, unknown>);
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.writeFileSync(MCP_FILE, JSON.stringify(existing, null, 2), { mode: 0o600 });
      console.log(`${GREEN}✓${RESET} Added preset: ${preset.name}`);
      return;
    }
    console.error('Usage: neurodex mcp [list|add|remove|presets|add-preset <id>]');
  },

  // ── onboard ──────────────────────────────────────────────────────────────
  'onboard': async () => {
    console.clear();
    console.log(`${CYAN}${BOLD}
  ⬡  NEURODEX SETUP
  ──────────────────────────────
${RESET}`);
    const s = readSettings();

    // API keys
    console.log(`${BOLD}1. API Keys${RESET} ${DIM}(press Enter to skip)${RESET}\n`);
    for (const [p, hint] of [
      ['claude', 'sk-ant-...'],
      ['openai', 'sk-...'],
      ['gemini', 'AIza...'],
      ['deepseek', 'sk-...'],
      ['mistral', '...'],
    ] as [string, string][]) {
      const existing = await getApiKey(p);
      const prompt = existing
        ? `  ${p} ${DIM}(already set, Enter to keep)${RESET}: `
        : `  ${p} ${DIM}(${hint})${RESET}: `;
      const val = await q(prompt);
      if (val.trim()) { await setApiKey(p, val.trim()); console.log(`  ${GREEN}✓${RESET} Saved`); }
    }

    // Default model
    console.log(`\n${BOLD}2. Default Model${RESET}\n`);
    const providers = await listProviders();
    const available = MODELS.filter(m => providers.includes(m.provider));
    available.forEach((m, i) => console.log(`  ${DIM}${i + 1}.${RESET} ${m.displayName}`));
    const choice = await q('\n  Choose number (Enter = claude-sonnet-4-6): ');
    const chosen = available[parseInt(choice) - 1];
    if (chosen) {
      const ss = s as Record<string, Record<string, string>>;
      if (!ss.model) ss.model = {};
      ss.model.default = chosen.model;
      ss.model.provider = chosen.provider;
      console.log(`  ${GREEN}✓${RESET} Default: ${chosen.displayName}`);
    }

    // Permissions
    console.log(`\n${BOLD}3. Permission Mode${RESET}\n`);
    console.log(`  ${DIM}ask${RESET}   — confirm each bash command (recommended)`);
    console.log(`  ${DIM}allow${RESET} — auto-allow all (fast, less safe)`);
    const perm = await q('\n  Bash commands (ask/allow) [ask]: ') || 'ask';
    const ss = s as Record<string, Record<string, string>>;
    if (!ss.permissions) ss.permissions = {};
    ss.permissions.bash = perm === 'allow' ? 'allow' : 'ask';

    writeSettings(s);
    console.log(`\n${GREEN}${BOLD}Setup complete!${RESET}`);
    console.log(`\nRun: ${CYAN}neurodex${RESET} to launch\n`);
  },

  // ── status ───────────────────────────────────────────────────────────────
  'status': async () => {
    console.log(`\n${CYAN}${BOLD}NeuroDEX Status${RESET}\n`);
    const providers = await listProviders();
    console.log(`${CYAN}API Keys:${RESET}  ${providers.length > 0 ? providers.join(', ') : `${RED}none${RESET}`}`);
    const s = readSettings() as Record<string, Record<string, string>>;
    const model = s.model?.default || 'claude-sonnet-4-6';
    console.log(`${CYAN}Model:${RESET}     ${model}`);
    const TOKEN_FILE = path.join(CONFIG_DIR, 'gateway.token');
    const gwRunning = fs.existsSync(TOKEN_FILE);
    console.log(`${CYAN}Gateway:${RESET}   ${gwRunning ? `${GREEN}running${RESET}` : `${DIM}not running (launch app)${RESET}`}`);
    console.log(`${CYAN}Config:${RESET}    ${CONFIG_DIR}\n`);
  },

  // ── help ─────────────────────────────────────────────────────────────────
  'help': async () => {
    console.log(`
${CYAN}${BOLD}NeuroDEX CLI${RESET}

${BOLD}Setup:${RESET}
  neurodex onboard              Interactive first-run setup
  neurodex status               Show current configuration

${BOLD}API Keys:${RESET}
  neurodex keys list            List configured providers
  neurodex keys add [provider] [key]
  neurodex keys remove <provider>
  neurodex keys test <provider> Test key validity

${BOLD}Models:${RESET}
  neurodex model list           List all available models
  neurodex model set <id>       Set default model

${BOLD}Config:${RESET}
  neurodex config show          Show all settings
  neurodex config set <key> <value>
  neurodex config get <key>

${BOLD}MCP Servers:${RESET}
  neurodex mcp list             List configured MCP servers
  neurodex mcp presets          Show available presets
  neurodex mcp add-preset <id>  Install a preset server
  neurodex mcp add [id] [cmd] [args]
  neurodex mcp remove <id>

${BOLD}Examples:${RESET}
  ${DIM}neurodex keys add claude sk-ant-api03-...
  neurodex model set claude-opus-4-6
  neurodex config set permissions.bash allow
  neurodex mcp add-preset filesystem
  neurodex mcp add-preset github${RESET}
`);
  }
};

async function main(): Promise<void> {
  const [,, cmd = 'help', ...args] = process.argv;
  const handler = COMMANDS[cmd];
  if (!handler) {
    console.error(`${RED}Unknown command: ${cmd}${RESET}`);
    await COMMANDS['help']([]);
    process.exit(1);
  }
  try {
    await handler(args);
  } catch (err) {
    console.error(`${RED}Error: ${(err as Error).message}${RESET}`);
    process.exit(1);
  }
}

main();
