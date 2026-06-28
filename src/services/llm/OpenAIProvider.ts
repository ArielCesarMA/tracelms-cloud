import { LLMRequest, LLMResponse, StreamChunkHandler, TokenUsage } from '../../types';
import { LLMProvider } from './LLMProvider';
import { estimateTimeoutMs } from './timeoutUtil';
import { makeIdleTimeout } from '../../utils/idleTimeout';
import { getModelCapabilities } from './probeModelCapabilities';

export class OpenAIProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is missing.');
    }

    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    const [timeoutMs, { maxOutputTokens }] = await Promise.all([
      estimateTimeoutMs(prompt, request.model, 'openai'),
      getModelCapabilities(request.model, 'openai'),
    ]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: request.model,
          temperature: request.temperature ?? 0.2,
          max_tokens: maxOutputTokens,
          messages: [
            ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
            { role: 'user', content: request.prompt }
          ]
        }),
        signal: controller.signal
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`OpenAI request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}.`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content ?? '';
    const u = data.usage;
    const usage: TokenUsage | undefined = u
      ? { promptTokens: u.prompt_tokens ?? 0, completionTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? 0 }
      : undefined;
    return { text, usage };
  }

  public async completeVision(imageBase64: string, mimeType: string, systemPrompt: string): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('OpenAI API key is missing.');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4.1',
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract all requirements from this image.' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'auto' } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenAI vision request failed with status ${response.status}.`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { text: data.choices?.[0]?.message?.content ?? '' };
  }

  public async stream(request: LLMRequest, onChunk: StreamChunkHandler): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('OpenAI API key is missing.');

    // Option 2 — idle timeout: only abort if no chunk arrives for IDLE_MS.
    const IDLE_MS = 300_000;
    const { signal, touch, cancel } = makeIdleTimeout(IDLE_MS);
    const { maxOutputTokens } = await getModelCapabilities(request.model, 'openai');

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: request.model,
          temperature: request.temperature ?? 0.2,
          max_tokens: maxOutputTokens,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
            { role: 'user', content: request.prompt },
          ],
        }),
        signal,
      });
    } catch (err) {
      cancel();
      if ((err as Error).name === 'AbortError') {
        // Timed out before first byte — fall back to complete()
        const result = await this.complete(request);
        onChunk(result.text);
        return result;
      }
      throw err;
    }

    if (!response.ok) {
      cancel();
      throw new Error(`OpenAI request failed with status ${response.status}.`);
    }

    let fullText = '';
    let streamUsage: TokenUsage | undefined;
    try {
      const { parseSseLines } = await import('../../utils/sseReader');
      for await (const line of parseSseLines(response)) {
        const data = JSON.parse(line) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };
        const delta = data.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onChunk(delta);
          touch(); // reset idle window
        }
        if (data.usage) {
          streamUsage = {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0,
          };
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Option 3 — idle timeout mid-stream: return partial content if available
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

    if (!fullText) {
      const result = await this.complete(request);
      onChunk(result.text);
      return result;
    }

    return { text: fullText, usage: streamUsage };
  }
}
