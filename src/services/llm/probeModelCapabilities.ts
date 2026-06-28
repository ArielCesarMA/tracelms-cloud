/**
 * probeModelCapabilities — Option C hybrid resolution chain.
 *
 * Resolution order for any given (modelId, provider) pair:
 *   Step 1 — Static MODEL_REGISTRY lookup (no network, instant)
 *   Step 2 — 24h in-memory probe cache (no network if warm)
 *   Step 3 — Gemini models.get() API (Gemini provider only)
 *   Step 4 — OpenRouter model catalogue (provider-agnostic, 400+ models)
 *   Step 5 — Safe conservative defaults (never throws)
 *
 * Callers always receive a ModelCapabilities object. Unknown model IDs get
 * conservative defaults that prevent crashes while logging a warning.
 *
 * External consumers: timeoutUtil.ts (tps, isReasoningModel),
 *                     AnthropicProvider.ts (maxOutputTokens),
 *                     OpenAIProvider.ts (maxOutputTokens),
 *                     GeminiProvider.ts (maxOutputTokens, supportsSystemInstruction),
 *                     LLM Providers API route (tier, isReasoningModel for badges).
 */

import { MODEL_REGISTRY, type ModelCapabilities } from '../../config/modelRegistry';
import { getFromCache, setInCache } from '../../utils/probeCache';

const SAFE_DEFAULTS: ModelCapabilities = {
  tps: 40,
  maxOutputTokens: 4096,
  isReasoningModel: false,
  supportsSystemInstruction: true,
  tier: 'balanced',
  contextWindowK: 128,
};

async function probeGemini(modelId: string, apiKey: string): Promise<ModelCapabilities | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}?key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as {
      inputTokenLimit?: number;
      outputTokenLimit?: number;
      supportedGenerationMethods?: string[];
    };
    const contextWindowK = Math.round((data.inputTokenLimit ?? 131072) / 1000);
    const maxOutputTokens = data.outputTokenLimit ?? 8192;
    return {
      ...SAFE_DEFAULTS,
      maxOutputTokens,
      supportsSystemInstruction: true,
      tier: 'balanced',
      contextWindowK,
    };
  } catch {
    return null;
  }
}

async function probeOpenRouter(modelId: string): Promise<ModelCapabilities | null> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      data?: Array<{ id: string; context_length?: number; top_provider?: { max_completion_tokens?: number } }>;
    };
    const match = data.data?.find((m) => m.id === modelId || m.id.endsWith(`/${modelId}`));
    if (!match) return null;
    const contextWindowK = Math.round((match.context_length ?? 131072) / 1000);
    const maxOutputTokens = match.top_provider?.max_completion_tokens ?? 4096;
    return {
      ...SAFE_DEFAULTS,
      maxOutputTokens,
      contextWindowK,
    };
  } catch {
    return null;
  }
}

export async function getModelCapabilities(
  modelId: string,
  provider: string,
  geminiApiKey?: string,
): Promise<ModelCapabilities> {
  // Step 1 — Static registry (no network)
  const registered = MODEL_REGISTRY[modelId];
  if (registered) return registered;

  // Step 2 — 24h probe cache
  const cached = getFromCache(modelId);
  if (cached) return cached;

  let result: ModelCapabilities | null = null;

  // Step 3 — Gemini native API (Gemini provider only)
  if (provider.toLowerCase() === 'gemini' && geminiApiKey) {
    result = await probeGemini(modelId, geminiApiKey);
  }

  // Step 4 — OpenRouter (all providers)
  if (!result) {
    result = await probeOpenRouter(modelId);
  }

  // Step 5 — Safe conservative defaults
  if (!result) {
    console.warn(`[probeModelCapabilities] Unknown model "${modelId}" (provider: ${provider}) — using conservative defaults.`);
    result = { ...SAFE_DEFAULTS };
  }

  setInCache(modelId, result);
  return result;
}
