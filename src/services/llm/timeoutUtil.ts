/**
 * Dynamic LLM timeout estimator.
 *
 * Problem: hardcoded timeouts (180s for Gemini 2.0, 120s for OpenAI/Anthropic) fail when
 * the combined prompt is large — large requirements docs, many scenarios, full test case sets
 * sent to the automation route all push generation time well past these ceilings.
 *
 * Strategy:
 *   1. Estimate token count from character length (1 token ≈ 4 chars for English prose).
 *   2. Apply a per-provider tokens-per-second generation rate.
 *   3. Multiply by a safety buffer to absorb queue wait time and network latency.
 *   4. Clamp to a minimum floor (never shorter than a trivial request) and a maximum
 *      ceiling (prevent runaway waits on unreasonably large inputs — reject at request
 *      validation level instead).
 */

const CHARS_PER_TOKEN = 4;

// Conservative tokens-per-second for structured JSON output (slower than prose).
// These are empirical estimates; adjust based on observed p95 latency.
const TPS_BY_PROVIDER: Record<string, number> = {
  gemini:    80,   // Gemini 2.0-flash: fast but variable under load
  'gemini-pro': 40, // Gemini 2.5-pro / thinking models: much slower
  openai:   100,   // gpt-4o: consistently fast
  anthropic:  60,  // claude-3.5-sonnet: moderate
  groq:     300,   // Groq: custom inference hardware, very fast
};

const SAFETY_BUFFER = 2.5;    // multiply estimated generation time by this factor
const MIN_TIMEOUT_MS = 60_000;  // 60s floor — even tiny requests need queue headroom
const MAX_TIMEOUT_MS = 600_000; // 10 minutes hard ceiling

function getTps(provider: string, model: string): number {
  const p = provider.toLowerCase();
  const m = model.toLowerCase();
  if (p === 'gemini' && (/2\.5|pro/i.test(m))) return TPS_BY_PROVIDER['gemini-pro'];
  return TPS_BY_PROVIDER[p] ?? 80;
}

/**
 * Estimate how many output tokens will be produced.
 * Structured JSON output typically runs 30–60% of input token count.
 */
function estimateOutputTokens(inputTokens: number): number {
  return Math.ceil(inputTokens * 0.5);
}

export function estimateTimeoutMs(prompt: string, model: string, provider: string): number {
  const inputTokens = Math.ceil(prompt.length / CHARS_PER_TOKEN);
  const outputTokens = estimateOutputTokens(inputTokens);
  const totalTokens = inputTokens + outputTokens;
  const tps = getTps(provider, model);
  const estimatedGenerationMs = (totalTokens / tps) * 1000;
  const timeoutMs = Math.ceil(estimatedGenerationMs * SAFETY_BUFFER);
  const clamped = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, timeoutMs));

  console.log(
    `[timeout] provider=${provider} model=${model} ` +
    `inputTokens≈${inputTokens} outputTokens≈${outputTokens} ` +
    `estimated=${Math.round(estimatedGenerationMs / 1000)}s timeout=${Math.round(clamped / 1000)}s`
  );

  return clamped;
}
