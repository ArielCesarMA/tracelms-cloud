import { LLMRequest, LLMResponse, StreamChunkHandler, TokenUsage } from '../../types';
import { LLMProvider } from './LLMProvider';
import { estimateTimeoutMs } from './timeoutUtil';
import { makeIdleTimeout } from '../../utils/idleTimeout';
import { getModelCapabilities } from './probeModelCapabilities';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export class GroqProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('Groq API key is missing.');

    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    const [timeoutMs, { maxOutputTokens }] = await Promise.all([
      estimateTimeoutMs(prompt, request.model, 'groq'),
      getModelCapabilities(request.model, 'groq'),
    ]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          temperature: request.temperature ?? 0.2,
          max_tokens: maxOutputTokens,
          messages: [
            ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
            { role: 'user', content: request.prompt },
          ],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`Groq request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Groq request failed with status ${response.status}.`);
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

  public async stream(request: LLMRequest, onChunk: StreamChunkHandler): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('Groq API key is missing.');

    const IDLE_MS = 300_000;
    const { signal, touch, cancel } = makeIdleTimeout(IDLE_MS);
    const { maxOutputTokens } = await getModelCapabilities(request.model, 'groq');

    let response: Response;
    try {
      response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
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
        const result = await this.complete(request);
        onChunk(result.text);
        return result;
      }
      throw err;
    }

    if (!response.ok) {
      cancel();
      throw new Error(`Groq request failed with status ${response.status}.`);
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
          touch();
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
