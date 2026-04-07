/**
 * NeuroDEX WebFetch Tool
 */

import { permissionManager } from '../security/permissions.js';
import type { Tool, ToolResult } from './index.js';
import type { ToolDefinition } from '../models/index.js';

export class WebFetchTool implements Tool {
  definition: ToolDefinition = {
    name: 'WebFetch',
    description: 'Fetch content from a URL. Returns the page text/markdown.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        prompt: { type: 'string', description: 'What to extract from the page' }
      },
      required: ['url']
    }
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const url = String(input.url ?? '');

    // Basic URL validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { success: false, output: '', error: `Invalid URL: ${url}` };
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { success: false, output: '', error: 'Only HTTP/HTTPS URLs are supported' };
    }

    const allowed = await permissionManager.check(
      'networkFetch', 'WebFetch', `Fetch ${url}`, { url }
    );
    if (!allowed) return { success: false, output: '', error: 'Permission denied by user' };

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'NeuroDEX/1.0 (AI Terminal)'
        },
        signal: AbortSignal.timeout(30_000)
      });

      if (!response.ok) {
        return { success: false, output: '', error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text')) {
        return { success: false, output: '', error: `Non-text content type: ${contentType}` };
      }

      const text = await response.text();

      // Simple HTML to text conversion
      const stripped = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const truncated = stripped.length > 50000
        ? stripped.slice(0, 50000) + '\n... (truncated)'
        : stripped;

      return { success: true, output: truncated };
    } catch (err) {
      return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
    }
  }
}
