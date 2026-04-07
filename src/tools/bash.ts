/**
 * NeuroDEX Bash Tool — Execute shell commands with permission checks
 */

import { execaCommand } from 'execa';
import { permissionManager } from '../security/permissions.js';
import { defaultSandbox } from '../security/sandbox.js';
import type { Tool, ToolResult } from './index.js';
import type { ToolDefinition } from '../models/index.js';

const TIMEOUT_MS = 120_000; // 2 min default timeout

export class BashTool implements Tool {
  definition: ToolDefinition = {
    name: 'Bash',
    description: 'Execute a shell command. Use for running scripts, git commands, npm, compiling code, etc.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute'
        },
        description: {
          type: 'string',
          description: 'Short description of what this command does'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (max 600000). Default: 120000'
        }
      },
      required: ['command']
    }
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const command = String(input.command ?? '');
    const description = String(input.description ?? command.slice(0, 80));
    const timeout = Math.min(Number(input.timeout ?? TIMEOUT_MS), 600_000);

    if (!command.trim()) {
      return { success: false, output: '', error: 'Command cannot be empty' };
    }

    // Sanitize
    const sanitized = defaultSandbox.sanitizeCommand(command);

    // Permission check
    const allowed = await permissionManager.check(
      'bash', 'Bash', description, { command: sanitized }
    );

    if (!allowed) {
      return { success: false, output: '', error: 'Permission denied by user' };
    }

    try {
      const result = await execaCommand(sanitized, {
        shell: true,
        timeout,
        all: true,
        reject: false,
        cwd: process.cwd()
      });

      const output = result.all ?? result.stdout ?? '';
      const stderr = result.stderr ?? '';

      if (result.exitCode !== 0) {
        return {
          success: false,
          output: output + (stderr ? `\nSTDERR: ${stderr}` : ''),
          error: `Exit code: ${result.exitCode}`
        };
      }

      return { success: true, output: output || '(no output)' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: msg };
    }
  }
}
