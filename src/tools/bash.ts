/**
 * NeuroDEX Bash Tool — Execute shell commands with permission checks
 */

import { exec } from 'child_process';
import { permissionManager } from '../security/permissions.js';
import { defaultSandbox } from '../security/sandbox.js';
import type { Tool, ToolResult } from './index.js';
import type { ToolDefinition } from '../models/index.js';

const DEFAULT_TIMEOUT = 120_000;
const MAX_OUTPUT = 100_000; // 100KB output cap

function execCommand(
  command: string,
  timeout: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = exec(command, {
      shell: process.env.SHELL ?? '/bin/zsh',
      timeout,
      maxBuffer: MAX_OUTPUT,
      env: process.env
    }, (error, stdout, stderr) => {
      const exitCode = error?.code ?? (error ? 1 : 0);
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode });
    });
  });
}

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
    const command = String(input.command ?? '').trim();
    const description = String(input.description ?? command.slice(0, 80));
    const timeout = Math.min(Number(input.timeout ?? DEFAULT_TIMEOUT), 600_000);

    if (!command) {
      return { success: false, output: '', error: 'Command cannot be empty' };
    }

    const sanitized = defaultSandbox.sanitizeCommand(command);

    const allowed = await permissionManager.check(
      'bash', 'Bash', description, { command: sanitized }
    );

    if (!allowed) {
      return { success: false, output: '', error: 'Permission denied by user' };
    }

    try {
      const { stdout, stderr, exitCode } = await execCommand(sanitized, timeout);

      const output = stdout.trimEnd();
      const errOut = stderr.trimEnd();

      if (exitCode !== 0) {
        const combined = [output, errOut ? `STDERR: ${errOut}` : ''].filter(Boolean).join('\n');
        return { success: false, output: combined || `(exit code ${exitCode})`, error: `Exit code: ${exitCode}` };
      }

      return { success: true, output: output || '(no output)' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: msg };
    }
  }
}
