/**
 * Project Memory — high-level API over the vector store.
 * Provides per-project persistent AI memory.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as vs from './vectorStore.js';

export class ProjectMemory {
  private projectHash: string;
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = path.resolve(cwd);
    this.projectHash = vs.projectHashFromCwd(this.cwd);
  }

  async remember(content: string, tags: string[] = [], metadata: Record<string, unknown> = {}): Promise<vs.MemoryEntry> {
    const entry = vs.add(this.projectHash, content, tags, { ...metadata, cwd: this.cwd });
    // Also write human-readable file for git-trackability
    const memFile = path.join(this.cwd, '.neurodex-memory.md');
    try {
      const existing = fs.existsSync(memFile) ? fs.readFileSync(memFile, 'utf8') : '# NeuroDEX Project Memory\n\n';
      const timestamp = new Date(entry.createdAt).toISOString().slice(0, 16);
      const tagStr = tags.length ? ` [${tags.join(', ')}]` : '';
      fs.writeFileSync(memFile, existing + `## ${timestamp}${tagStr}\n${content}\n\n`);
    } catch { /**/ }
    return entry;
  }

  recall(query: string, topK = 5): vs.MemorySearchResult[] {
    return vs.search(this.projectHash, query, topK);
  }

  forget(id: string): boolean {
    return vs.forget(id);
  }

  list(): vs.MemoryEntry[] {
    return vs.listAll(this.projectHash);
  }

  stats(): { count: number; oldestAt?: number } {
    return vs.stats(this.projectHash);
  }

  formatForPrompt(results: vs.MemorySearchResult[]): string {
    if (!results.length) return '';
    const items = results.map(r => `- ${r.content.slice(0, 300)}${r.content.length > 300 ? '...' : ''}`).join('\n');
    return `[Project Memory — relevant facts]\n${items}`;
  }
}
