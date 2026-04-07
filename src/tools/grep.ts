/**
 * NeuroDEX Grep Tool
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type { Tool, ToolResult } from './index.js';
import type { ToolDefinition } from '../models/index.js';

export class GrepTool implements Tool {
  definition: ToolDefinition = {
    name: 'Grep',
    description: 'Search file contents using regex. Returns matching lines with file paths and line numbers.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'File or directory to search' },
        glob: { type: 'string', description: 'Glob pattern to filter files e.g. "*.ts"' },
        case_insensitive: { type: 'boolean', description: 'Case-insensitive search' },
        context: { type: 'number', description: 'Lines of context around matches' },
        output_mode: {
          type: 'string',
          enum: ['content', 'files_with_matches', 'count'],
          description: 'Output format (default: files_with_matches)'
        }
      },
      required: ['pattern']
    }
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const pattern = String(input.pattern ?? '');
    const searchPath = input.path ? String(input.path) : process.cwd();
    const globPattern = input.glob ? String(input.glob) : '**/*';
    const caseInsensitive = Boolean(input.case_insensitive ?? false);
    const contextLines = Number(input.context ?? 0);
    const outputMode = String(input.output_mode ?? 'files_with_matches');

    try {
      const regex = new RegExp(pattern, caseInsensitive ? 'gi' : 'g');

      // Determine files to search
      let files: string[] = [];
      const stat = fs.existsSync(searchPath) ? fs.statSync(searchPath) : null;

      if (stat?.isFile()) {
        files = [path.resolve(searchPath)];
      } else {
        files = await glob(globPattern, {
          cwd: searchPath,
          absolute: true,
          nodir: true,
          ignore: ['node_modules/**', '.git/**', 'dist/**', '*.min.js', '*.map']
        });
      }

      const results: string[] = [];
      let totalMatches = 0;
      const matchedFiles: string[] = [];

      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          const lines = content.split('\n');
          const fileMatches: Array<{ line: number; content: string }> = [];

          lines.forEach((line, idx) => {
            regex.lastIndex = 0;
            if (regex.test(line)) {
              fileMatches.push({ line: idx + 1, content: line });
            }
          });

          if (fileMatches.length > 0) {
            totalMatches += fileMatches.length;
            matchedFiles.push(file);

            if (outputMode === 'content') {
              results.push(`\n${file}:`);
              for (const match of fileMatches) {
                if (contextLines > 0) {
                  const start = Math.max(0, match.line - 1 - contextLines);
                  const end = Math.min(lines.length, match.line + contextLines);
                  for (let i = start; i < end; i++) {
                    const prefix = i + 1 === match.line ? '>' : ' ';
                    results.push(`${prefix}${i + 1}:${lines[i]}`);
                  }
                  results.push('---');
                } else {
                  results.push(`${match.line}:${match.content}`);
                }
              }
            } else if (outputMode === 'count') {
              results.push(`${file}: ${fileMatches.length}`);
            }
          }
        } catch { /* skip binary files */ }
      }

      if (totalMatches === 0) {
        return { success: true, output: 'No matches found' };
      }

      if (outputMode === 'files_with_matches') {
        return { success: true, output: matchedFiles.join('\n') };
      }

      return {
        success: true,
        output: `${totalMatches} match(es) in ${matchedFiles.length} file(s):\n${results.join('\n')}`
      };
    } catch (err) {
      return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
    }
  }
}
