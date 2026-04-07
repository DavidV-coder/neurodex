/**
 * Simple vector store using JSON file storage.
 * No native modules — works in any Node.js context.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

const DB_PATH = path.join(os.homedir(), '.config', 'NeuroDEX', 'memory.json');

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

// In-memory cache of the JSON store
let store: MemoryEntry[] | null = null;

function load(): MemoryEntry[] {
  if (store) return store;
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    if (fs.existsSync(DB_PATH)) {
      store = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as MemoryEntry[];
    } else {
      store = [];
    }
  } catch {
    store = [];
  }
  return store;
}

function save(): void {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[Memory] Failed to save:', (err as Error).message);
  }
}

export function add(projectHash: string, content: string, tags: string[] = [], metadata: Record<string, unknown> = {}): MemoryEntry {
  const entries = load();
  const id = crypto.randomUUID();
  const now = Date.now();
  const entry: MemoryEntry = { id, projectHash, content, tags, metadata, createdAt: now, updatedAt: now };
  entries.push(entry);
  save();
  return entry;
}

export function search(projectHash: string, query: string, topK = 5): MemorySearchResult[] {
  const entries = load().filter(e => e.projectHash === projectHash);
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  const scored = entries.map(entry => {
    const content = entry.content.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      const count = (content.match(new RegExp(term, 'g')) || []).length;
      score += count * (1 / (content.length / term.length + 1));
    }
    return { ...entry, score };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

export function listAll(projectHash: string): MemoryEntry[] {
  return load()
    .filter(e => e.projectHash === projectHash)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function forget(id: string): boolean {
  const entries = load();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  save();
  return true;
}

export function stats(projectHash: string): { count: number; oldestAt?: number } {
  const entries = load().filter(e => e.projectHash === projectHash);
  const oldest = entries.reduce((min, e) => Math.min(min, e.createdAt), Infinity);
  return { count: entries.length, oldestAt: entries.length > 0 ? oldest : undefined };
}

export function projectHashFromCwd(cwd: string): string {
  return crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 16);
}
