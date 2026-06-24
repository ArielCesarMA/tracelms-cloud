import { LLMRequest, LLMResponse, StreamChunkHandler } from '../../types';
import { LLMProvider } from './LLMProvider';
import { estimateTimeoutMs } from './timeoutUtil';
import { makeIdleTimeout } from '../../utils/idleTimeout';

export class GeminiProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  private static buildRequestBody(
    model: string,
    prompt: string,
    temperature: number
  ): Record<string, unknown> {
    // No maxOutputTokens cap — structured JSON generation (test cases, scenarios)
    // can produce large outputs; truncation causes silent JSON parse failures.
    // thinkingConfig and systemInstruction are NOT available via the Gemini REST
    // API (v1/v1beta generateContent) — both are SDK-only. Prompt concatenation
    // is used instead.
    void model;
    return {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature }
    };
  }

  private readonly transientRetryCount = 3;
  private readonly fallbackRetryCount = 1;

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isTransientStatus(status: number): boolean {
    return status === 429 || status === 503 || status >= 500;
  }

  private isLikelyTextModel(model: string): boolean {
    const normalized = this.normalizeModel(model).toLowerCase();
    return !normalized.includes('tts') && !normalized.includes('audio');
  }

  private isModalityMismatch(status: number, detail: string): boolean {
    if (status !== 400) {
      return false;
    }
    const lowered = detail.toLowerCase();
    return lowered.includes('response modalities') || lowered.includes('accepts the following combination');
  }

  private normalizeModel(model: string): string {
    return model.trim().replace(/^models\//i, '');
  }

  private async listAvailableModels(signal?: AbortSignal): Promise<string[]> {
    const endpoints = [
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(this.apiKey)}`,
      `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(this.apiKey)}`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { signal });
        if (!response.ok) {
          continue;
        }

        const data = (await response.json()) as {
          models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
        };

        const names = (data.models ?? [])
          .filter((model) => (model.supportedGenerationMethods ?? []).includes('generateContent'))
          .map((model) => (model.name ?? '').replace(/^models\//i, '').trim())
          .filter((name) => this.isLikelyTextModel(name))
          .filter((name) => name.length > 0);

        if (names.length > 0) {
          return names;
        }
      } catch {
        // Ignore and try the next endpoint.
      }
    }

    return [];
  }

  private async parseErrorDetail(response: Response): Promise<string> {
    try {
      const errorBody = (await response.json()) as {
        error?: { message?: string; status?: string };
      };
      return errorBody.error?.message ?? errorBody.error?.status ?? '';
    } catch {
      return '';
    }
  }

  private getEndpointCandidates(model: string): string[] {
    return [
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(this.apiKey)}`
    ];
  }

  private getFallbackModels(primaryModel: string, availableModels: string[]): string[] {
    const preferred = [
      'gemini-2.0-flash',
      'gemini-2.0-flash-001',
      'gemini-2.0-flash-lite',
      'gemini-2.0-flash-lite-001',
      'gemini-2.5-flash',
      'gemini-2.5-pro'
    ];

    const normalizedAvailable = availableModels
      .map((item) => this.normalizeModel(item))
      .filter((item) => this.isLikelyTextModel(item));
    const result = new Set<string>();

    for (const model of preferred) {
      if (model !== primaryModel && normalizedAvailable.includes(model)) {
        result.add(model);
      }
    }

    for (const model of normalizedAvailable) {
      if (model !== primaryModel) {
        result.add(model);
      }
    }

    if (result.size === 0 && primaryModel.startsWith('gemini-2.5')) {
      result.add('gemini-2.0-flash');
      result.add('gemini-2.0-flash-lite');
    }

    return Array.from(result);
  }

  private async completeWithModel(
    model: string,
    prompt: string,
    temperature: number,
    maxRetries: number,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<{
    text: string;
    status: number;
    detail: string;
    transientFailure: boolean;
  }> {
    const endpointCandidates = this.getEndpointCandidates(model);
    let lastStatus = 0;
    let lastDetail = '';
    let transientFailure = false;
    const baseBackoffMs = 1200;

    for (const endpoint of endpointCandidates) {
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        if (signal?.aborted) {
          throw new Error(`Gemini request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
        }
        let response: Response;
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              GeminiProvider.buildRequestBody(model, prompt, temperature)
            ),
            signal
          });
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            throw new Error(`Gemini request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
          }
          throw err;
        }

        if (response.ok) {
          const data = (await response.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };

          const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          return {
            text,
            status: 200,
            detail: '',
            transientFailure: false
          };
        }

        lastStatus = response.status;
        lastDetail = await this.parseErrorDetail(response);

        if (response.status === 404) {
          break;
        }

        if (this.isTransientStatus(response.status)) {
          transientFailure = true;
          if (attempt < maxRetries) {
            const jitterMs = Math.floor(Math.random() * 400);
            const waitMs = baseBackoffMs * 2 ** attempt + jitterMs;
            await this.delay(waitMs);
            continue;
          }
          break;
        }

        if (this.isModalityMismatch(response.status, lastDetail)) {
          break;
        }

        throw new Error(
          `Gemini request failed with status ${response.status}${
            lastDetail ? `: ${lastDetail}` : '.'
          }`
        );
      }
    }

    return {
      text: '',
      status: lastStatus,
      detail: lastDetail,
      transientFailure
    };
  }

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('Gemini API key is missing.');
    }

    const model = this.normalizeModel(request.model);
    if (!model) {
      throw new Error('Gemini model is required.');
    }

    // Concatenate system + user prompts. The Gemini REST API (v1/v1beta generateContent)
    // does not support systemInstruction or thinkingConfig — both are SDK-only.
    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    // Dynamic timeout: scales with estimated token count so large documents
    // don't hit a wall-clock ceiling that was sized for small inputs.
    const timeoutMs = estimateTimeoutMs(prompt, model, 'gemini');

    const globalController = new AbortController();
    const globalTimer = setTimeout(() => globalController.abort(), timeoutMs);

    try {
      const primaryResult = await this.completeWithModel(
        model,
        prompt,
        request.temperature ?? 0.2,
        this.transientRetryCount,
        timeoutMs,
        globalController.signal
      );

      if (primaryResult.text) {
        return { text: primaryResult.text };
      }

      const availableModels = await this.listAvailableModels(globalController.signal);

      if (primaryResult.transientFailure || this.isModalityMismatch(primaryResult.status, primaryResult.detail)) {
        const fallbackModels = this.getFallbackModels(model, availableModels);
        for (const fallbackModel of fallbackModels) {
          const fallbackResult = await this.completeWithModel(
            fallbackModel,
            prompt,
            request.temperature ?? 0.2,
            this.fallbackRetryCount,
            timeoutMs,
            globalController.signal
          );

          if (fallbackResult.text) {
            return { text: fallbackResult.text };
          }
        }

        const fallbackHint =
          fallbackModels.length > 0
            ? ` Tried fallback models: ${fallbackModels.slice(0, 4).join(', ')}.`
            : '';
        throw new Error(
          `Gemini request failed with status ${primaryResult.status || 503}${
            primaryResult.detail ? `: ${primaryResult.detail}` : '.'
          }${fallbackHint}`
        );
      }

      const suggestion =
        availableModels.length > 0
          ? ` Available models for this key include: ${availableModels.slice(0, 8).join(', ')}.`
          : '';
      throw new Error(
        `Gemini request failed with status ${primaryResult.status || 404}${
          primaryResult.detail ? `: ${primaryResult.detail}` : '.'
        } Model '${model}' may be unavailable for this API key.${suggestion}`
      );
    } finally {
      clearTimeout(globalTimer);
    }
  }

  public async stream(request: LLMRequest, onChunk: StreamChunkHandler): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('Gemini API key is missing.');

    const model = this.normalizeModel(request.model);
    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    // Option 2 — idle timeout: abort only if no chunk arrives for IDLE_MS.
    // A wall-clock timeout is wrong for streaming because it fires based on
    // total elapsed time, killing healthy streams that happen to be large.
    // 45 seconds of silence means the LLM or connection is genuinely hung.
    const IDLE_MS = 300_000;
    const { signal, touch, cancel } = makeIdleTimeout(IDLE_MS);

    const endpoints = [
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(this.apiKey)}&alt=sse`,
      `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(this.apiKey)}&alt=sse`,
    ];

    let response: Response | null = null;
    let lastStreamStatus = 0;
    let lastStreamDetail = '';
    for (const endpoint of endpoints) {
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(GeminiProvider.buildRequestBody(model, prompt, request.temperature ?? 0.2)),
          signal,
        });
        if (r.ok) { response = r; break; }
        lastStreamStatus = r.status;
        lastStreamDetail = await this.parseErrorDetail(r);
        console.error(`[stream] Gemini ${model} endpoint non-OK: ${r.status}${lastStreamDetail ? ` — ${lastStreamDetail}` : ''}`);
        // Rate limit — no point hitting complete(), it will also fail
        if (r.status === 429) {
          cancel();
          throw new Error(`Gemini rate limit exceeded (429)${lastStreamDetail ? `: ${lastStreamDetail}` : '. Wait a minute and retry.'}`);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') break; // idle timeout before first byte
        throw err; // re-throw 429 and other explicit errors
      }
    }

    // Streaming endpoint unavailable — fall back to complete() only for non-rate-limit failures
    if (!response) {
      cancel();
      console.warn(`[stream] Gemini streaming unavailable (last status: ${lastStreamStatus}), falling back to complete()`);
      const result = await this.complete(request);
      onChunk(result.text);
      return result;
    }

    let fullText = '';
    try {
      const { parseSseLines } = await import('../../utils/sseReader');
      for await (const line of parseSseLines(response)) {
        const data = JSON.parse(line) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (chunk) {
          fullText += chunk;
          onChunk(chunk);
          touch(); // reset idle window — stream is alive
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Option 3 — idle timeout fired mid-stream.
        // If we already received content, return it so the route can attempt
        // JSON extraction on what arrived. Only fall back to complete() when
        // the stream produced nothing at all.
        cancel();
        if (fullText) return { text: fullText };
        const result = await this.complete(request);
        onChunk(result.text);
        return result;
      }
      throw err;
    } finally {
      cancel();
    }

    // Stream ended with no content — fall back to complete() with full retry logic
    if (!fullText) {
      const result = await this.complete(request);
      onChunk(result.text);
      return result;
    }

    return { text: fullText };
  }
}
