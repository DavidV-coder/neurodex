/**
 * NeuroDEX — Claude (Anthropic) Adapter
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  ModelAdapter, GenerateOptions, GenerateResult, ContentBlock, StreamChunk
} from './index.js';

export class ClaudeAdapter implements ModelAdapter {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const {
      messages, tools, maxTokens = 8096, temperature = 1,
      systemPrompt, thinking, thinkingBudget = 10000,
      stream, onChunk
    } = options;

    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : m.content
      }));

    const anthropicTools = tools?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool['input_schema']
    }));

    const thinkingConfig: Anthropic.ThinkingConfigEnabled | undefined = thinking
      ? { type: 'enabled', budget_tokens: thinkingBudget }
      : undefined;

    const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: 'claude-opus-4-6',
      max_tokens: maxTokens,
      messages: anthropicMessages as Anthropic.MessageParam[],
      ...(systemPrompt && { system: systemPrompt }),
      ...(anthropicTools?.length && { tools: anthropicTools }),
      ...(thinkingConfig && { thinking: thinkingConfig }),
      ...(temperature !== 1 && !thinking && { temperature })
    };

    if (stream && onChunk) {
      return this.generateStream(requestParams, onChunk);
    }

    const response = await this.client.messages.create(requestParams);

    const content: ContentBlock[] = response.content.map(block => {
      if (block.type === 'text') return { type: 'text', text: block.text };
      if (block.type === 'tool_use') return {
        type: 'tool_use', id: block.id, name: block.name,
        input: block.input as Record<string, unknown>
      };
      if (block.type === 'thinking') return { type: 'thinking', thinking: block.thinking };
      return { type: 'text', text: '' };
    });

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason as GenerateResult['stopReason'],
      model: response.model,
      provider: 'claude'
    };
  }

  private async generateStream(
    params: Anthropic.MessageCreateParamsNonStreaming,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerateResult> {
    const streamParams = { ...params, stream: true } as Anthropic.MessageCreateParamsStreaming;
    const stream = await this.client.messages.stream(streamParams);

    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: GenerateResult['stopReason'] = 'end_turn';
    let model = '';
    const content: ContentBlock[] = [];
    let currentText = '';
    let currentThinking = '';
    let currentToolId = '';
    let currentToolName = '';
    let currentToolInput = '';

    for await (const event of stream) {
      if (event.type === 'message_start') {
        inputTokens = event.message.usage.input_tokens;
        model = event.message.model;
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage.output_tokens;
        stopReason = event.delta.stop_reason as GenerateResult['stopReason'];
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'text') {
          currentText = '';
        } else if (event.content_block.type === 'thinking') {
          currentThinking = '';
        } else if (event.content_block.type === 'tool_use') {
          currentToolId = event.content_block.id;
          currentToolName = event.content_block.name;
          currentToolInput = '';
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          currentText += event.delta.text;
          onChunk({ type: 'text', text: event.delta.text });
        } else if (event.delta.type === 'thinking_delta') {
          currentThinking += event.delta.thinking;
          onChunk({ type: 'thinking', thinking: event.delta.thinking });
        } else if (event.delta.type === 'input_json_delta') {
          currentToolInput += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentText) {
          content.push({ type: 'text', text: currentText });
          currentText = '';
        }
        if (currentThinking) {
          content.push({ type: 'thinking', thinking: currentThinking });
          currentThinking = '';
        }
        if (currentToolName) {
          let parsedInput: Record<string, unknown> = {};
          try { parsedInput = JSON.parse(currentToolInput); } catch { /**/ }
          content.push({
            type: 'tool_use', id: currentToolId,
            name: currentToolName, input: parsedInput
          });
          onChunk({
            type: 'tool_call', toolId: currentToolId,
            toolName: currentToolName, toolInput: parsedInput
          });
          currentToolName = '';
          currentToolInput = '';
        }
      }
    }

    onChunk({ type: 'done' });

    return {
      content, inputTokens, outputTokens,
      stopReason, model, provider: 'claude'
    };
  }

  async listModels(): Promise<string[]> {
    return [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001'
    ];
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
