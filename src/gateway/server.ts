/**
 * NeuroDEX Gateway Server
 * WebSocket server with JSON-RPC 2.0 protocol.
 * This is the brain — connects UI to models, tools, and sessions.
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as crypto from 'crypto';
import { sessionManager } from '../sessions/manager.js';
import { getAdapter, getAvailableProviders } from '../models/registry.js';
import { executeTool, getToolDefinitions } from '../tools/index.js';
import { permissionManager } from '../security/permissions.js';
import { setApiKey, getApiKey, listProviders, deleteApiKey } from '../security/keyVault.js';
import { MODELS } from '../models/index.js';
import { mcpManager, McpManager } from '../mcp/client.js';
import { skillsRegistry } from '../skills/registry.js';
import type { Message, GenerateResult, StreamChunk, ModelProvider } from '../models/index.js';

export interface GatewayConfig {
  port: number;
  host: string;
  authToken?: string;
}

interface RpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface RpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ClientInfo {
  ws: WebSocket;
  authenticated: boolean;
  sessionId?: string;
}

export class GatewayServer {
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private config: GatewayConfig;
  private token: string;
  private configStore: Map<string, unknown> = new Map();
  private startTime: number = Date.now();

  // Accessors for RPC handlers
  get host(): string { return this.config.host; }
  get port(): number { return this.config.port; }
  get sessions(): Map<string, ClientInfo> { return this.clients; }

  constructor(config: Partial<GatewayConfig> = {}) {
    this.config = {
      port: config.port ?? 18789,
      host: config.host ?? '127.0.0.1',
      authToken: config.authToken
    };
    // Generate a session token if none provided
    this.token = this.config.authToken ?? crypto.randomBytes(32).toString('hex');
  }

  getToken(): string { return this.token; }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer();
      this.wss = new WebSocketServer({
        server: this.httpServer,
        // Only allow localhost connections
        verifyClient: (info: { req: http.IncomingMessage }) => {
          const origin = info.req.socket.remoteAddress;
          return origin === '127.0.0.1' || origin === '::1' || origin === '::ffff:127.0.0.1';
        }
      });

      this.wss.on('connection', (ws, req) => {
        const clientId = crypto.randomUUID();
        this.clients.set(clientId, { ws, authenticated: false });

        ws.on('message', (data) => this.handleMessage(clientId, data.toString()));
        ws.on('close', () => this.clients.delete(clientId));
        ws.on('error', (err) => console.error(`[Gateway] Client error:`, err));

        // Send welcome
        this.send(ws, {
          jsonrpc: '2.0',
          id: 'init',
          result: { type: 'connected', clientId, requiresAuth: true }
        });
      });

      this.httpServer.listen(this.config.port, this.config.host, () => {
        console.log(`[Gateway] NeuroDEX Gateway started on ${this.config.host}:${this.config.port}`);
        resolve();
      });

      this.httpServer.on('error', reject);
    });
  }

  stop(): void {
    this.wss?.close();
    this.httpServer?.close();
  }

  private send(ws: WebSocket, data: RpcResponse | object): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  private async handleMessage(clientId: string, raw: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    let request: RpcRequest;
    try {
      request = JSON.parse(raw);
    } catch {
      this.send(client.ws, {
        jsonrpc: '2.0', id: null,
        error: { code: -32700, message: 'Parse error' }
      });
      return;
    }

    // Auth check
    if (!client.authenticated && request.method !== 'auth.login') {
      this.send(client.ws, {
        jsonrpc: '2.0', id: request.id,
        error: { code: -32001, message: 'Not authenticated' }
      });
      return;
    }

    try {
      const result = await this.dispatch(clientId, request);
      this.send(client.ws, { jsonrpc: '2.0', id: request.id, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.send(client.ws, {
        jsonrpc: '2.0', id: request.id,
        error: { code: -32000, message }
      });
    }
  }

  private async dispatch(
    clientId: string,
    request: RpcRequest
  ): Promise<unknown> {
    const client = this.clients.get(clientId)!;
    const params = request.params ?? {};

    switch (request.method) {
      // ─── Auth ────────────────────────────────────────────────────────────
      case 'auth.login': {
        const token = String(params.token ?? '');
        if (token !== this.token) throw new Error('Invalid token');
        client.authenticated = true;
        return { ok: true };
      }

      // ─── Sessions ─────────────────────────────────────────────────────────
      case 'sessions.create': {
        const session = sessionManager.createSession(
          params.name as string | undefined,
          params.config as Record<string, unknown> | undefined
        );
        return session;
      }
      case 'sessions.get': {
        const id = String(params.id ?? '');
        const session = id === 'main'
          ? sessionManager.getOrCreateMain()
          : sessionManager.getSession(id);
        if (!session) throw new Error(`Session not found: ${id}`);
        return session;
      }
      case 'sessions.list': {
        return sessionManager.listSessions();
      }
      case 'sessions.clear': {
        sessionManager.clearMessages(String(params.id ?? ''));
        return { ok: true };
      }
      case 'sessions.config': {
        return sessionManager.updateConfig(
          String(params.id ?? ''),
          params.config as Record<string, unknown>
        );
      }
      case 'sessions.delete': {
        sessionManager.deleteSession(String(params.id ?? ''));
        return { ok: true };
      }

      // ─── Chat ─────────────────────────────────────────────────────────────
      case 'chat.send': {
        return this.handleChatSend(clientId, params);
      }

      // ─── Models ───────────────────────────────────────────────────────────
      case 'models.list': {
        return MODELS;
      }
      case 'models.available': {
        return getAvailableProviders();
      }

      // ─── Config / Keys ────────────────────────────────────────────────────
      case 'config.setKey': {
        await setApiKey(String(params.provider), String(params.key));
        return { ok: true };
      }
      case 'config.deleteKey': {
        await deleteApiKey(String(params.provider));
        return { ok: true };
      }
      case 'config.listKeys': {
        return listProviders();
      }
      case 'config.hasKey': {
        const key = await getApiKey(String(params.provider));
        return { hasKey: !!key };
      }
      case 'config.get': {
        return this.configStore.get(String(params.key)) ?? null;
      }
      case 'config.set': {
        this.configStore.set(String(params.key), params.value);
        return { ok: true };
      }

      // ─── Gateway Info ─────────────────────────────────────────────────────
      case 'gateway.info': {
        return {
          host: this.host,
          port: this.port,
          sessions: this.sessions.size,
          uptime: Date.now() - this.startTime
        };
      }

      // ─── Permissions ─────────────────────────────────────────────────────
      case 'permissions.respond': {
        permissionManager.respond({
          id: String(params.id),
          granted: Boolean(params.granted),
          remember: Boolean(params.remember ?? false)
        });
        return { ok: true };
      }
      case 'permissions.getConfig': {
        return permissionManager.getConfig();
      }
      case 'permissions.updateConfig': {
        permissionManager.updateConfig(params as Record<string, unknown>);
        return { ok: true };
      }

      // ─── Tools ────────────────────────────────────────────────────────────
      case 'tools.list': {
        return getToolDefinitions();
      }
      case 'tools.execute': {
        const result = await executeTool(
          String(params.name),
          (params.input ?? {}) as Record<string, unknown>
        );
        return result;
      }

      // ─── MCP ──────────────────────────────────────────────────────────────
      case 'mcp.servers.list': {
        return mcpManager.listServers();
      }
      case 'mcp.servers.add': {
        mcpManager.addServer(params as unknown as import('../mcp/client.js').McpServerConfig);
        return { ok: true };
      }
      case 'mcp.servers.remove': {
        mcpManager.removeServer(String(params.id));
        return { ok: true };
      }
      case 'mcp.servers.connect': {
        await mcpManager.connect(String(params.id));
        return { ok: true };
      }
      case 'mcp.servers.disconnect': {
        mcpManager.disconnect(String(params.id));
        return { ok: true };
      }
      case 'mcp.servers.connectAll': {
        return mcpManager.connectAll();
      }
      case 'mcp.presets': {
        return McpManager.PRESETS;
      }
      // Short aliases used by settings UI
      case 'mcp.list': {
        return mcpManager.listServers();
      }
      case 'mcp.add': {
        mcpManager.addServer(params as unknown as import('../mcp/client.js').McpServerConfig);
        await mcpManager.connect(String(params.id)).catch(() => {});
        return { ok: true };
      }
      case 'mcp.remove': {
        mcpManager.removeServer(String(params.id));
        return { ok: true };
      }
      case 'mcp.addPreset': {
        const preset = McpManager.PRESETS.find((p: { id: string }) => p.id === params.id);
        if (!preset) throw new Error(`Unknown preset: ${params.id}`);
        mcpManager.addServer(preset as unknown as import('../mcp/client.js').McpServerConfig);
        await mcpManager.connect(String(preset.id)).catch(() => {});
        return { ok: true };
      }

      // ─── Skills ───────────────────────────────────────────────────────────
      case 'skills.list': {
        return skillsRegistry.listAll();
      }
      case 'skills.find': {
        return skillsRegistry.find(String(params.trigger ?? ''));
      }
      case 'skills.categories': {
        return skillsRegistry.getCategories();
      }
      case 'skills.run': {
        const trigger = String(params.trigger ?? '');
        const userInput = params.input ? String(params.input) : undefined;
        const sessionId = String(params.sessionId ?? 'main');
        const skill = skillsRegistry.find(trigger);
        if (!skill) throw new Error(`Skill not found: ${trigger}`);

        // Update session system prompt with skill prompt
        const systemPrompt = skillsRegistry.buildSystemPrompt(skill, userInput);
        sessionManager.updateConfig(sessionId, { systemPrompt });

        // If input required and not provided, ask
        if (skill.inputRequired && !userInput) {
          return { needsInput: true, hint: skill.inputHint };
        }

        // Run as chat message
        return this.handleChatSend(clientId, {
          sessionId,
          message: userInput ?? `Run skill: ${skill.name}`
        });
      }

      default:
        throw new Error(`Method not found: ${request.method}`);
    }
  }

  private async handleChatSend(
    clientId: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const client = this.clients.get(clientId)!;
    const sessionId = String(params.sessionId ?? 'main');
    const userMessage = String(params.message ?? '');

    const session = sessionId === 'main'
      ? sessionManager.getOrCreateMain()
      : sessionManager.getSession(sessionId);

    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Add user message
    sessionManager.addMessage(session.id, {
      role: 'user',
      content: userMessage
    });

    const { provider, model, systemPrompt, thinking, thinkingBudget, maxTokens } = session.config;

    const adapter = await getAdapter(provider as ModelProvider, model);
    const tools = getToolDefinitions();

    // Agentic loop with tool calls
    const maxIterations = 20;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      // Emit streaming start event
      this.broadcastToClient(client.ws, {
        type: 'chat.stream.start',
        sessionId: session.id,
        iteration
      });

      const result = await adapter.generate({
        messages: session.messages,
        tools,
        systemPrompt,
        thinking,
        thinkingBudget,
        maxTokens,
        stream: true,
        onChunk: (chunk: StreamChunk) => {
          this.broadcastToClient(client.ws, {
            type: 'chat.stream.chunk',
            sessionId: session.id,
            chunk
          });
        }
      });

      sessionManager.updateTokenCounts(session.id, result.inputTokens, result.outputTokens);

      // Add assistant message
      sessionManager.addMessage(session.id, {
        role: 'assistant',
        content: result.content
      });

      // If no tool calls, we're done
      if (result.stopReason !== 'tool_use') {
        this.broadcastToClient(client.ws, {
          type: 'chat.stream.done',
          sessionId: session.id,
          result
        });
        return { ok: true, result };
      }

      // Execute tool calls
      const toolCalls = result.content.filter(b => b.type === 'tool_use');
      const toolResults: Message[] = [];

      for (const toolCall of toolCalls) {
        this.broadcastToClient(client.ws, {
          type: 'chat.tool.start',
          sessionId: session.id,
          tool: toolCall.name,
          toolId: toolCall.id
        });

        const toolResult = await executeTool(
          toolCall.name ?? '',
          (toolCall.input ?? {}) as Record<string, unknown>
        );

        this.broadcastToClient(client.ws, {
          type: 'chat.tool.done',
          sessionId: session.id,
          tool: toolCall.name,
          toolId: toolCall.id,
          result: toolResult
        });

        toolResults.push({
          role: 'tool',
          content: toolResult.success ? toolResult.output : `Error: ${toolResult.error}`,
          toolCallId: toolCall.id,
          toolName: toolCall.name
        });
      }

      // Add tool results to session
      for (const tr of toolResults) {
        sessionManager.addMessage(session.id, tr);
      }
    }

    throw new Error('Max iterations reached in agent loop');
  }

  private broadcastToClient(ws: WebSocket, data: object): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: null, result: data }));
    }
  }

  // Forward permission requests to all authenticated clients
  setupPermissionBridge(): void {
    permissionManager.on('permission:request', (request) => {
      for (const [, client] of this.clients) {
        if (client.authenticated) {
          this.broadcastToClient(client.ws, {
            type: 'permission.request',
            request
          });
        }
      }
    });
  }
}

// Singleton
let gatewayInstance: GatewayServer | null = null;

export function getGateway(): GatewayServer {
  if (!gatewayInstance) {
    gatewayInstance = new GatewayServer();
  }
  return gatewayInstance;
}
