/**
 * NeuroDEX Hooks System
 * Runs user-defined shell commands before/after tool executions and chat events.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as os from 'os';

export type HookEvent =
  | 'pre:tool' | 'post:tool'
  | 'pre:bash' | 'post:bash'
  | 'session:start' | 'session:end'
  | 'chat:send' | 'chat:response';

export interface HookConfig {
  id: string;
  event: HookEvent;
  command: string;      // shell command to run
  timeout: number;      // ms, default 5000
  enabled: boolean;
  description?: string;
}

export interface HookResult {
  id: string;
  event: HookEvent;
  exitCode: number;
  stdout: string;
  stderr: string;
  blocked: boolean;     // true if pre-hook exited non-zero (blocks tool execution)
  durationMs: number;
}

export interface HookContext {
  toolName?: string;
  command?: string;
  sessionId?: string;
  result?: unknown;
  [key: string]: unknown;
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'NeuroDEX');
const HOOKS_FILE = path.join(CONFIG_DIR, 'hooks.json');

export class HooksManager {
  private hooks: HookConfig[] = [];

  constructor() {
    this.load();
  }

  load(): void {
    try {
      if (fs.existsSync(HOOKS_FILE)) {
        this.hooks = JSON.parse(fs.readFileSync(HOOKS_FILE, 'utf8'));
      }
    } catch {
      this.hooks = [];
    }
  }

  save(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(HOOKS_FILE, JSON.stringify(this.hooks, null, 2), { mode: 0o600 });
  }

  list(): HookConfig[] { return [...this.hooks]; }

  add(hook: Omit<HookConfig, 'id'>): HookConfig {
    const h: HookConfig = {
      ...hook,
      id: Math.random().toString(36).slice(2),
      enabled: hook.enabled ?? true,
      timeout: hook.timeout ?? 5000,
    };
    this.hooks.push(h);
    this.save();
    return h;
  }

  remove(id: string): boolean {
    const before = this.hooks.length;
    this.hooks = this.hooks.filter(h => h.id !== id);
    if (this.hooks.length !== before) { this.save(); return true; }
    return false;
  }

  update(id: string, patch: Partial<HookConfig>): boolean {
    const idx = this.hooks.findIndex(h => h.id === id);
    if (idx === -1) return false;
    this.hooks[idx] = { ...this.hooks[idx], ...patch };
    this.save();
    return true;
  }

  async run(event: HookEvent, context: HookContext = {}): Promise<HookResult[]> {
    const matching = this.hooks.filter(h => h.enabled && h.event === event);
    const results: HookResult[] = [];

    for (const hook of matching) {
      const start = Date.now();
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        NEURODEX_EVENT:    event,
        NEURODEX_TOOL:     context.toolName || '',
        NEURODEX_COMMAND:  context.command  || '',
        NEURODEX_SESSION:  context.sessionId || '',
      };

      try {
        const { stdout, stderr, exitCode } = await runCommand(hook.command, env, hook.timeout);
        const result: HookResult = {
          id: hook.id,
          event,
          exitCode,
          stdout: stdout.slice(0, 2000),
          stderr: stderr.slice(0, 1000),
          blocked: event.startsWith('pre:') && exitCode !== 0,
          durationMs: Date.now() - start
        };
        results.push(result);
        if (result.blocked) break; // pre-hook blocked — stop
      } catch (err) {
        results.push({
          id: hook.id,
          event,
          exitCode: -1,
          stdout: '',
          stderr: (err as Error).message,
          blocked: false,
          durationMs: Date.now() - start
        });
      }
    }

    return results;
  }

  isBlocked(results: HookResult[]): boolean {
    return results.some(r => r.blocked);
  }
}

function runCommand(
  command: string,
  env: Record<string, string>,
  timeout: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = cp.spawn('sh', ['-c', command], {
      env,
      timeout,
      stdio: 'pipe'
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
    proc.on('error', (err) => resolve({ stdout, stderr: err.message, exitCode: -1 }));
  });
}

export const hooksManager = new HooksManager();
