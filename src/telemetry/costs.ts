/**
 * Token cost tracking for all supported models.
 * Prices in USD per 1M tokens (as of 2026).
 */

export interface ModelPricing {
  input: number;   // USD per 1M input tokens
  output: number;  // USD per 1M output tokens
}

export const PRICING_TABLE: Record<string, ModelPricing> = {
  // Claude (Anthropic)
  'claude-opus-4-6':                  { input: 15.00,  output: 75.00  },
  'claude-opus-4-5':                  { input: 15.00,  output: 75.00  },
  'claude-sonnet-4-6':                { input:  3.00,  output: 15.00  },
  'claude-sonnet-4-5':                { input:  3.00,  output: 15.00  },
  'claude-haiku-4-5-20251001':        { input:  0.80,  output:  4.00  },
  'claude-3-5-sonnet-20241022':       { input:  3.00,  output: 15.00  },
  'claude-3-5-haiku-20241022':        { input:  0.80,  output:  4.00  },
  'claude-3-opus-20240229':           { input: 15.00,  output: 75.00  },
  // OpenAI
  'gpt-4o':                           { input:  2.50,  output: 10.00  },
  'gpt-4o-mini':                      { input:  0.15,  output:  0.60  },
  'gpt-4-turbo':                      { input: 10.00,  output: 30.00  },
  'gpt-4':                            { input: 30.00,  output: 60.00  },
  'gpt-3.5-turbo':                    { input:  0.50,  output:  1.50  },
  'o1':                               { input: 15.00,  output: 60.00  },
  'o1-mini':                          { input:  3.00,  output: 12.00  },
  'o3-mini':                          { input:  1.10,  output:  4.40  },
  // Gemini
  'gemini-2.0-flash':                 { input:  0.075, output:  0.30  },
  'gemini-1.5-pro':                   { input:  3.50,  output: 10.50  },
  'gemini-1.5-flash':                 { input:  0.075, output:  0.30  },
  // DeepSeek
  'deepseek-chat':                    { input:  0.07,  output:  1.10  },
  'deepseek-reasoner':                { input:  0.55,  output:  2.19  },
  // Mistral
  'mistral-large-latest':             { input:  2.00,  output:  6.00  },
  'mistral-small-latest':             { input:  0.20,  output:  0.60  },
  'codestral-latest':                 { input:  0.30,  output:  0.90  },
};

export function getPricing(model: string): ModelPricing | null {
  if (PRICING_TABLE[model]) return PRICING_TABLE[model];
  // Fuzzy match on model prefix
  for (const key of Object.keys(PRICING_TABLE)) {
    if (model.startsWith(key) || key.startsWith(model)) return PRICING_TABLE[key];
  }
  return null;
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getPricing(model);
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  if (usd < 0.01)  return `$${usd.toFixed(4)}`;
  if (usd < 1)     return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n/1000).toFixed(1)}k`;
  return `${(n/1_000_000).toFixed(2)}M`;
}

export interface MessageTokenRecord {
  role: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  model: string;
  timestamp: number;
}
