/**
 * NeuroDEX Todo Tool — Task management for agents
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Tool, ToolResult } from './index.js';
import type { ToolDefinition } from '../models/index.js';

const TODO_FILE = path.join(os.homedir(), '.config', 'NeuroDEX', 'todos.json');

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: number;
  updatedAt: number;
}

function loadTodos(): TodoItem[] {
  try {
    return JSON.parse(fs.readFileSync(TODO_FILE, 'utf8'));
  } catch { return []; }
}

function saveTodos(todos: TodoItem[]): void {
  fs.mkdirSync(path.dirname(TODO_FILE), { recursive: true });
  fs.writeFileSync(TODO_FILE, JSON.stringify(todos, null, 2));
}

export class TodoTool implements Tool {
  definition: ToolDefinition = {
    name: 'TodoWrite',
    description: 'Manage a task list. Use to track progress on multi-step tasks.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'Full list of todos to set (replaces current list)',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] }
            },
            required: ['content', 'status']
          }
        }
      },
      required: ['todos']
    }
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const todosInput = input.todos as Array<{ content: string; status: string }>;
      const now = Date.now();

      const todos: TodoItem[] = todosInput.map((t, i) => ({
        id: `todo_${now}_${i}`,
        content: t.content,
        status: t.status as TodoItem['status'],
        createdAt: now,
        updatedAt: now
      }));

      saveTodos(todos);

      const summary = todos.map(t => {
        const icon = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '→' : '○';
        return `${icon} ${t.content}`;
      }).join('\n');

      return { success: true, output: `Updated ${todos.length} todos:\n${summary}` };
    } catch (err) {
      return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
    }
  }
}
