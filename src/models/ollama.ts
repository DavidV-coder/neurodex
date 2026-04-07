/**
 * NeuroDEX — Ollama Local Model Adapter
 */

import type {
  ModelAdapter, GenerateOptions, GenerateResult, ContentBlock, StreamChunk
} from './index.js';

interface OllamaChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OllamaChatResponse {
  model: string;
  message: OllamaChatMessage;
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaAdapter implements ModelAdapter {
  private baseUrl: string;
  private model: string;

  constructor(model = 'llama3.3', baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { messages, systemPrompt, maxTokens = 4096, stream, onChunk } = options;

    const ollamaMsgs: OllamaChatMessage[] = [];
    if (systemPrompt) ollamaMsgs.push({ role: 'system', content: systemPrompt });

    for (const m of messages) {
      if (m.role === 'system' || m.role === 'tool') continue;
      ollamaMsgs.push({
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      });
    }

    const body = JSON.stringify({
      model: this.model,
      messages: ollamaMsgs,
      stream: stream ?? false,
      options: { num_predict: maxTokens }
    });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    if (stream && onChunk && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const parsed: OllamaChatResponse = JSON.parse(line);
            if (parsed.message?.content) {
              fullText += parsed.message.content;
              onChunk({ type: 'text', text: parsed.message.content });
            }
            if (parsed.done) {
              inputTokens = parsed.prompt_eval_count ?? 0;
              outputTokens = parsed.eval_count ?? 0;
            }
          } catch { /**/ }
        }
      }

      onChunk({ type: 'done' });
      return {
        content: [{ type: 'text', text: fullText }],
        inputTokens, outputTokens,
        stopReason: 'end_turn', model: this.model, provider: 'ollama'
      };
    }

    const data: OllamaChatResponse = await response.json();
    return {
      content: [{ type: 'text', text: data.message.content }],
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
      stopReason: 'end_turn', model: this.model, provider: 'ollama'
    };
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json() as { models: Array<{ name: string }> };
      return data.models.map(m => m.name);
    } catch { return []; }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch { return false; }
  }
}
