import { LLMRequest, LLMResponse, StreamChunkHandler, TokenUsage } from '../../types';
import { LLMProvider } from './LLMProvider';
import { estimateTimeoutMs } from './timeoutUtil';
import { makeIdleTimeout } from '../../utils/idleTimeout';
import { getModelCapabilities } from './probeModelCapabilities';

export class GeminiProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  private static buildRequestBody(
    model: string,
    prompt: string,
    temperature: number,
    systemPrompt?: string,
    isReasoningModel?: boolean,
  ): Record<string, unknown> {
    // No maxOutputTokens cap — structured JSON generation can produce large outputs;
    // truncation causes silent JSON parse failures.
    void model;
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        ...(isReasoningModel ? { thinkingConfig: { thinkingBudget: -1 } } : {}),
      },
    };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    return body;
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
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3.1-pro',
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

    if (result.size === 0) {
      result.add('gemini-2.5-flash');
    }

    return Array.from(result);
  }

  private async completeWithModel(
    model: string,
    prompt: string,
    temperature: number,
    maxRetries: number,
    timeoutMs: number,
    signal?: AbortSignal,
    systemPrompt?: string,
    isReasoningModel?: boolean,
  ): Promise<{
    text: string;
    usage?: TokenUsage;
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
              GeminiProvider.buildRequestBody(model, prompt, temperature, systemPrompt, isReasoningModel)
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
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
          };

          const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          const m = data.usageMetadata;
          const usage: TokenUsage | undefined = m
            ? { promptTokens: m.promptTokenCount ?? 0, completionTokens: m.candidatesTokenCount ?? 0, totalTokens: m.totalTokenCount ?? 0 }
            : undefined;
          return {
            text,
            usage,
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
      usage: undefined,
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

    const prompt = request.prompt;

    const [timeoutMs, caps] = await Promise.all([
      estimateTimeoutMs(prompt, model, 'gemini', this.apiKey),
      getModelCapabilities(model, 'gemini', this.apiKey),
    ]);

    const globalController = new AbortController();
    const globalTimer = setTimeout(() => globalController.abort(), timeoutMs);

    try {
      const primaryResult = await this.completeWithModel(
        model,
        prompt,
        request.temperature ?? 0.2,
        this.transientRetryCount,
        timeoutMs,
        globalController.signal,
        request.systemPrompt,
        caps.isReasoningModel,
      );

      if (primaryResult.text) {
        return { text: primaryResult.text, usage: primaryResult.usage };
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
            globalController.signal,
            request.systemPrompt,
            caps.isReasoningModel,
          );

          if (fallbackResult.text) {
            return { text: fallbackResult.text, usage: fallbackResult.usage };
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

  public async completeVision(imageBase64: string, mimeType: string, systemPrompt: string): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('Gemini API key is missing.');

    const model = 'gemini-2.5-flash';
    const body: Record<string, unknown> = {
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: 'Analyze this image and extract software requirements as instructed.' },
        ],
      }],
      generationConfig: { temperature: 0.2 },
    };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const endpoints = this.getEndpointCandidates(model);
    for (const endpoint of endpoints) {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new Error(`Gemini vision request failed: ${(err as Error).message}`);
      }

      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const m = data.usageMetadata;
        const usage: TokenUsage | undefined = m
          ? { promptTokens: m.promptTokenCount ?? 0, completionTokens: m.candidatesTokenCount ?? 0, totalTokens: m.totalTokenCount ?? 0 }
          : undefined;
        console.log(`[generate/vision] Gemini vision complete — model=${model} chars=${text.length}`);
        return { text, usage };
      }

      if (response.status === 404) continue;

      const detail = await this.parseErrorDetail(response);
      throw new Error(
        `Gemini vision request failed with status ${response.status}${detail ? `: ${detail}` : '.'}`
      );
    }

    throw new Error(`Gemini vision request failed: model '${model}' unavailable on all endpoints.`);
  }

  public async stream(request: LLMRequest, onChunk: StreamChunkHandler): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('Gemini API key is missing.');

    const model = this.normalizeModel(request.model);
    const prompt = request.prompt;
    const caps = await getModelCapabilities(model, 'gemini', this.apiKey);

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
          body: JSON.stringify(GeminiProvider.buildRequestBody(model, prompt, request.temperature ?? 0.2, request.systemPrompt, caps.isReasoningModel)),
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
    let streamUsage: TokenUsage | undefined;
    try {
      const { parseSseLines } = await import('../../utils/sseReader');
      for await (const line of parseSseLines(response)) {
        const data = JSON.parse(line) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
        };
        const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (chunk) {
          fullText += chunk;
          onChunk(chunk);
          touch(); // reset idle window — stream is alive
        }
        if (data.usageMetadata) {
          const m = data.usageMetadata;
          streamUsage = { promptTokens: m.promptTokenCount ?? 0, completionTokens: m.candidatesTokenCount ?? 0, totalTokens: m.totalTokenCount ?? 0 };
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Option 3 — idle timeout fired mid-stream.
        // If we already received content, return it so the route can attempt
        // JSON extraction on what arrived. Only fall back to complete() when
        // the stream produced nothing at all.
        cancel();
        if (fullText) return { text: fullText, usage: streamUsage };
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

    return { text: fullText, usage: streamUsage };
  }
}
