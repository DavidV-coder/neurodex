/**
 * Session export to Markdown and JSON.
 */
import type { Session } from './manager.js';
import { formatCost, formatTokenCount, calculateCost } from '../telemetry/costs.js';

export function exportToMarkdown(session: Session): string {
  const lines: string[] = [];
  const totalInput  = session.totalInputTokens  || 0;
  const totalOutput = session.totalOutputTokens || 0;
  const totalCost   = calculateCost(session.config.model, totalInput, totalOutput);

  lines.push(`# NeuroDEX Session Export`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Session ID | \`${session.id}\` |`);
  lines.push(`| Model | ${session.config.provider}/${session.config.model} |`);
  lines.push(`| Created | ${new Date(session.createdAt).toISOString()} |`);
  lines.push(`| Input Tokens | ${formatTokenCount(totalInput)} |`);
  lines.push(`| Output Tokens | ${formatTokenCount(totalOutput)} |`);
  lines.push(`| Estimated Cost | ${formatCost(totalCost)} |`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of session.messages) {
    if (msg.role === 'system') continue;
    const heading = msg.role === 'user' ? '## User' : '## Assistant';
    lines.push(heading);
    lines.push('');
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content, null, 2);
    lines.push(content);
    lines.push('');
  }

  return lines.join('\n');
}

export function exportToJSON(session: Session): string {
  return JSON.stringify({ ...session, exportedAt: new Date().toISOString() }, null, 2);
}

export function getExportFilename(session: Session, format: 'markdown' | 'json'): string {
  const date = new Date(session.createdAt).toISOString().slice(0, 10);
  const ext  = format === 'markdown' ? 'md' : 'json';
  return `neurodex-session-${session.id.slice(0, 8)}-${date}.${ext}`;
}
