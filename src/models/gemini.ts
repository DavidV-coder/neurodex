/**
 * NeuroDEX — Google Gemini Adapter
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import type {
  ModelAdapter, GenerateOptions, GenerateResult, ContentBlock, StreamChunk
} from './index.js';

export class GeminiAdapter implements ModelAdapter {
  private client: GoogleGenerativeAI;
  private model: string;
  private genModel: GenerativeModel;

  constructor(apiKey: string, model = 'gemini-2.0-flash') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.genModel = this.client.getGenerativeModel({ model });
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { messages, systemPrompt, maxTokens = 8192, stream, onChunk } = options;

    const model = this.client.getGenerativeModel({
      model: this.model,
      ...(systemPrompt && { systemInstruction: systemPrompt }),
      generationConfig: { maxOutputTokens: maxTokens }
    });

    const history = messages.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }]
    }));

    const lastMessage = messages[messages.length - 1];
    const chat = model.startChat({ history });
    const userContent = typeof lastMessage.content === 'string'
      ? lastMessage.content : JSON.stringify(lastMessage.content);

    if (stream && onChunk) {
      const streamResult = await chat.sendMessageStream(userContent);
      let text = '';
      for await (const chunk of streamResult.stream) {
        const chunkText = chunk.text();
        text += chunkText;
        onChunk({ type: 'text', text: chunkText });
      }
      onChunk({ type: 'done' });
      const response = await streamResult.response;
      return {
        content: [{ type: 'text', text }],
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        stopReason: 'end_turn',
        model: this.model,
        provider: 'gemini'
      };
    }

    const result = await chat.sendMessage(userContent);
    const response = await result.response;
    const text = response.text();

    return {
      content: [{ type: 'text', text }],
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      stopReason: 'end_turn',
      model: this.model,
      provider: 'gemini'
    };
  }

  async listModels(): Promise<string[]> {
    return ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'];
  }

  async isAvailable(): Promise<boolean> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      await model.generateContent('test');
      return true;
    } catch {
      return false;
    }
  }
}
