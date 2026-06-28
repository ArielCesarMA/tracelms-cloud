/**
 * Dynamic LLM timeout estimator — per-model registry edition.
 *
 * Resolution:
 *   1. getModelCapabilities() reads tps and isReasoningModel from MODEL_REGISTRY (or probe chain).
 *   2. Reasoning models bypass the TPS formula entirely — they think silently before producing
 *      output, so token throughput is meaningless until the first token arrives. Flat MAX_TIMEOUT_MS.
 *   3. Known models get an exact TPS-based timeout. Unknown models get conservative tps: 40.
 *
 * The per-provider TPS_MAP is intentionally removed — all values now live in modelRegistry.ts.
 */

import { getModelCapabilities } from './probeModelCapabilities';

const CHARS_PER_TOKEN = 4;
const SAFETY_BUFFER   = 2.5;
const MIN_TIMEOUT_MS  =  60_000;  // 60s floor
const MAX_TIMEOUT_MS  = 300_000;  // 5 min ceiling — also used as flat timeout for reasoning models

function estimateOutputTokens(inputTokens: number): number {
  return Math.ceil(inputTokens * 0.5);
}

export async function estimateTimeoutMs(
  prompt: string,
  model: string,
  provider: string,
  geminiApiKey?: string,
): Promise<number> {
  const caps = await getModelCapabilities(model, provider, geminiApiKey);

  // Reasoning models produce zero tokens for 30–60s then output rapidly.
  // TPS-based calculation is meaningless — use the flat ceiling instead.
  if (caps.isReasoningModel) {
    console.log(`[timeout] provider=${provider} model=${model} isReasoning=true → flat ${MAX_TIMEOUT_MS / 1000}s`);
    return MAX_TIMEOUT_MS;
  }

  const inputTokens          = Math.ceil(prompt.length / CHARS_PER_TOKEN);
  const outputTokens         = estimateOutputTokens(inputTokens);
  const totalTokens          = inputTokens + outputTokens;
  const estimatedGenerationMs = (totalTokens / caps.tps) * 1000;
  const timeoutMs            = Math.ceil(estimatedGenerationMs * SAFETY_BUFFER);
  const clamped              = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, timeoutMs));

  console.log(
    `[timeout] provider=${provider} model=${model} tps=${caps.tps} ` +
    `inputTokens≈${inputTokens} outputTokens≈${outputTokens} ` +
    `estimated=${Math.round(estimatedGenerationMs / 1000)}s timeout=${Math.round(clamped / 1000)}s`,
  );

  return clamped;
}
