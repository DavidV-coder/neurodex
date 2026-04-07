/**
 * NeuroDEX Edit Tool — Exact string replacement in files
 */

import * as fs from 'fs';
import { permissionManager } from '../security/permissions.js';
import { defaultSandbox } from '../security/sandbox.js';
import type { Tool, ToolResult } from './index.js';
import type { ToolDefinition } from '../models/index.js';

export class EditTool implements Tool {
  definition: ToolDefinition = {
    name: 'Edit',
    description: 'Make exact string replacements in a file. old_string must be unique in the file.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file' },
        old_string: { type: 'string', description: 'Exact text to replace (must be unique)' },
        new_string: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false)' }
      },
      required: ['file_path', 'old_string', 'new_string']
    }
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const filePath = String(input.file_path ?? '');
    const oldString = String(input.old_string ?? '');
    const newString = String(input.new_string ?? '');
    const replaceAll = Boolean(input.replace_all ?? false);

    try {
      const validPath = defaultSandbox.validatePath(filePath);

      if (!fs.existsSync(validPath)) {
        return { success: false, output: '', error: `File not found: ${filePath}` };
      }

      const allowed = await permissionManager.check(
        'fileWrite', 'Edit', `Edit ${filePath}`,
        { file_path: filePath, old_string: oldString.slice(0, 100) }
      );
      if (!allowed) return { success: false, output: '', error: 'Permission denied by user' };

      const content = fs.readFileSync(validPath, 'utf8');

      if (!content.includes(oldString)) {
        return { success: false, output: '', error: `old_string not found in ${filePath}` };
      }

      const count = (content.match(new RegExp(oldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;

      if (!replaceAll && count > 1) {
        return {
          success: false, output: '',
          error: `old_string appears ${count} times in file. Use replace_all: true or provide more context to make it unique.`
        };
      }

      const newContent = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString);

      fs.writeFileSync(validPath, newContent, 'utf8');

      return { success: true, output: `Replaced ${replaceAll ? count : 1} occurrence(s) in ${filePath}` };
    } catch (err) {
      return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
    }
  }
}
