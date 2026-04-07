/**
 * NeuroDEX Session Manager
 * Manages conversation sessions with full history and context.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import type { Message } from '../models/index.js';

const SESSIONS_DIR = path.join(os.homedir(), '.config', 'NeuroDEX', 'sessions');

export interface SessionConfig {
  provider: string;
  model: string;
  systemPrompt: string;
  thinking: boolean;
  thinkingBudget: number;
  temperature: number;
  maxTokens: number;
}

export interface Session {
  id: string;
  name: string;
  config: SessionConfig;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  cwd: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}

const DEFAULT_SYSTEM_PROMPT = `You are NeuroDEX, a powerful AI terminal assistant.
You have access to tools for reading/writing files, executing commands, and searching code.
You are running inside a sci-fi themed terminal interface.
Be concise, precise, and helpful. When working with code, always read files before modifying them.
Current date: ${new Date().toISOString().split('T')[0]}`;

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  provider: 'claude',
  model: 'claude-sonnet-4-6',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  thinking: false,
  thinkingBudget: 10000,
  temperature: 1,
  maxTokens: 8096
};

function ensureSessionsDir(): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true, mode: 0o700 });
}

function sessionPath(id: string): string {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

export class SessionManager {
  private activeSessions: Map<string, Session> = new Map();

  createSession(name?: string, config?: Partial<SessionConfig>): Session {
    ensureSessionsDir();
    const session: Session = {
      id: uuidv4(),
      name: name ?? `session_${Date.now()}`,
      config: { ...DEFAULT_SESSION_CONFIG, ...config },
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cwd: process.cwd(),
      totalInputTokens: 0,
      totalOutputTokens: 0
    };
    this.activeSessions.set(session.id, session);
    this.save(session);
    return session;
  }

  getSession(id: string): Session | undefined {
    if (this.activeSessions.has(id)) return this.activeSessions.get(id);

    // Load from disk
    try {
      const raw = fs.readFileSync(sessionPath(id), 'utf8');
      const session: Session = JSON.parse(raw);
      this.activeSessions.set(id, session);
      return session;
    } catch { return undefined; }
  }

  getOrCreateMain(): Session {
    const mainPath = path.join(SESSIONS_DIR, 'main.json');
    try {
      const raw = fs.readFileSync(mainPath, 'utf8');
      const session: Session = JSON.parse(raw);
      this.activeSessions.set(session.id, session);
      return session;
    } catch {
      const session = this.createSession('main');
      fs.writeFileSync(mainPath, JSON.stringify(session, null, 2));
      return session;
    }
  }

  addMessage(sessionId: string, message: Message): Session {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.messages.push(message);
    session.updatedAt = Date.now();
    this.save(session);
    return session;
  }

  updateTokenCounts(sessionId: string, inputTokens: number, outputTokens: number): void {
    const session = this.getSession(sessionId);
    if (!session) return;
    session.totalInputTokens += inputTokens;
    session.totalOutputTokens += outputTokens;
    session.updatedAt = Date.now();
    this.save(session);
  }

  updateConfig(sessionId: string, config: Partial<SessionConfig>): Session {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.config = { ...session.config, ...config };
    session.updatedAt = Date.now();
    this.save(session);
    return session;
  }

  clearMessages(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (!session) return;
    session.messages = [];
    session.updatedAt = Date.now();
    this.save(session);
  }

  listSessions(): Array<{ id: string; name: string; updatedAt: number }> {
    ensureSessionsDir();
    try {
      return fs.readdirSync(SESSIONS_DIR)
        .filter(f => f.endsWith('.json') && f !== 'main.json')
        .map(f => {
          try {
            const raw = fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8');
            const s: Session = JSON.parse(raw);
            return { id: s.id, name: s.name, updatedAt: s.updatedAt };
          } catch { return null; }
        })
        .filter(Boolean) as Array<{ id: string; name: string; updatedAt: number }>;
    } catch { return []; }
  }

  deleteSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
    try { fs.unlinkSync(sessionPath(sessionId)); } catch { /**/ }
  }

  private save(session: Session): void {
    ensureSessionsDir();
    fs.writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), { mode: 0o600 });
  }
}

export const sessionManager = new SessionManager();
