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
import { hooksManager } from '../hooks/manager.js';
import { profileManager } from '../profiles/manager.js';
import { agentPool } from '../agents/agentPool.js';
import { cronScheduler } from '../scheduler/cron.js';
import { telegramClient } from '../integrations/telegram/client.js';
import { resolveContextRefs, autocompleteRef } from '../context/resolver.js';
import { systemPoller } from '../telemetry/systemPoller.js';
import { getMoleSystemInfo, runMoleCommand, isMoleAvailable } from '../tools/mole.js';
import { detectClaudeCliInfo, isClaudeCliAvailable } from '../models/registry.js';
import { loadClaudeMd, findClaudeMdPath } from '../context/claudemd.js';
import { exportToMarkdown, exportToJSON, getExportFilename } from '../sessions/exporter.js';
import { calculateCost, formatCost, formatTokenCount, getPricing } from '../telemetry/costs.js';
import * as vectorStore from '../memory/vectorStore.js';
import { ProjectMemory } from '../memory/projectMemory.js';
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
        // Start system poller and broadcast metrics to all clients
        systemPoller.start();
        systemPoller.on('metrics', (m) => this.broadcastEvent({ type: 'system.metrics', data: m }));
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

      // ─── Hooks ────────────────────────────────────────────────────────────
      case 'hooks.list':   return hooksManager.list();
      case 'hooks.add':    return hooksManager.add(params as Parameters<typeof hooksManager.add>[0]);
      case 'hooks.remove': return { ok: hooksManager.remove(String(params.id)) };
      case 'hooks.update': return { ok: hooksManager.update(String(params.id), params as Parameters<typeof hooksManager.update>[1]) };
      case 'hooks.test': {
        const results = await hooksManager.run(params.event as Parameters<typeof hooksManager.run>[0], (params.context ?? {}) as Parameters<typeof hooksManager.run>[1]);
        return results;
      }

      // ─── Profiles ─────────────────────────────────────────────────────────
      case 'profiles.list':     return profileManager.list();
      case 'profiles.get':      return profileManager.get(String(params.id));
      case 'profiles.active':   return profileManager.getActive();
      case 'profiles.create':   return profileManager.create(params as Parameters<typeof profileManager.create>[0]);
      case 'profiles.update':   return { ok: profileManager.update(String(params.id), params as Parameters<typeof profileManager.update>[1]) };
      case 'profiles.delete':   return { ok: profileManager.delete(String(params.id)) };
      case 'profiles.activate': return profileManager.activate(String(params.id));

      // ─── Background Agents ────────────────────────────────────────────────
      case 'agents.spawn': {
        const agent = agentPool.spawn({
          task: String(params.task),
          provider: params.provider ? String(params.provider) : undefined,
          model: params.model ? String(params.model) : undefined,
          maxIterations: params.maxIterations ? Number(params.maxIterations) : undefined,
          label: params.label ? String(params.label) : undefined
        });
        // Forward agent events to all gateway clients
        agent.on('status',    (e) => this.broadcastEvent({ type: 'agent:status',    agentId: e.agentId, data: e.data }));
        agent.on('iteration', (e) => this.broadcastEvent({ type: 'agent:iteration', agentId: e.agentId, data: e.data }));
        agent.on('chunk',     (e) => this.broadcastEvent({ type: 'agent:chunk',     agentId: e.agentId, data: e.data }));
        agent.on('tool',      (e) => this.broadcastEvent({ type: 'agent:tool',      agentId: e.agentId, data: e.data }));
        agent.on('done',      (e) => this.broadcastEvent({ type: 'agent:done',      agentId: e.agentId, data: e.data }));
        return agent.toJSON();
      }
      case 'agents.list':      return agentPool.list();
      case 'agents.get':       return agentPool.get(String(params.id))?.toJSON() ?? null;
      case 'agents.abort':     return { ok: agentPool.abort(String(params.id)) };
      case 'agents.pause':     return { ok: agentPool.pause(String(params.id)) };
      case 'agents.resume':    return { ok: agentPool.resume(String(params.id)) };
      case 'agents.clearDone': agentPool.clearDone(); return { ok: true };

      // ─── Cron Scheduler ───────────────────────────────────────────────────
      case 'cron.list':   return cronScheduler.list();
      case 'cron.add':    return cronScheduler.add(params as Parameters<typeof cronScheduler.add>[0]);
      case 'cron.remove': return { ok: cronScheduler.remove(String(params.id)) };
      case 'cron.update': return { ok: cronScheduler.update(String(params.id), params as Parameters<typeof cronScheduler.update>[1]) };
      case 'cron.runNow': cronScheduler.runNow(String(params.id)); return { ok: true };

      // ─── Telegram ─────────────────────────────────────────────────────────
      case 'telegram.connect': {
        const result = await telegramClient.connect({
          apiId:          Number(params.apiId),
          apiHash:        String(params.apiHash),
          session:        String(params.session ?? ''),
          triggerPattern: params.triggerPattern ? String(params.triggerPattern) : undefined,
          autoReply:      Boolean(params.autoReply ?? false)
        });
        telegramClient.on('message', (msg) => this.broadcastEvent({ type: 'telegram:message', data: msg }));
        telegramClient.on('agent:done', (e) => this.broadcastEvent({ type: 'telegram:agent:done', data: e }));
        return result;
      }
      case 'telegram.disconnect': await telegramClient.disconnect(); return { ok: true };
      case 'telegram.status':     return telegramClient.status();
      case 'telegram.send':       await telegramClient.sendMessage(params.chatId as string | number, String(params.text)); return { ok: true };
      case 'telegram.history':    return telegramClient.getHistory(params.chatId as string | number, Number(params.limit ?? 20));

      // ─── Context ──────────────────────────────────────────────────────────
      case 'context.resolve': {
        const cwd = String(params.cwd ?? process.cwd());
        return resolveContextRefs(String(params.text), cwd);
      }
      case 'context.autocomplete': {
        const cwd = String(params.cwd ?? process.cwd());
        return autocompleteRef(String(params.prefix ?? ''), cwd);
      }
      case 'claudemd.get': {
        const cwd = String(params.cwd ?? process.cwd());
        const content = loadClaudeMd(cwd);
        const filePath = findClaudeMdPath(cwd);
        return { content, filePath };
      }

      // ─── Export ───────────────────────────────────────────────────────────
      case 'sessions.export': {
        const sid    = String(params.id ?? 'main');
        const format = String(params.format ?? 'markdown') as 'markdown' | 'json';
        const session = sessionManager.getSession(sid) ?? sessionManager.getOrCreateMain();
        const content  = format === 'json' ? exportToJSON(session) : exportToMarkdown(session);
        const filename = getExportFilename(session, format);
        return { content, filename };
      }

      // ─── Telemetry ────────────────────────────────────────────────────────
      case 'telemetry.session': {
        const sid = String(params.id ?? 'main');
        const s   = sessionManager.getSession(sid) ?? sessionManager.getOrCreateMain();
        const inp = s.totalInputTokens  ?? 0;
        const out = s.totalOutputTokens ?? 0;
        const cost = calculateCost(s.config.model, inp, out);
        return {
          inputTokens:  inp,
          outputTokens: out,
          totalTokens:  inp + out,
          cost,
          costFormatted: formatCost(cost),
          inputFormatted:  formatTokenCount(inp),
          outputFormatted: formatTokenCount(out),
          model: s.config.model,
          pricing: getPricing(s.config.model)
        };
      }

      // ─── Memory ───────────────────────────────────────────────────────────
      case 'memory.add': {
        const cwd = String(params.cwd ?? process.cwd());
        const pm  = new ProjectMemory(cwd);
        return pm.remember(String(params.content), (params.tags as string[]) ?? [], (params.metadata as Record<string, unknown>) ?? {});
      }
      case 'memory.recall': {
        const cwd = String(params.cwd ?? process.cwd());
        const pm  = new ProjectMemory(cwd);
        return pm.recall(String(params.query), Number(params.topK ?? 5));
      }
      case 'memory.list': {
        const cwd = String(params.cwd ?? process.cwd());
        return new ProjectMemory(cwd).list();
      }
      case 'memory.forget': {
        const ok = vectorStore.forget(String(params.id));
        return { ok };
      }
      case 'memory.stats': {
        const cwd = String(params.cwd ?? process.cwd());
        return new ProjectMemory(cwd).stats();
      }

      // ─── System / Mole ────────────────────────────────────────────────────
      case 'system.snapshot':    return systemPoller.getLatest();
      case 'system.setInterval': systemPoller.setInterval(Number(params.ms ?? 2000)); return { ok: true };

      case 'mole.info':    return getMoleSystemInfo();
      case 'mole.available': return { available: isMoleAvailable() };
      case 'mole.run': {
        const chunks: string[] = [];
        const result = await runMoleCommand({
          command: String(params.command) as Parameters<typeof runMoleCommand>[0]['command'],
          dryRun: Boolean(params.dryRun ?? true),
          onLine: (line) => {
            chunks.push(line);
            this.broadcastEvent({ type: 'mole.output', line });
          }
        });
        return { ...result, output: chunks.join('') };
      }

      // ─── Claude Code CLI ─────────────────────────────────────────────────
      case 'claudecode.detect': return detectClaudeCliInfo();
      case 'claudecode.available': return { available: isClaudeCliAvailable() };

      default:
        throw new Error(`Method not found: ${request.method}`);
    }
  }

  private broadcastEvent(event: Record<string, unknown>): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', id: null, result: event });
    for (const [, client] of this.clients) {
      if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(msg);
      }
    }
  }

  private sendToClient(clientId: string, event: Record<string, unknown>): void {
    const client = this.clients.get(clientId);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ jsonrpc: '2.0', id: null, result: event }));
    }
  }

  private async handleChatSend(
    clientId: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const client = this.clients.get(clientId)!;
    const sessionId = String(params.sessionId ?? 'main');
    const rawMessage = String(params.message ?? '');

    const session = sessionId === 'main'
      ? sessionManager.getOrCreateMain()
      : sessionManager.getSession(sessionId);

    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // ── Resolve @file/@url/@git context refs ──────────────────────────────
    const { expanded: userMessage, refs } = await resolveContextRefs(rawMessage, session.cwd ?? process.cwd());
    if (refs.length > 0) {
      this.sendToClient(clientId, { type: 'context.refs', refs: refs.map(r => ({ raw: r.raw, type: r.type, error: r.error })) });
    }

    // ── Auto-inject CLAUDE.md system prompt ───────────────────────────────
    let effectiveSystemPrompt = session.config.systemPrompt ?? '';
    const claudeMd = loadClaudeMd(session.cwd ?? process.cwd());
    if (claudeMd && !effectiveSystemPrompt.includes('<!-- CLAUDE.md -->')) {
      effectiveSystemPrompt = `<!-- CLAUDE.md -->\n${claudeMd}\n\n---\n\n${effectiveSystemPrompt}`;
    }

    // ── Auto-recall project memories ──────────────────────────────────────
    const pm = new ProjectMemory(session.cwd ?? process.cwd());
    const memories = pm.recall(rawMessage, 3);
    if (memories.length > 0) {
      const memContext = pm.formatForPrompt(memories);
      effectiveSystemPrompt = `${effectiveSystemPrompt}\n\n${memContext}`;
    }

    // ── Handle image attachments ──────────────────────────────────────────
    const images = params.images as string[] | undefined;

    // Add user message
    sessionManager.addMessage(session.id, {
      role: 'user',
      content: images?.length
        ? ([{ type: 'text', text: userMessage }, ...images.map(img => ({ type: 'image_url' as const, image_url: { url: img } }))] as unknown as import('../models/index.js').ContentBlock[])
        : userMessage
    });

    // ── Fire chat:send hook ───────────────────────────────────────────────
    await hooksManager.run('chat:send', { sessionId, command: rawMessage });

    const { provider, model, thinking, thinkingBudget, maxTokens } = session.config;

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
        systemPrompt: effectiveSystemPrompt,
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

      // Broadcast token usage after each turn
      const msgCost = calculateCost(model, result.inputTokens ?? 0, result.outputTokens ?? 0);
      this.broadcastToClient(client.ws, {
        type: 'chat.tokens',
        sessionId: session.id,
        inputTokens:   result.inputTokens  ?? 0,
        outputTokens:  result.outputTokens ?? 0,
        cost:          msgCost,
        costFormatted: formatCost(msgCost),
        totalInput:    session.totalInputTokens,
        totalOutput:   session.totalOutputTokens,
        totalCost:     formatCost(calculateCost(model, session.totalInputTokens, session.totalOutputTokens))
      });

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
