/**
 * NeuroDEX Claude Code Adapter
 * Uses the `claude` CLI (Claude Code subscription) instead of API tokens.
 * No API key required — uses Claude.ai subscription billing.
 */
import * as cp from 'child_process';
import * as readline from 'readline';
import * as os from 'os';
import * as path from 'path';
import type { ModelAdapter, GenerateOptions, GenerateResult, StreamChunk } from './index.js';

// Possible paths for the claude binary
const CLAUDE_BINARY_CANDIDATES = [
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
  path.join(os.homedir(), '.local', 'bin', 'claude'),
  'claude' // fallback to PATH
];

export function findClaudeBinary(): string | null {
  const { execSync } = require('child_process');
  for (const candidate of CLAUDE_BINARY_CANDIDATES) {
    try {
      if (candidate === 'claude') {
        execSync('which claude', { stdio: 'ignore' });
        return 'claude';
      }
      require('fs').accessSync(candidate, require('fs').constants.X_OK);
      return candidate;
    } catch { continue; }
  }
  return null;
}

export function isClaudeCliAvailable(): boolean {
  return findClaudeBinary() !== null;
}

export async function detectClaudeCliInfo(): Promise<{ available: boolean; version?: string; binary?: string }> {
  const binary = findClaudeBinary();
  if (!binary) return { available: false };
  return new Promise(resolve => {
    cp.exec(`"${binary}" --version`, { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve({ available: true, binary });
      resolve({ available: true, version: stdout.trim(), binary });
    });
  });
}

export interface CliRateLimitInfo {
  status: string;
  resetsAt?: number;
  rateLimitType?: string;
  overageStatus?: string;
  isUsingOverage?: boolean;
  updatedAt: number;
}

export class ClaudeCodeAdapter implements ModelAdapter {
  private binary: string;
  static _lastRateLimit: CliRateLimitInfo | null = null;

  constructor() {
    this.binary = findClaudeBinary() || 'claude';
  }

  static getCliStatus(): CliRateLimitInfo | null {
    return ClaudeCodeAdapter._lastRateLimit;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { messages, systemPrompt, maxTokens, stream, onChunk } = options;

    // Build the prompt from messages
    const prompt = this._buildPrompt(messages);

    const args: string[] = [
      '--print',
      '--output-format', stream ? 'stream-json' : 'json',
      '--verbose',
      '--dangerously-skip-permissions',
    ];

    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }
    if (maxTokens) {
      args.push('--max-budget-usd', String(maxTokens / 1000)); // rough budget estimate
    }

    // Append the prompt as last argument
    args.push(prompt);

    return new Promise((resolve, reject) => {
      const proc = cp.spawn(this.binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000,
        env: { ...process.env }
      });

      let fullText = '';
      let costUsd = 0;
      const contentBlocks: import('./index.js').ContentBlock[] = [];

      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('error', err => reject(new Error(`Claude CLI error: ${err.message}`)));

      // Always use readline — wait for rl.close before resolving (proc.close fires too early)
      const rl = readline.createInterface({ input: proc.stdout! });

      rl.on('line', line => {
        if (!line.trim()) return;
        try {
          const obj = JSON.parse(line);

          // stream-json --verbose: assistant message with full text
          if (obj.type === 'assistant' && obj.message?.content) {
            for (const block of obj.message.content) {
              if (block.type === 'text' && block.text) {
                const newText = block.text.slice(fullText.length);
                if (newText) {
                  fullText = block.text;
                  if (stream && onChunk) onChunk({ type: 'text', text: newText });
                }
              }
            }
          }
          // Classic content_block_delta (older CLI versions)
          if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta') {
            const text = obj.delta.text || '';
            fullText += text;
            if (stream && onChunk) onChunk({ type: 'text', text });
          }
          // Result — extract cost and fallback text
          if (obj.type === 'result' && obj.subtype === 'success') {
            costUsd = obj.total_cost_usd || obj.cost_usd || 0;
            if (obj.result && !fullText) fullText = obj.result;
          }
          // Rate limit info — store for dashboard
          if (obj.type === 'rate_limit_event' && obj.rate_limit_info) {
            const info = obj.rate_limit_info;
            ClaudeCodeAdapter._lastRateLimit = {
              status: info.status,
              resetsAt: info.resetsAt,
              rateLimitType: info.rateLimitType,
              overageStatus: info.overageStatus,
              isUsingOverage: info.isUsingOverage,
              updatedAt: Date.now()
            };
          }
        } catch { /* skip non-JSON */ }
      });

      // rl.close fires AFTER all lines are processed — safe to resolve here
      rl.on('close', () => {
        if (contentBlocks.length === 0 && fullText) {
          contentBlocks.push({ type: 'text', text: fullText });
        }
        onChunk?.({ type: 'done' });
        resolve({
          content: contentBlocks.length ? contentBlocks : [{ type: 'text', text: fullText }],
          stopReason: 'end_turn',
          inputTokens: 0,
          outputTokens: 0,
          model: 'claude-code',
          provider: 'claude-code'
        });
      });

      proc.on('close', code => {
        if (code !== 0 && !fullText && stderr) {
          // rl.close may not fire on error — reject here as fallback
          reject(new Error(`Claude CLI exited ${code}: ${stderr.slice(0, 500)}`));
        }
      });
    });
  }

  async listModels(): Promise<string[]> {
    return ['claude-code-opus', 'claude-code-sonnet', 'claude-code-haiku'];
  }

  async isAvailable(): Promise<boolean> {
    return isClaudeCliAvailable();
  }

  private _buildPrompt(messages: import('./index.js').Message[]): string {
    // For multi-turn, serialize as a conversation
    if (messages.length === 1) {
      const m = messages[0];
      return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    }
    return messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `${m.role === 'user' ? 'Human' : 'Assistant'}: ${content}`;
      })
      .join('\n\n') + '\n\nAssistant:';
  }
}
