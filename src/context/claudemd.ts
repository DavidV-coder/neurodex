/**
 * CLAUDE.md auto-loader
 * Walks up directory tree to find and load CLAUDE.md project instructions.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const cache = new Map<string, { content: string | null; mtime: number }>();

export function loadClaudeMd(cwd: string): string | null {
  let dir = path.resolve(cwd);
  const home = os.homedir();
  const root = path.parse(dir).root;

  while (true) {
    const candidate = path.join(dir, 'CLAUDE.md');
    if (fs.existsSync(candidate)) {
      try {
        const stat = fs.statSync(candidate);
        const cached = cache.get(candidate);
        if (cached && cached.mtime === stat.mtimeMs) return cached.content;
        const content = fs.readFileSync(candidate, 'utf8').trim();
        cache.set(candidate, { content, mtime: stat.mtimeMs });
        return content;
      } catch {
        return null;
      }
    }
    // Stop at home directory or filesystem root
    if (dir === home || dir === root) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function findClaudeMdPath(cwd: string): string | null {
  let dir = path.resolve(cwd);
  const home = os.homedir();
  const root = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, 'CLAUDE.md');
    if (fs.existsSync(candidate)) return candidate;
    if (dir === home || dir === root) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function invalidateCache(filePath: string): void {
  cache.delete(filePath);
}
