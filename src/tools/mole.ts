/**
 * NeuroDEX Mole Integration
 * Integrates tw93/mole for Mac system health monitoring and maintenance.
 * Binary: /opt/homebrew/bin/mole (aliased as 'mo' or 'mole')
 */
import * as cp from 'child_process';
import * as fs from 'fs';
import { EventEmitter } from 'events';

const MOLE_CANDIDATES = [
  '/opt/homebrew/bin/mole',
  '/usr/local/bin/mole',
  'mole'
];

const STATUS_GO = '/opt/homebrew/Cellar/mole/1.25.0/libexec/bin/status-go';

export function findMoleBinary(): string | null {
  for (const b of MOLE_CANDIDATES) {
    try {
      if (b === 'mole') {
        cp.execSync('which mole', { stdio: 'ignore' });
        return 'mole';
      }
      fs.accessSync(b, fs.constants.X_OK);
      return b;
    } catch { continue; }
  }
  return null;
}

export function isMoleAvailable(): boolean {
  return findMoleBinary() !== null;
}

export interface MoleSystemInfo {
  available: boolean;
  version?: string;
  binary?: string;
  // Parsed from mole's built-in check
  diskFree?: string;
  sipStatus?: string;
  shell?: string;
}

export async function getMoleSystemInfo(): Promise<MoleSystemInfo> {
  const binary = findMoleBinary();
  if (!binary) return { available: false };

  return new Promise(resolve => {
    // Run mole's internal check (non-interactive parts)
    const env = { ...process.env, LC_ALL: 'C', LANG: 'C', TERM: 'dumb' };

    // Get disk info directly since status-go needs TTY
    cp.exec('df -h / 2>/dev/null | awk \'NR==2 {print $4}\'', { env }, (err, diskFree) => {
      cp.exec('csrutil status 2>/dev/null | grep -o "enabled\\|disabled" || echo "Unknown"', { env }, (err2, sip) => {
        cp.exec(`"${binary}" --version 2>/dev/null || echo ""`, { env, timeout: 3000 }, (err3, ver) => {
          resolve({
            available: true,
            binary,
            version: ver?.trim() || '1.25.0',
            diskFree: diskFree?.trim() || 'Unknown',
            sipStatus: sip?.trim() || 'Unknown',
            shell: process.env.SHELL || 'Unknown'
          });
        });
      });
    });
  });
}

export type MoleCommand = 'clean' | 'analyze' | 'optimize' | 'purge' | 'check';

export interface MoleRunOptions {
  command: MoleCommand;
  dryRun?: boolean;
  onLine?: (line: string) => void;
}

export interface MoleResult {
  success: boolean;
  output: string;
  exitCode: number;
}

export async function runMoleCommand(options: MoleRunOptions): Promise<MoleResult> {
  const binary = findMoleBinary();
  if (!binary) throw new Error('Mole not installed. Run: brew install tw93/tap/mole');

  const args: string[] = [options.command];
  if (options.dryRun && ['clean', 'optimize'].includes(options.command)) {
    args.push('--dry-run');
  }

  return new Promise((resolve) => {
    const env = { ...process.env, LC_ALL: 'C', LANG: 'C', TERM: 'dumb' };
    let output = '';

    const proc = cp.spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], env });

    const handleData = (data: Buffer) => {
      // Strip ANSI escape codes
      const line = data.toString().replace(/\x1B\[[0-9;]*[mGKHF]/g, '').replace(/\r/g, '');
      output += line;
      options.onLine?.(line);
    };

    proc.stdout?.on('data', handleData);
    proc.stderr?.on('data', handleData);

    proc.on('error', err => {
      resolve({ success: false, output: err.message, exitCode: -1 });
    });
    proc.on('close', code => {
      resolve({ success: (code ?? 0) === 0, output: output.trim(), exitCode: code ?? 0 });
    });
  });
}

// Tool definition for AI use
export function getMoleToolDefinition(): Record<string, unknown> {
  return {
    name: 'MoleSystem',
    description: 'Mac system maintenance via mole (tw93/mole). Clean caches, analyze disk usage, optimize system, purge project artifacts. Safe dry-run mode available.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['clean', 'analyze', 'optimize', 'purge', 'check', 'info'],
          description: 'Mole command: clean (free disk), analyze (disk usage), optimize (system), purge (old artifacts), check (system health), info (system info)'
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview without making changes (for clean and optimize)'
        }
      },
      required: ['command']
    }
  };
}
