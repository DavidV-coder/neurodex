/**
 * NeuroDEX Permission System
 * Controls what tools/operations the AI agent is allowed to perform.
 * Supports: auto-approve, require-confirm, deny modes per tool category.
 */

import { EventEmitter } from 'events';

export type PermissionMode = 'allow' | 'ask' | 'deny';

export interface PermissionConfig {
  bash: PermissionMode;
  fileRead: PermissionMode;
  fileWrite: PermissionMode;
  fileDelete: PermissionMode;
  networkFetch: PermissionMode;
  browserControl: PermissionMode;
  mcpTools: PermissionMode;
  systemInfo: PermissionMode;
}

export interface PermissionRequest {
  id: string;
  tool: string;
  category: keyof PermissionConfig;
  description: string;
  args: Record<string, unknown>;
  timestamp: number;
}

export interface PermissionResponse {
  id: string;
  granted: boolean;
  remember?: boolean; // remember for this session
}

const DEFAULT_PERMISSIONS: PermissionConfig = {
  bash: 'ask',
  fileRead: 'allow',
  fileWrite: 'allow',   // allow — agent will ask via chat before writing
  fileDelete: 'ask',
  networkFetch: 'allow',
  browserControl: 'ask',
  mcpTools: 'allow',
  systemInfo: 'allow'
};

// Dangerous bash patterns that always require explicit confirmation
const DANGEROUS_PATTERNS = [
  /rm\s+-rf?\s+[\/~]/,
  /sudo\s+rm/,
  /dd\s+if=/,
  /mkfs\./,
  /format\s+[a-z]:/i,
  />\s*\/dev\/(sda|nvme|disk)/,
  /shutdown|reboot|halt/,
  /chmod\s+777/,
  /curl.*\|\s*(sh|bash|zsh)/,
  /wget.*\|\s*(sh|bash|zsh)/,
  /eval\s*\(/,
  /base64\s+-d.*\|\s*(sh|bash)/
];

export class PermissionManager extends EventEmitter {
  private config: PermissionConfig;
  private sessionOverrides: Map<string, PermissionMode> = new Map();
  private pendingRequests: Map<string, {
    resolve: (r: PermissionResponse) => void;
    reject: (e: Error) => void;
  }> = new Map();

  constructor(config: Partial<PermissionConfig> = {}) {
    super();
    this.config = { ...DEFAULT_PERMISSIONS, ...config };
  }

  updateConfig(config: Partial<PermissionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): PermissionConfig {
    return { ...this.config };
  }

  isDangerous(command: string): boolean {
    return DANGEROUS_PATTERNS.some(p => p.test(command));
  }

  async check(
    category: keyof PermissionConfig,
    tool: string,
    description: string,
    args: Record<string, unknown>
  ): Promise<boolean> {
    // Check session override first
    const override = this.sessionOverrides.get(tool);
    const mode = override ?? this.config[category];

    // Always deny in deny mode
    if (mode === 'deny') return false;

    // Check for dangerous patterns in bash
    if (category === 'bash' && typeof args.command === 'string') {
      if (this.isDangerous(args.command)) {
        // Force ask even if mode is 'allow'
        return this.requestUserPermission(category, tool, description, args);
      }
    }

    // Auto-allow
    if (mode === 'allow') return true;

    // Ask user
    return this.requestUserPermission(category, tool, description, args);
  }

  private async requestUserPermission(
    category: keyof PermissionConfig,
    tool: string,
    description: string,
    args: Record<string, unknown>
  ): Promise<boolean> {
    const id = Math.random().toString(36).slice(2);
    const request: PermissionRequest = {
      id,
      tool,
      category,
      description,
      args,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve(false); // auto-deny on timeout, don't throw
      }, 30000); // 30 second timeout — auto-deny if no response

      this.pendingRequests.set(id, {
        resolve: (response: PermissionResponse) => {
          clearTimeout(timeout);
          if (response.remember) {
            this.sessionOverrides.set(tool, response.granted ? 'allow' : 'deny');
          }
          resolve(response.granted);
        },
        reject: (e: Error) => {
          clearTimeout(timeout);
          reject(e);
        }
      });

      // Emit event for UI to show permission dialog
      this.emit('permission:request', request);
    });
  }

  respond(response: PermissionResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      this.pendingRequests.delete(response.id);
      pending.resolve(response);
    }
  }

  clearSessionOverrides(): void {
    this.sessionOverrides.clear();
  }
}

export const permissionManager = new PermissionManager();
