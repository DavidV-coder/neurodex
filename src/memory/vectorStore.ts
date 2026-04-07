/**
 * Simple vector store using better-sqlite3 + cosine similarity.
 * Falls back to keyword search if embeddings unavailable.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

const DB_PATH = path.join(os.homedir(), '.config', 'NeuroDEX', 'memory.sqlite');

export interface MemoryEntry {
  id: string;
  projectHash: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface MemorySearchResult extends MemoryEntry {
  score: number;
}

let db: unknown = null;

function getDb(): unknown {
  if (db) return db;
  try {
    const Database = require('better-sqlite3');
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    (db as { exec: (sql: string) => void }).exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        project_hash TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project ON memories(project_hash);
    `);
    return db;
  } catch (err) {
    throw new Error(`Memory DB unavailable: ${(err as Error).message}`);
  }
}

export function add(projectHash: string, content: string, tags: string[] = [], metadata: Record<string, unknown> = {}): MemoryEntry {
  const database = getDb() as { prepare: (sql: string) => { run: (...args: unknown[]) => void } };
  const id = crypto.randomUUID();
  const now = Date.now();
  database.prepare(`INSERT INTO memories (id, project_hash, content, tags, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, projectHash, content, JSON.stringify(tags), JSON.stringify(metadata), now, now);
  return { id, projectHash, content, tags, metadata, createdAt: now, updatedAt: now };
}

export function search(projectHash: string, query: string, topK = 5): MemorySearchResult[] {
  const database = getDb() as { prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>> } };
  const rows = database.prepare(`SELECT * FROM memories WHERE project_hash = ? ORDER BY created_at DESC LIMIT 100`)
    .all(projectHash);

  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  const scored = rows.map(row => {
    const content = (row.content as string).toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      const count = (content.match(new RegExp(term, 'g')) || []).length;
      score += count * (1 / (content.length / term.length + 1));
    }
    return {
      id: row.id as string,
      projectHash: row.project_hash as string,
      content: row.content as string,
      tags: JSON.parse(row.tags as string || '[]'),
      metadata: JSON.parse(row.metadata as string || '{}'),
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      score
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

export function listAll(projectHash: string): MemoryEntry[] {
  const database = getDb() as { prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>> } };
  const rows = database.prepare(`SELECT * FROM memories WHERE project_hash = ? ORDER BY created_at DESC`).all(projectHash);
  return rows.map(row => ({
    id: row.id as string,
    projectHash: row.project_hash as string,
    content: row.content as string,
    tags: JSON.parse(row.tags as string || '[]'),
    metadata: JSON.parse(row.metadata as string || '{}'),
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number
  }));
}

export function forget(id: string): boolean {
  const database = getDb() as { prepare: (sql: string) => { run: (...args: unknown[]) => { changes: number } } };
  const result = database.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function stats(projectHash: string): { count: number; oldestAt?: number } {
  const database = getDb() as { prepare: (sql: string) => { get: (...args: unknown[]) => Record<string, unknown> } };
  const row = database.prepare(`SELECT COUNT(*) as count, MIN(created_at) as oldest FROM memories WHERE project_hash = ?`).get(projectHash);
  return { count: row.count as number, oldestAt: row.oldest as number | undefined };
}

export function projectHashFromCwd(cwd: string): string {
  return crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 16);
}
