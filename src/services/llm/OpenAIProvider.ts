import { LLMRequest, LLMResponse, StreamChunkHandler } from '../../types';
import { LLMProvider } from './LLMProvider';
import { estimateTimeoutMs } from './timeoutUtil';
import { makeIdleTimeout } from '../../utils/idleTimeout';

export class OpenAIProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is missing.');
    }

    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    const timeoutMs = estimateTimeoutMs(prompt, request.model, 'openai');

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
    };

    const text = data.choices?.[0]?.message?.content ?? '';
    return { text };
  }

  public async stream(request: LLMRequest, onChunk: StreamChunkHandler): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('OpenAI API key is missing.');

    // Option 2 — idle timeout: only abort if no chunk arrives for IDLE_MS.
    const IDLE_MS = 300_000;
    const { signal, touch, cancel } = makeIdleTimeout(IDLE_MS);

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
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
          touch(); // reset idle window
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Option 3 — idle timeout mid-stream: return partial content if available
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
