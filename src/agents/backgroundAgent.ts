/**
 * NeuroDEX Background Agent
 * Runs an AI agent task independently in its own session.
 */
import { EventEmitter } from 'events';
import { sessionManager } from '../sessions/manager.js';
import { getAdapter } from '../models/registry.js';
import { executeTool, getToolDefinitions } from '../tools/index.js';
import type { Message, ModelProvider } from '../models/index.js';

export type AgentStatus = 'queued' | 'running' | 'paused' | 'done' | 'error' | 'aborted';

export interface AgentOptions {
  task: string;
  provider?: string;
  model?: string;
  maxIterations?: number;
  sessionId?: string;
  label?: string;
}

export interface AgentEvent {
  agentId: string;
  type: string;
  data: unknown;
}

export class BackgroundAgent extends EventEmitter {
  readonly id: string;
  readonly task: string;
  readonly label: string;
  readonly sessionId: string;
  status: AgentStatus = 'queued';
  startedAt?: number;
  finishedAt?: number;
  iteration: number = 0;
  maxIterations: number;
  result?: string;
  error?: string;
  log: string[] = [];

  private _abortController = new AbortController();
  private _pausePromise?: Promise<void>;
  private _pauseResolve?: () => void;
  private provider: string;
  private model: string;

  constructor(options: AgentOptions) {
    super();
    this.id = Math.random().toString(36).slice(2);
    this.task = options.task;
    this.label = options.label || options.task.slice(0, 60);
    this.provider = options.provider || 'claude';
    this.model = options.model || 'claude-sonnet-4-6';
    this.maxIterations = options.maxIterations || 20;
    this.sessionId = options.sessionId || `bg-agent-${this.id}`;
  }

  async run(): Promise<void> {
    this.status = 'running';
    this.startedAt = Date.now();
    this.emit('status', { agentId: this.id, type: 'status', data: { status: 'running' } });

    try {
      const session = sessionManager.createSession('bg-' + this.id, {
        provider: this.provider as ModelProvider,
        model: this.model,
        systemPrompt: 'You are an autonomous AI agent. Complete the given task efficiently using available tools. Report progress clearly.'
      });

      session.messages.push({ role: 'user', content: this.task });
      this._log(`Task started: ${this.task}`);

      const adapter = await getAdapter(this.provider as ModelProvider, this.model);
      const tools = getToolDefinitions();

      for (let i = 0; i < this.maxIterations; i++) {
        if (this._abortController.signal.aborted) {
          this.status = 'aborted';
          break;
        }
        if (this._pausePromise) {
          this.status = 'paused';
          this.emit('status', { agentId: this.id, type: 'status', data: { status: 'paused' } });
          await this._pausePromise;
          this.status = 'running';
          this.emit('status', { agentId: this.id, type: 'status', data: { status: 'running' } });
        }

        this.iteration = i + 1;
        this._log(`Iteration ${this.iteration}`);
        this.emit('iteration', { agentId: this.id, type: 'iteration', data: { iteration: this.iteration } });

        let responseText = '';
        const toolCalls: Array<{ name: string; input: Record<string, unknown>; id: string }> = [];

        const result = await adapter.generate({
          messages: session.messages,
          systemPrompt: session.config.systemPrompt,
          tools,
          maxTokens: 8096,
          stream: true,
          onChunk: (chunk) => {
            if (this._abortController.signal.aborted) return;
            if (chunk.type === 'text') {
              responseText += chunk.text ?? '';
              this.emit('chunk', { agentId: this.id, type: 'chunk', data: { text: chunk.text } });
            } else if (chunk.type === 'tool_call') {
              toolCalls.push({ name: chunk.toolName!, input: (chunk.toolInput ?? {}), id: chunk.toolId || '' });
            }
          }
        });

        // Also collect tool calls from result content blocks
        for (const block of result.content) {
          if (block.type === 'tool_use' && !toolCalls.find(t => t.id === block.id)) {
            toolCalls.push({ name: block.name!, input: block.input ?? {}, id: block.id || '' });
          }
        }

        if (responseText) {
          session.messages.push({ role: 'assistant', content: result.content });
          this._log(`Response: ${responseText.slice(0, 200)}`);
        }

        if (toolCalls.length === 0 || result.stopReason !== 'tool_use') {
          this.result = responseText;
          this.status = 'done';
          break;
        }

        // Execute tools
        const toolResults: Message[] = [];
        for (const tc of toolCalls) {
          this._log(`Tool: ${tc.name}(${JSON.stringify(tc.input).slice(0, 100)})`);
          this.emit('tool', { agentId: this.id, type: 'tool', data: { name: tc.name, input: tc.input } });
          try {
            const result = await executeTool(tc.name, tc.input);
            toolResults.push({
              role: 'user',
              content: JSON.stringify({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify(result) })
            });
          } catch (err) {
            toolResults.push({
              role: 'user',
              content: JSON.stringify({ type: 'tool_result', tool_use_id: tc.id, content: `Error: ${(err as Error).message}`, is_error: true })
            });
          }
        }
        session.messages.push(...toolResults);
      }

      if (this.status === 'running') {
        this.status = 'done';
        this.result = 'Max iterations reached';
      }
    } catch (err) {
      this.status = 'error';
      this.error = (err as Error).message;
      this._log(`Error: ${this.error}`);
    }

    this.finishedAt = Date.now();
    this.emit('done', {
      agentId: this.id,
      type: 'done',
      data: { status: this.status, result: this.result, error: this.error }
    });
  }

  pause(): void {
    if (this.status !== 'running') return;
    this._pausePromise = new Promise(resolve => { this._pauseResolve = resolve; });
  }

  resume(): void {
    if (this._pauseResolve) { this._pauseResolve(); this._pausePromise = undefined; this._pauseResolve = undefined; }
  }

  abort(): void {
    this._abortController.abort();
    if (this._pauseResolve) this._pauseResolve();
    this.status = 'aborted';
    this.finishedAt = Date.now();
    this.emit('done', { agentId: this.id, type: 'done', data: { status: 'aborted' } });
  }

  toJSON() {
    return {
      id: this.id, task: this.task, label: this.label,
      status: this.status, iteration: this.iteration,
      maxIterations: this.maxIterations,
      startedAt: this.startedAt, finishedAt: this.finishedAt,
      result: this.result, error: this.error,
      log: this.log.slice(-50)
    };
  }

  private _log(msg: string): void {
    const entry = `[${new Date().toISOString().slice(11,19)}] ${msg}`;
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
  }
}
