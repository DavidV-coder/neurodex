/**
 * NeuroDEX Write Tool
 */

import * as fs from 'fs';
import * as path from 'path';
import { permissionManager } from '../security/permissions.js';
import { defaultSandbox } from '../security/sandbox.js';
import type { Tool, ToolResult } from './index.js';
import type { ToolDefinition } from '../models/index.js';

export class WriteTool implements Tool {
  definition: ToolDefinition = {
    name: 'Write',
    description: 'Write content to a file. Creates the file and parent directories if needed.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to write to' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['file_path', 'content']
    }
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const filePath = String(input.file_path ?? '');
    const content = String(input.content ?? '');

    try {
      const validPath = defaultSandbox.validatePath(filePath);
      const exists = fs.existsSync(validPath);
      const category = exists ? 'fileWrite' : 'fileWrite';

      const allowed = await permissionManager.check(
        category, 'Write',
        `${exists ? 'Overwrite' : 'Create'} ${filePath}`,
        { file_path: filePath, bytes: content.length }
      );

      if (!allowed) return { success: false, output: '', error: 'Permission denied by user' };

      fs.mkdirSync(path.dirname(validPath), { recursive: true });
      fs.writeFileSync(validPath, content, 'utf8');

      return { success: true, output: `File written: ${filePath} (${content.length} bytes)` };
    } catch (err) {
      return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
    }
  }
}
