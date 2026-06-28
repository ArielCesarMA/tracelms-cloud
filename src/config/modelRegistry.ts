/**
 * Static model capability registry.
 *
 * Each entry provides all values consumed by the LLM layer:
 *   - tps: empirical tokens-per-second for timeout calculation
 *   - maxOutputTokens: ceiling passed to the provider API (sized for TraceLMs payloads, not model max)
 *   - isReasoningModel: flat 300s timeout + Reasoning badge + "Thinking..." loading message
 *   - supportsSystemInstruction: false → concatenate system prompt into user message (Gemini REST fallback)
 *   - tier: primary speed/capability badge rendered in LLMProvidersTab
 *   - contextWindowK: context window in thousands of tokens, shown in model detail
 *
 * Consumers call getModelCapabilities() from probeModelCapabilities.ts — never read this object directly.
 *
 * When adding a new model: add its entry here first, then run npm run db:seed.
 * TODO: add gemini-3.5-flash once exact API ID is confirmed at ai.google.dev/gemini-api/docs/models
 * TODO: add gpt-5.4, gpt-5.5, o3, o3-pro once IDs confirmed via GET https://api.openai.com/v1/models
 */

export type ModelTier = 'fast' | 'economy' | 'balanced' | 'best-quality';

export interface ModelCapabilities {
  tps: number;
  maxOutputTokens: number;
  isReasoningModel: boolean;
  supportsSystemInstruction: boolean;
  tier: ModelTier;
  contextWindowK: number;
}

export const MODEL_REGISTRY: Record<string, ModelCapabilities> = {

  // ── Anthropic ──────────────────────────────────────────────────────────────
  'claude-opus-4-8': {
    tps: 40,
    maxOutputTokens: 32768,
    isReasoningModel: false,
    supportsSystemInstruction: true,
    tier: 'best-quality',
    contextWindowK: 1000,
  },
  'claude-sonnet-4-6': {
    tps: 70,
    maxOutputTokens: 16384,
    isReasoningModel: false,
    supportsSystemInstruction: true,
    tier: 'balanced',
    contextWindowK: 1000,
  },
  'claude-haiku-4-5': {
    tps: 150,
    maxOutputTokens: 8192,
    isReasoningModel: false,
    supportsSystemInstruction: true,
    tier: 'fast',
    contextWindowK: 200,
  },
  'claude-fable-5': {
    tps: 35,
    maxOutputTokens: 32768,
    isReasoningModel: true,
    supportsSystemInstruction: true,
    tier: 'best-quality',
    contextWindowK: 1000,
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  'gpt-4o-mini': {
    tps: 120,
    maxOutputTokens: 16384,
    isReasoningModel: false,
    supportsSystemInstruction: true,
    tier: 'economy',
    contextWindowK: 128,
  },
  'gpt-4.1-mini': {
    tps: 130,
    maxOutputTokens: 16384,
    isReasoningModel: false,
    supportsSystemInstruction: true,
    tier: 'fast',
    contextWindowK: 128,
  },
  'gpt-4.1': {
    tps: 55,
    maxOutputTokens: 32768,
    isReasoningModel: false,
    supportsSystemInstruction: true,
    tier: 'best-quality',
    contextWindowK: 1024,
  },
  'o4-mini': {
    tps: 50,
    maxOutputTokens: 65536,
    isReasoningModel: true,
    supportsSystemInstruction: true,
    tier: 'best-quality',
    contextWindowK: 200,
  },
  // TODO: add gpt-5.4, gpt-5.5 — confirm exact API ID strings at platform.openai.com
  // TODO: add o3, o3-pro — isReasoningModel: true, maxOutputTokens: 100000; confirm API lifecycle

  // ── Gemini ─────────────────────────────────────────────────────────────────
  'gemini-2.5-flash': {
    tps: 100,
    maxOutputTokens: 8192,
    isReasoningModel: false,
    supportsSystemInstruction: true,
    tier: 'fast',
    contextWindowK: 1000,
  },
  'gemini-2.5-pro': {
    tps: 50,
    maxOutputTokens: 8192,
    isReasoningModel: false,
    supportsSystemInstruction: true,
    tier: 'balanced',
    contextWindowK: 1000,
  },
  'gemini-3.1-pro': {
    tps: 30,
    maxOutputTokens: 8192,
    isReasoningModel: true,
    supportsSystemInstruction: true,
    tier: 'best-quality',
    contextWindowK: 1000,
  },
  // TODO: add gemini-3.5-flash — confirm exact API ID (may include version suffix e.g. -001)

  // ── Groq ───────────────────────────────────────────────────────────────────
  'llama-4-scout-17b-16e-instruct': {
    tps: 300,
    maxOutputTokens: 8192,
    isReasoningModel: false,
    supportsSystemInstruction: true,
    tier: 'fast',
    contextWindowK: 128,
  },
  'llama-3.3-70b-specdec': {
    tps: 250,
    maxOutputTokens: 8192,
    isReasoningModel: false,
    supportsSystemInstruction: true,
    tier: 'balanced',
    contextWindowK: 128,
  },
  'llama3-70b-8192': {
    tps: 280,
    maxOutputTokens: 8192,
    isReasoningModel: false,
    supportsSystemInstruction: true,
    tier: 'balanced',
    contextWindowK: 8,
  },
  'gemma2-9b-it': {
    tps: 350,
    maxOutputTokens: 8192,
    isReasoningModel: false,
    supportsSystemInstruction: true,
    tier: 'economy',
    contextWindowK: 8,
  },
};
