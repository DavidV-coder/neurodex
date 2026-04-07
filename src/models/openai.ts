/**
 * NeuroDEX — OpenAI Adapter
 */

import OpenAI from 'openai';
import type {
  ModelAdapter, GenerateOptions, GenerateResult, ContentBlock, StreamChunk
} from './index.js';

export class OpenAIAdapter implements ModelAdapter {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = 'gpt-4o') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const {
      messages, tools, maxTokens = 8096, temperature = 0.7,
      systemPrompt, stream, onChunk
    } = options;

    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      openaiMessages.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'system') continue;
      if (msg.role === 'tool') {
        openaiMessages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId!,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        });
      } else if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const toolCalls = (msg.content as ContentBlock[])
          .filter(b => b.type === 'tool_use')
          .map(b => ({
            id: b.id!,
            type: 'function' as const,
            function: { name: b.name!, arguments: JSON.stringify(b.input) }
          }));
        const textContent = (msg.content as ContentBlock[])
          .filter(b => b.type === 'text').map(b => b.text).join('');
        openaiMessages.push({
          role: 'assistant',
          content: textContent || null,
          ...(toolCalls.length && { tool_calls: toolCalls })
        });
      } else {
        openaiMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        });
      }
    }

    const openaiTools = tools?.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    if (stream && onChunk) {
      return this.generateStream(openaiMessages, openaiTools, maxTokens, temperature, onChunk);
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      max_tokens: maxTokens,
      temperature,
      ...(openaiTools?.length && { tools: openaiTools })
    });

    const choice = response.choices[0];
    const content: ContentBlock[] = [];

    if (choice.message.content) {
      content.push({ type: 'text', text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.function.arguments); } catch { /**/ }
        content.push({
          type: 'tool_use', id: tc.id,
          name: tc.function.name, input
        });
      }
    }

    const stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use'
      : choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn';

    return {
      content,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      stopReason,
      model: this.model,
      provider: 'openai'
    };
  }

  private async generateStream(
    messages: OpenAI.ChatCompletionMessageParam[],
    tools: OpenAI.ChatCompletionTool[] | undefined,
    maxTokens: number,
    temperature: number,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerateResult> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      ...(tools?.length && { tools })
    });

    let inputTokens = 0;
    let outputTokens = 0;
    const content: ContentBlock[] = [];
    let currentText = '';
    const toolCallMap: Map<number, { id: string; name: string; args: string }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        currentText += delta.content;
        onChunk({ type: 'text', text: delta.content });
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCallMap.has(tc.index)) {
            toolCallMap.set(tc.index, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' });
          }
          const entry = toolCallMap.get(tc.index)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }

      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
      }
    }

    if (currentText) content.push({ type: 'text', text: currentText });

    for (const [, tc] of toolCallMap) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.args); } catch { /**/ }
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
      onChunk({ type: 'tool_call', toolId: tc.id, toolName: tc.name, toolInput: input });
    }

    onChunk({ type: 'done' });

    const stopReason = toolCallMap.size > 0 ? 'tool_use' : 'end_turn';
    return { content, inputTokens, outputTokens, stopReason, model: this.model, provider: 'openai' };
  }

  async listModels(): Promise<string[]> {
    const models = await this.client.models.list();
    return models.data.map(m => m.id).filter(id =>
      id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3')
    );
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
