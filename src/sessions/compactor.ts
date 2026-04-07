/**
 * Conversation Auto-Compactor
 * When context approaches model limit, summarizes older messages to free space.
 */
import type { Session } from './manager.js';
import type { ModelAdapter } from '../models/index.js';

export interface CompactionResult {
  compacted: boolean;
  messagesRemoved: number;
  summaryLength: number;
  tokensFreed?: number;
}

const COMPACTION_THRESHOLD = 0.80; // compact when 80% of context used
const KEEP_RECENT_MESSAGES = 6;    // always keep last N messages intact

export async function autoCompact(
  session: Session,
  adapter: ModelAdapter,
  contextWindow: number
): Promise<CompactionResult> {
  const totalTokens = (session.totalInputTokens || 0) + (session.totalOutputTokens || 0);
  const usageRatio = totalTokens / contextWindow;

  if (usageRatio < COMPACTION_THRESHOLD || session.messages.length <= KEEP_RECENT_MESSAGES + 2) {
    return { compacted: false, messagesRemoved: 0, summaryLength: 0 };
  }

  const cutoff = session.messages.length - KEEP_RECENT_MESSAGES;
  const toCompact = session.messages.slice(0, cutoff);
  const toKeep    = session.messages.slice(cutoff);

  // Filter to user/assistant messages only for summary (skip system)
  const dialogMessages = toCompact.filter(m => m.role === 'user' || m.role === 'assistant');

  const summaryPrompt = `Summarize the following conversation into a dense, technical paragraph. Preserve: file names, code snippets, decisions made, bugs found, commands run, and any important facts. Be concise but complete.\n\n${
    dialogMessages.map(m => `${m.role.toUpperCase()}: ${
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    }`).join('\n\n')
  }`;

  try {
    let summary = '';
    const genResult = await adapter.generate({
      messages: [{ role: 'user', content: summaryPrompt }],
      systemPrompt: 'You are a conversation summarizer. Output only the summary paragraph.',
      maxTokens: 1024,
      temperature: 0
    });
    summary = typeof genResult.content === 'string'
      ? genResult.content
      : genResult.content.filter(b => b.type === 'text').map(b => b.text || '').join('');

    const summaryMessage = {
      role: 'user' as const,
      content: `[COMPACTED CONVERSATION SUMMARY — ${dialogMessages.length} messages summarized]\n\n${summary.trim()}\n\n[END SUMMARY — conversation continues below]`
    };

    session.messages = [summaryMessage, ...toKeep];
    (session as unknown as Record<string, unknown>).compactionCount = ((session as unknown as Record<string, unknown>).compactionCount as number || 0) + 1;
    (session as unknown as Record<string, unknown>).lastCompactedAt = Date.now();

    return {
      compacted: true,
      messagesRemoved: toCompact.length,
      summaryLength: summary.length
    };
  } catch (err) {
    console.error('[Compactor] Failed to compact:', err);
    return { compacted: false, messagesRemoved: 0, summaryLength: 0 };
  }
}
