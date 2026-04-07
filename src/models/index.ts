/**
 * NeuroDEX Multi-Model API Layer
 * Unified interface for Claude, OpenAI, Gemini, DeepSeek, Mistral, Ollama
 */

export type ModelProvider = 'claude' | 'openai' | 'gemini' | 'deepseek' | 'mistral' | 'ollama' | 'claude-code';

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  displayName: string;
  maxTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  contextWindow: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ContentBlock[];
  toolCallId?: string;
  toolName?: string;
}

export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | ContentBlock[];
  thinking?: string;
  imageUrl?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GenerateOptions {
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  thinking?: boolean;
  thinkingBudget?: number;
  stream?: boolean;
  onChunk?: (chunk: StreamChunk) => void;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'thinking' | 'done' | 'error';
  text?: string;
  toolName?: string;
  toolId?: string;
  toolInput?: Record<string, unknown>;
  thinking?: string;
  error?: string;
}

export interface GenerateResult {
  content: ContentBlock[];
  inputTokens: number;
  outputTokens: number;
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop';
  model: string;
  provider: ModelProvider;
}

export interface ModelAdapter {
  generate(options: GenerateOptions): Promise<GenerateResult>;
  listModels(): Promise<string[]>;
  isAvailable(): Promise<boolean>;
}

// Available models catalog
export const MODELS: ModelConfig[] = [
  // Claude
  { provider: 'claude', model: 'claude-opus-4-6', displayName: 'Claude Opus 4.6', maxTokens: 32000, supportsTools: true, supportsVision: true, supportsThinking: true, contextWindow: 200000 },
  { provider: 'claude', model: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', maxTokens: 16000, supportsTools: true, supportsVision: true, supportsThinking: false, contextWindow: 200000 },
  { provider: 'claude', model: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5', maxTokens: 8000, supportsTools: true, supportsVision: true, supportsThinking: false, contextWindow: 200000 },
  // OpenAI
  { provider: 'openai', model: 'gpt-4o', displayName: 'GPT-4o', maxTokens: 16384, supportsTools: true, supportsVision: true, supportsThinking: false, contextWindow: 128000 },
  { provider: 'openai', model: 'gpt-4o-mini', displayName: 'GPT-4o Mini', maxTokens: 16384, supportsTools: true, supportsVision: true, supportsThinking: false, contextWindow: 128000 },
  { provider: 'openai', model: 'o1', displayName: 'o1 (Reasoning)', maxTokens: 32768, supportsTools: false, supportsVision: false, supportsThinking: true, contextWindow: 200000 },
  { provider: 'openai', model: 'o3-mini', displayName: 'o3-mini', maxTokens: 65536, supportsTools: true, supportsVision: false, supportsThinking: true, contextWindow: 200000 },
  // Gemini
  { provider: 'gemini', model: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', maxTokens: 8192, supportsTools: true, supportsVision: true, supportsThinking: false, contextWindow: 1000000 },
  { provider: 'gemini', model: 'gemini-2.0-pro', displayName: 'Gemini 2.0 Pro', maxTokens: 8192, supportsTools: true, supportsVision: true, supportsThinking: false, contextWindow: 2000000 },
  // DeepSeek
  { provider: 'deepseek', model: 'deepseek-chat', displayName: 'DeepSeek V3', maxTokens: 8192, supportsTools: true, supportsVision: false, supportsThinking: false, contextWindow: 64000 },
  { provider: 'deepseek', model: 'deepseek-reasoner', displayName: 'DeepSeek R1 (Reasoning)', maxTokens: 8192, supportsTools: false, supportsVision: false, supportsThinking: true, contextWindow: 64000 },
  // Mistral
  { provider: 'mistral', model: 'mistral-large-latest', displayName: 'Mistral Large', maxTokens: 8192, supportsTools: true, supportsVision: false, supportsThinking: false, contextWindow: 131000 },
  { provider: 'mistral', model: 'codestral-latest', displayName: 'Codestral', maxTokens: 8192, supportsTools: true, supportsVision: false, supportsThinking: false, contextWindow: 256000 },
  // Ollama (local)
  { provider: 'ollama', model: 'llama3.3', displayName: 'Llama 3.3 (Local)', maxTokens: 4096, supportsTools: true, supportsVision: false, supportsThinking: false, contextWindow: 128000 },

  // Claude Code (CLI subscription — no API key needed)
  { provider: 'claude-code', model: 'claude-code-opus',   displayName: 'Claude Opus (Subscription)', maxTokens: 32000, supportsTools: false, supportsVision: false, supportsThinking: true,  contextWindow: 200000 },
  { provider: 'claude-code', model: 'claude-code-sonnet', displayName: 'Claude Sonnet (Subscription)', maxTokens: 16000, supportsTools: false, supportsVision: false, supportsThinking: false, contextWindow: 200000 },
  { provider: 'claude-code', model: 'claude-code-haiku',  displayName: 'Claude Haiku (Subscription)', maxTokens: 8000,  supportsTools: false, supportsVision: false, supportsThinking: false, contextWindow: 200000 },
  { provider: 'ollama', model: 'qwen2.5-coder', displayName: 'Qwen 2.5 Coder (Local)', maxTokens: 8192, supportsTools: true, supportsVision: false, supportsThinking: false, contextWindow: 128000 },
];

export function getModelConfig(provider: ModelProvider, model: string): ModelConfig | undefined {
  return MODELS.find(m => m.provider === provider && m.model === model);
}

export function getModelsByProvider(provider: ModelProvider): ModelConfig[] {
  return MODELS.filter(m => m.provider === provider);
}

export async function getAvailableProviders(): Promise<ModelProvider[]> {
  const { getAvailableProviders: _get } = await import('./registry.js');
  return _get();
}
