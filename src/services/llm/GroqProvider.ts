import { LLMRequest, LLMResponse, StreamChunkHandler } from '../../types';
import { LLMProvider } from './LLMProvider';
import { estimateTimeoutMs } from './timeoutUtil';
import { makeIdleTimeout } from '../../utils/idleTimeout';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export class GroqProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('Groq API key is missing.');

    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    const timeoutMs = estimateTimeoutMs(prompt, request.model, 'groq');
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
    };

    return { text: data.choices?.[0]?.message?.content ?? '' };
  }

  public async stream(request: LLMRequest, onChunk: StreamChunkHandler): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('Groq API key is missing.');

    const IDLE_MS = 300_000;
    const { signal, touch, cancel } = makeIdleTimeout(IDLE_MS);

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
          stream: true,
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
    try {
      const { parseSseLines } = await import('../../utils/sseReader');
      for await (const line of parseSseLines(response)) {
        const data = JSON.parse(line) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = data.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onChunk(delta);
          touch();
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
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

    if (!fullText) {
      const result = await this.complete(request);
      onChunk(result.text);
      return result;
    }

    return { text: fullText };
  }
}
