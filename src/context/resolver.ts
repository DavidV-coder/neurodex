/**
 * NeuroDEX Context Resolver
 * Expands @file, @url, @git: references in user messages before sending to model.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { glob } from 'glob';

export interface ContextRef {
  raw: string;       // the original @token
  type: 'file' | 'url' | 'git';
  resolved: string;  // the expanded content
  error?: string;
}

export interface ResolvedMessage {
  expanded: string;
  refs: ContextRef[];
}

// Match @path/to/file, @./relative, @https://..., @git:diff etc.
const REF_PATTERN = /@(https?:\/\/[^\s]+|git:[a-z]+(?::[^\s]+)?|[./\w][\w./\-]*\.\w+)/g;

export async function resolveContextRefs(
  text: string,
  cwd: string = process.cwd()
): Promise<ResolvedMessage> {
  const refs: ContextRef[] = [];
  const matches = [...text.matchAll(REF_PATTERN)];

  if (matches.length === 0) return { expanded: text, refs };

  let expanded = text;

  for (const match of matches) {
    const raw = match[0];
    const token = match[1];
    let resolved = '';
    let error: string | undefined;
    let type: 'file' | 'url' | 'git' = 'file';

    if (token.startsWith('http://') || token.startsWith('https://')) {
      type = 'url';
      try {
        const res = await fetch(token, { signal: AbortSignal.timeout(8000) });
        let body = await res.text();
        // Strip HTML tags
        body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                   .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                   .replace(/<[^>]+>/g, '')
                   .replace(/\s{3,}/g, '\n\n')
                   .trim();
        resolved = body.slice(0, 12000);
        if (body.length > 12000) resolved += '\n\n[content truncated...]';
      } catch (e) {
        error = `Failed to fetch ${token}: ${(e as Error).message}`;
      }
    } else if (token.startsWith('git:')) {
      type = 'git';
      const subCmd = token.slice(4); // e.g. 'diff', 'log', 'status', 'branch', 'log:--oneline'
      const [gitCmd, ...gitArgs] = subCmd.split(':');
      const allowedCmds = ['diff', 'log', 'status', 'branch', 'stash', 'show'];
      if (!allowedCmds.includes(gitCmd)) {
        error = `git:${gitCmd} not allowed. Use: ${allowedCmds.join(', ')}`;
      } else {
        const args = gitArgs.length ? gitArgs : [];
        const defaultArgs: Record<string, string[]> = {
          log: ['--oneline', '-20'],
          diff: [],
          status: ['--short'],
          branch: ['-a'],
          stash: ['list'],
          show: ['--stat']
        };
        const finalArgs = args.length ? args : (defaultArgs[gitCmd] || []);
        try {
          const out = cp.execSync(`git ${gitCmd} ${finalArgs.join(' ')}`, {
            cwd, timeout: 5000, maxBuffer: 1024 * 1024
          }).toString().trim();
          resolved = out.slice(0, 8000);
          if (out.length > 8000) resolved += '\n[output truncated...]';
        } catch (e) {
          error = `git ${gitCmd} failed: ${(e as Error).message}`;
        }
      }
    } else {
      // File reference
      type = 'file';
      const filePath = path.isAbsolute(token) ? token : path.join(cwd, token);
      try {
        if (!fs.existsSync(filePath)) throw new Error('File not found');
        const stat = fs.statSync(filePath);
        if (stat.size > 1024 * 1024) throw new Error('File too large (>1MB)');
        const content = fs.readFileSync(filePath, 'utf8');
        const ext = path.extname(filePath).slice(1);
        const langMap: Record<string, string> = {
          ts: 'typescript', js: 'javascript', py: 'python', rs: 'rust',
          go: 'go', rb: 'ruby', java: 'java', cpp: 'cpp', c: 'c',
          sh: 'bash', json: 'json', yaml: 'yaml', yml: 'yaml',
          md: 'markdown', html: 'html', css: 'css', sql: 'sql'
        };
        const lang = langMap[ext] || ext || '';
        resolved = `\`\`\`${lang}\n// File: ${filePath}\n${content.trim()}\n\`\`\``;
      } catch (e) {
        error = `Cannot read ${token}: ${(e as Error).message}`;
      }
    }

    refs.push({ raw, type, resolved, error });
    const replacement = error
      ? `[Error: ${error}]`
      : `\n\n<!-- @${type}: ${raw.slice(1)} -->\n${resolved}\n\n`;
    expanded = expanded.replace(raw, replacement);
  }

  return { expanded, refs };
}

export async function autocompleteRef(prefix: string, cwd: string): Promise<string[]> {
  if (!prefix) return [];
  try {
    const pattern = `**/${prefix}*`;
    const files = await glob(pattern, { cwd, maxDepth: 4, ignore: ['node_modules/**', '.git/**', 'dist/**'], absolute: false });
    return files.slice(0, 20);
  } catch {
    return [];
  }
}
