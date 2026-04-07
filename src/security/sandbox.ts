/**
 * NeuroDEX Sandbox
 * Restricts file system access to allowed paths.
 * Prevents path traversal attacks and access to sensitive system files.
 */

import * as path from 'path';
import * as os from 'os';

// Paths that are NEVER accessible regardless of settings
const ALWAYS_BLOCKED_PATHS = [
  path.join(os.homedir(), '.config', 'NeuroDEX', 'vault.enc'),
  path.join(os.homedir(), '.config', 'NeuroDEX', 'secrets'),
  path.join(os.homedir(), '.ssh'),
  path.join(os.homedir(), '.gnupg'),
  '/etc/shadow',
  '/etc/passwd',
  '/etc/sudoers',
  '/private/etc/shadow',
  '/private/etc/master.passwd'
];

// Patterns that are always blocked
const BLOCKED_PATTERNS = [
  /\.env$/,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
  /id_ed25519/,
  /authorized_keys/,
  /known_hosts/,
  /\.p12$/,
  /\.pfx$/,
  /wallet\.dat$/
];

export interface SandboxConfig {
  allowedPaths: string[];
  workingDirectory: string;
  enforcePathRestriction: boolean;
}

export class Sandbox {
  private config: SandboxConfig;

  constructor(workingDir?: string) {
    this.config = {
      allowedPaths: [
        workingDir || process.cwd(),
        os.tmpdir(),
        path.join(os.homedir(), 'Documents'),
        path.join(os.homedir(), 'Desktop'),
        path.join(os.homedir(), 'Downloads')
      ],
      workingDirectory: workingDir || process.cwd(),
      enforcePathRestriction: true
    };
  }

  setWorkingDirectory(dir: string): void {
    this.config.workingDirectory = path.resolve(dir);
    if (!this.config.allowedPaths.includes(this.config.workingDirectory)) {
      this.config.allowedPaths.push(this.config.workingDirectory);
    }
  }

  addAllowedPath(p: string): void {
    const resolved = path.resolve(p);
    if (!this.config.allowedPaths.includes(resolved)) {
      this.config.allowedPaths.push(resolved);
    }
  }

  isPathAllowed(filePath: string): { allowed: boolean; reason?: string } {
    const resolved = path.resolve(filePath);

    // Check always-blocked paths
    for (const blocked of ALWAYS_BLOCKED_PATHS) {
      if (resolved === blocked || resolved.startsWith(blocked + path.sep)) {
        return { allowed: false, reason: `Access to ${blocked} is always restricted` };
      }
    }

    // Check blocked patterns
    const basename = path.basename(resolved);
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(basename) || pattern.test(resolved)) {
        return { allowed: false, reason: `File pattern ${pattern} is blocked for security` };
      }
    }

    // If path restriction is disabled, allow everything not explicitly blocked
    if (!this.config.enforcePathRestriction) {
      return { allowed: true };
    }

    // Check if within allowed paths
    const isAllowed = this.config.allowedPaths.some(
      allowed => resolved === allowed || resolved.startsWith(allowed + path.sep)
    );

    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Path ${resolved} is outside allowed directories`
      };
    }

    return { allowed: true };
  }

  validatePath(filePath: string): string {
    const { allowed, reason } = this.isPathAllowed(filePath);
    if (!allowed) throw new Error(`Security violation: ${reason}`);
    return path.resolve(filePath);
  }

  sanitizeCommand(command: string): string {
    // Remove null bytes
    return command.replace(/\0/g, '');
  }

  getConfig(): SandboxConfig {
    return { ...this.config };
  }
}

export const defaultSandbox = new Sandbox();
