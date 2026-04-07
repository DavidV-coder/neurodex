/**
 * NeuroDEX — DeepSeek Adapter (OpenAI-compatible API)
 */

import OpenAI from 'openai';
import type {
  ModelAdapter, GenerateOptions, GenerateResult, ContentBlock, StreamChunk
} from './index.js';

export class DeepSeekAdapter implements ModelAdapter {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = 'deepseek-chat') {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com/v1'
    });
    this.model = model;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { messages, tools, maxTokens = 8192, systemPrompt, stream, onChunk } = options;

    const msgs: OpenAI.ChatCompletionMessageParam[] = [];
    if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });

    for (const m of messages) {
      if (m.role === 'system') continue;
      msgs.push({
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      });
    }

    const openaiTools = tools?.map(t => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }));

    if (stream && onChunk) {
      const s = await this.client.chat.completions.create({
        model: this.model, messages: msgs,
        max_tokens: maxTokens, stream: true,
        ...(openaiTools?.length && { tools: openaiTools })
      });
      let text = '';
      for await (const chunk of s) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) { text += delta; onChunk({ type: 'text', text: delta }); }
      }
      onChunk({ type: 'done' });
      return {
        content: [{ type: 'text', text }],
        inputTokens: 0, outputTokens: 0,
        stopReason: 'end_turn', model: this.model, provider: 'deepseek'
      };
    }

    const resp = await this.client.chat.completions.create({
      model: this.model, messages: msgs,
      max_tokens: maxTokens,
      ...(openaiTools?.length && { tools: openaiTools })
    });

    const choice = resp.choices[0];
    const content: ContentBlock[] = [];
    if (choice.message.content) content.push({ type: 'text', text: choice.message.content });

    // Handle thinking (deepseek-reasoner)
    const rawMsg = choice.message as unknown as { reasoning_content?: string };
    if (rawMsg.reasoning_content) {
      content.unshift({ type: 'thinking', thinking: rawMsg.reasoning_content });
    }

    return {
      content,
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
      stopReason: 'end_turn', model: this.model, provider: 'deepseek'
    };
  }

  async listModels(): Promise<string[]> {
    return ['deepseek-chat', 'deepseek-reasoner'];
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch { return false; }
  }
}
