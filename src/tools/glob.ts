/**
 * NeuroDEX Glob Tool
 */

import { glob } from 'glob';
import * as path from 'path';
import type { Tool, ToolResult } from './index.js';
import type { ToolDefinition } from '../models/index.js';

export class GlobTool implements Tool {
  definition: ToolDefinition = {
    name: 'Glob',
    description: 'Find files matching a glob pattern. Returns matching file paths sorted by modification time.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern e.g. "**/*.ts" or "src/**/*.{js,ts}"' },
        path: { type: 'string', description: 'Base directory to search in (defaults to cwd)' }
      },
      required: ['pattern']
    }
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const pattern = String(input.pattern ?? '');
    const basePath = input.path ? String(input.path) : process.cwd();

    try {
      const matches = await glob(pattern, {
        cwd: basePath,
        absolute: true,
        nodir: false,
        ignore: ['node_modules/**', '.git/**', 'dist/**', '.next/**', 'build/**']
      });

      if (matches.length === 0) {
        return { success: true, output: 'No files found matching pattern' };
      }

      // Sort by modification time
      const withStats = matches.map(f => {
        try {
          const { mtimeMs } = require('fs').statSync(f);
          return { path: f, mtime: mtimeMs };
        } catch {
          return { path: f, mtime: 0 };
        }
      }).sort((a, b) => b.mtime - a.mtime);

      const output = withStats.map(f => f.path).join('\n');
      return { success: true, output: `${withStats.length} files found:\n${output}` };
    } catch (err) {
      return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
    }
  }
}
