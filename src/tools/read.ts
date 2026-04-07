/**
 * NeuroDEX Read Tool
 */

import * as fs from 'fs';
import { defaultSandbox } from '../security/sandbox.js';
import type { Tool, ToolResult } from './index.js';
import type { ToolDefinition } from '../models/index.js';

const MAX_LINES = 2000;

export class ReadTool implements Tool {
  definition: ToolDefinition = {
    name: 'Read',
    description: 'Read a file from the filesystem. Returns file contents with line numbers.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file' },
        offset: { type: 'number', description: 'Line to start reading from (0-indexed)' },
        limit: { type: 'number', description: 'Maximum number of lines to read' }
      },
      required: ['file_path']
    }
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const filePath = String(input.file_path ?? '');
    const offset = Number(input.offset ?? 0);
    const limit = Math.min(Number(input.limit ?? MAX_LINES), MAX_LINES);

    try {
      const validPath = defaultSandbox.validatePath(filePath);

      if (!fs.existsSync(validPath)) {
        return { success: false, output: '', error: `File not found: ${filePath}` };
      }

      const stat = fs.statSync(validPath);
      if (stat.isDirectory()) {
        return { success: false, output: '', error: `${filePath} is a directory, not a file` };
      }

      const content = fs.readFileSync(validPath, 'utf8');
      const lines = content.split('\n');
      const sliced = lines.slice(offset, offset + limit);
      const numbered = sliced.map((line, i) => `${offset + i + 1}\t${line}`).join('\n');

      const info = lines.length > offset + limit
        ? `\n... (${lines.length - offset - limit} more lines, use offset/limit to read more)`
        : '';

      return { success: true, output: numbered + info };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: msg };
    }
  }
}
