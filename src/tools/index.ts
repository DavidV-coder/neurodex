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

export const ALL_TOOLS: Tool[] = [
  new BashTool(),
  new ReadTool(),
  new WriteTool(),
  new EditTool(),
  new GlobTool(),
  new GrepTool(),
  new TodoTool(),
  new WebFetchTool()
];

export function getToolDefinitions(): ToolDefinition[] {
  return ALL_TOOLS.map(t => t.definition);
}

export function getTool(name: string): Tool | undefined {
  return ALL_TOOLS.find(t => t.definition.name === name);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) {
    return { success: false, output: '', error: `Unknown tool: ${name}` };
  }
  try {
    return await tool.execute(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error: message };
  }
}
