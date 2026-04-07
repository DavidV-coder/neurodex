/**
 * NeuroDEX Tool System
 * All tools available to AI agents.
 */

import { permissionManager } from '../security/permissions.js';
import { defaultSandbox } from '../security/sandbox.js';
import type { ToolDefinition } from '../models/index.js';

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface Tool {
  definition: ToolDefinition;
  execute(input: Record<string, unknown>): Promise<ToolResult>;
}

// Import all tools
import { BashTool } from './bash.js';
import { ReadTool } from './read.js';
import { WriteTool } from './write.js';
import { EditTool } from './edit.js';
import { GlobTool } from './glob.js';
import { GrepTool } from './grep.js';
import { TodoTool } from './todo.js';
import { WebFetchTool } from './webfetch.js';
import { mcpManager } from '../mcp/client.js';
import { hooksManager } from '../hooks/manager.js';
import { executeBrowserAction, getBrowserToolDefinition } from './browser.js';
import { runMoleCommand, getMoleToolDefinition, isMoleAvailable } from './mole.js';

// Browser tool wrapper
const browserTool: Tool = {
  definition: getBrowserToolDefinition() as unknown as ToolDefinition,
  execute: async (input) => {
    const result = await executeBrowserAction(input as unknown as Parameters<typeof executeBrowserAction>[0]);
    if (!result.success) return { success: false, output: '', error: result.error };
    return { success: true, output: result.output || (result.screenshot ? '[screenshot captured]' : '') };
  }
};

// Mole system tool wrapper
const moleTool: Tool = {
  definition: getMoleToolDefinition() as unknown as ToolDefinition,
  execute: async (input) => {
    if (input.command === 'info') {
      const { getMoleSystemInfo } = await import('./mole.js');
      const info = await getMoleSystemInfo();
      return { success: true, output: JSON.stringify(info, null, 2) };
    }
    const result = await runMoleCommand({
      command: input.command as Parameters<typeof runMoleCommand>[0]['command'],
      dryRun: input.dryRun as boolean | undefined
    });
    return { success: result.success, output: result.output, error: result.success ? undefined : result.output };
  }
};

export const ALL_TOOLS: Tool[] = [
  new BashTool(),
  new ReadTool(),
  new WriteTool(),
  new EditTool(),
  new GlobTool(),
  new GrepTool(),
  new TodoTool(),
  new WebFetchTool(),
  browserTool,
  ...(isMoleAvailable() ? [moleTool] : [])
];

export function getToolDefinitions(): ToolDefinition[] {
  const builtins = ALL_TOOLS.map(t => t.definition);
  const mcpTools = mcpManager.getToolDefinitions();
  return [...builtins, ...mcpTools];
}

export function getTool(name: string): Tool | undefined {
  return ALL_TOOLS.find(t => t.definition.name === name);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  // Run pre-tool hooks
  const preResults = await hooksManager.run('pre:tool', { toolName: name, command: (input.command as string) || '' });
  if (hooksManager.isBlocked(preResults)) {
    return { success: false, output: '', error: `Blocked by pre-hook: ${preResults.find(r => r.blocked)?.stderr || 'denied'}` };
  }

  // MCP tool?
  if (name.startsWith('mcp__')) {
    try {
      const output = await mcpManager.executeTool(name, input);
      await hooksManager.run('post:tool', { toolName: name, result: output });
      return { success: true, output };
    } catch (err) {
      return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
    }
  }

  const tool = getTool(name);
  if (!tool) {
    return { success: false, output: '', error: `Unknown tool: ${name}` };
  }
  try {
    const result = await tool.execute(input);
    await hooksManager.run('post:tool', { toolName: name, result: result.output });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error: message };
  }
}
