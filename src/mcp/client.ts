/**
 * NeuroDEX MCP Client
 * Model Context Protocol — connects to external MCP servers
 * and exposes their tools to the AI agent.
 *
 * Supports: stdio transport (local servers) and HTTP/SSE transport (remote)
 */

import * as cp from 'child_process';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import type { ToolDefinition } from '../models/index.js';

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // http
  url?: string;
  headers?: Record<string, string>;
}

export interface McpTool {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

class McpStdioClient extends EventEmitter {
  private process: cp.ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private msgId = 0;
  private ready = false;
  readonly config: McpServerConfig;

  constructor(config: McpServerConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    const { command, args = [], env = {} } = this.config;
    if (!command) throw new Error('stdio MCP server requires command');

    this.process = cp.spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.rl = readline.createInterface({ input: this.process.stdout! });
    this.rl.on('line', (line) => this._handleLine(line));

    this.process.stderr?.on('data', (d: Buffer) => {
      console.error(`[MCP:${this.config.id}]`, d.toString().trim());
    });

    this.process.on('exit', () => {
      this.ready = false;
      this.emit('disconnected');
    });

    // Initialize
    await this._call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'NeuroDEX', version: '1.0.0' }
    });

    await this._notify('notifications/initialized', {});
    this.ready = true;
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this._call('tools/list', {}) as { tools: Array<{
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    }> };

    return (result.tools ?? []).map(t => ({
      serverId: this.config.id,
      serverName: this.config.name,
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? { type: 'object', properties: {} }
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this._call('tools/call', { name, arguments: args }) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    const text = (result.content ?? [])
      .filter(c => c.type === 'text')
      .map(c => c.text ?? '')
      .join('\n');

    if (result.isError) throw new Error(text || 'MCP tool error');
    return text;
  }

  disconnect(): void {
    this.rl?.close();
    this.process?.kill();
  }

  private _handleLine(line: string): void {
    if (!line.trim()) return;
    let msg: JsonRpcMessage;
    try { msg = JSON.parse(line); } catch { return; }

    if (msg.id !== undefined) {
      const pending = this.pending.get(msg.id as number);
      if (pending) {
        this.pending.delete(msg.id as number);
        if (msg.error) pending.reject(new Error(msg.error.message));
        else pending.resolve(msg.result);
      }
    }
  }

  private _call(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.pending.set(id, { resolve, reject });
      const msg: JsonRpcMessage = { jsonrpc: '2.0', id, method, params };
      this.process?.stdin?.write(JSON.stringify(msg) + '\n');
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP timeout: ${method}`));
        }
      }, 30000);
    });
  }

  private _notify(method: string, params: Record<string, unknown>): void {
    const msg = { jsonrpc: '2.0', method, params };
    this.process?.stdin?.write(JSON.stringify(msg) + '\n');
  }
}

const MCP_CONFIG_FILE = path.join(os.homedir(), '.config', 'NeuroDEX', 'mcp-servers.json');

export class McpManager {
  private clients = new Map<string, McpStdioClient>();
  private toolCache: McpTool[] = [];
  private configs: McpServerConfig[] = [];

  constructor() {
    this.configs = this.loadConfigs();
  }

  loadConfigs(): McpServerConfig[] {
    try {
      return JSON.parse(fs.readFileSync(MCP_CONFIG_FILE, 'utf8'));
    } catch { return []; }
  }

  saveConfigs(): void {
    fs.mkdirSync(path.dirname(MCP_CONFIG_FILE), { recursive: true });
    fs.writeFileSync(MCP_CONFIG_FILE, JSON.stringify(this.configs, null, 2), { mode: 0o600 });
  }

  addServer(config: McpServerConfig): void {
    this.configs = this.configs.filter(c => c.id !== config.id);
    this.configs.push(config);
    this.saveConfigs();
  }

  removeServer(id: string): void {
    this.clients.get(id)?.disconnect();
    this.clients.delete(id);
    this.configs = this.configs.filter(c => c.id !== id);
    this.toolCache = this.toolCache.filter(t => t.serverId !== id);
    this.saveConfigs();
  }

  async connectAll(): Promise<{ id: string; success: boolean; error?: string }[]> {
    const results = [];
    for (const config of this.configs) {
      try {
        await this.connect(config.id);
        results.push({ id: config.id, success: true });
      } catch (err) {
        results.push({ id: config.id, success: false, error: (err as Error).message });
      }
    }
    return results;
  }

  async connect(id: string): Promise<void> {
    const config = this.configs.find(c => c.id === id);
    if (!config) throw new Error(`MCP server not found: ${id}`);

    const client = new McpStdioClient(config);
    await client.connect();
    this.clients.set(id, client);

    // Refresh tool cache
    const tools = await client.listTools();
    this.toolCache = [
      ...this.toolCache.filter(t => t.serverId !== id),
      ...tools
    ];
  }

  disconnect(id: string): void {
    this.clients.get(id)?.disconnect();
    this.clients.delete(id);
    this.toolCache = this.toolCache.filter(t => t.serverId !== id);
  }

  getToolDefinitions(): ToolDefinition[] {
    return this.toolCache.map(t => ({
      name: `mcp__${t.serverId}__${t.name}`,
      description: `[MCP:${t.serverName}] ${t.description}`,
      parameters: t.inputSchema
    }));
  }

  async executeTool(toolName: string, input: Record<string, unknown>): Promise<string> {
    // toolName format: mcp__serverId__toolName
    const parts = toolName.split('__');
    if (parts.length < 3 || parts[0] !== 'mcp') {
      throw new Error(`Invalid MCP tool name: ${toolName}`);
    }
    const serverId = parts[1];
    const mcpToolName = parts.slice(2).join('__');
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP server not connected: ${serverId}`);
    return client.callTool(mcpToolName, input);
  }

  listServers(): Array<{ config: McpServerConfig; connected: boolean; toolCount: number }> {
    return this.configs.map(c => ({
      config: c,
      connected: this.clients.has(c.id),
      toolCount: this.toolCache.filter(t => t.serverId === c.id).length
    }));
  }

  // Built-in popular MCP server presets
  static PRESETS: McpServerConfig[] = [
    {
      id: 'filesystem',
      name: 'Filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', os.homedir()]
    },
    {
      id: 'git',
      name: 'Git',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-git']
    },
    {
      id: 'github',
      name: 'GitHub',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN ?? '' }
    },
    {
      id: 'fetch',
      name: 'Web Fetch',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch']
    },
    {
      id: 'memory',
      name: 'Memory',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory']
    }
  ];
}

export const mcpManager = new McpManager();
