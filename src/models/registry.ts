/**
 * NeuroDEX Model Registry
 * Central factory for creating model adapters with stored API keys.
 */

import { getApiKey } from '../security/keyVault.js';
import type { ModelAdapter, ModelProvider } from './index.js';
import { ClaudeAdapter } from './claude.js';
import { OpenAIAdapter } from './openai.js';
import { GeminiAdapter } from './gemini.js';
import { DeepSeekAdapter } from './deepseek.js';
import { OllamaAdapter } from './ollama.js';

const adapterCache: Map<string, ModelAdapter> = new Map();

export async function getAdapter(
  provider: ModelProvider,
  model: string
): Promise<ModelAdapter> {
  const cacheKey = `${provider}:${model}`;
  if (adapterCache.has(cacheKey)) return adapterCache.get(cacheKey)!;

  let adapter: ModelAdapter;

  switch (provider) {
    case 'claude': {
      const key = await getApiKey('claude');
      if (!key) throw new Error('Claude API key not configured. Run: neurodex config set-key claude <key>');
      adapter = new ClaudeAdapter(key);
      break;
    }
    case 'openai': {
      const key = await getApiKey('openai');
      if (!key) throw new Error('OpenAI API key not configured. Run: neurodex config set-key openai <key>');
      adapter = new OpenAIAdapter(key, model);
      break;
    }
    case 'gemini': {
      const key = await getApiKey('gemini');
      if (!key) throw new Error('Gemini API key not configured. Run: neurodex config set-key gemini <key>');
      adapter = new GeminiAdapter(key, model);
      break;
    }
    case 'deepseek': {
      const key = await getApiKey('deepseek');
      if (!key) throw new Error('DeepSeek API key not configured. Run: neurodex config set-key deepseek <key>');
      adapter = new DeepSeekAdapter(key, model);
      break;
    }
    case 'mistral': {
      const key = await getApiKey('mistral');
      if (!key) throw new Error('Mistral API key not configured. Run: neurodex config set-key mistral <key>');
      // Mistral uses OpenAI-compatible API
      const OpenAI = (await import('./openai.js')).OpenAIAdapter;
      const MistralOpenAI = await import('openai').then(m => m.default);
      adapter = new OpenAIAdapter(key, model);
      break;
    }
    case 'ollama': {
      const baseUrl = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
      adapter = new OllamaAdapter(model, baseUrl);
      break;
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }

  adapterCache.set(cacheKey, adapter);
  return adapter;
}

export function clearAdapterCache(): void {
  adapterCache.clear();
}

export async function getAvailableProviders(): Promise<ModelProvider[]> {
  const providers: ModelProvider[] = [];
  const checks: Array<[ModelProvider, () => Promise<string | null>]> = [
    ['claude', () => getApiKey('claude')],
    ['openai', () => getApiKey('openai')],
    ['gemini', () => getApiKey('gemini')],
    ['deepseek', () => getApiKey('deepseek')],
    ['mistral', () => getApiKey('mistral')],
  ];

  for (const [provider, check] of checks) {
    const key = await check();
    if (key) providers.push(provider);
  }

  // Always check Ollama (local, no key needed)
  const ollama = new OllamaAdapter();
  if (await ollama.isAvailable()) providers.push('ollama');

  return providers;
}
