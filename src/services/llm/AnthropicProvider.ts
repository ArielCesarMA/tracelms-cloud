import { LLMRequest, LLMResponse, StreamChunkHandler, TokenUsage } from '../../types';
import { LLMProvider } from './LLMProvider';
import { estimateTimeoutMs } from './timeoutUtil';
import { makeIdleTimeout } from '../../utils/idleTimeout';
import { getModelCapabilities } from './probeModelCapabilities';

export class AnthropicProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key is missing.');
    }

    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    const [timeoutMs, { maxOutputTokens }] = await Promise.all([
      estimateTimeoutMs(prompt, request.model, 'anthropic'),
      getModelCapabilities(request.model, 'anthropic'),
    ]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: maxOutputTokens,
          temperature: request.temperature ?? 0.2,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: request.prompt }]
        }),
        signal: controller.signal
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`Anthropic request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Anthropic request failed with status ${response.status}.`);
    }

    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = data.content?.[0]?.text ?? '';
    const u = data.usage;
    const usage: TokenUsage | undefined = u
      ? { promptTokens: u.input_tokens ?? 0, completionTokens: u.output_tokens ?? 0, totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) }
      : undefined;
    return { text, usage };
  }

  public async completeVision(imageBase64: string, mimeType: string, systemPrompt: string): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('Anthropic API key is missing.');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: (await getModelCapabilities('claude-opus-4-8', 'anthropic')).maxOutputTokens,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: 'Extract all requirements from this image.' },
          ],
        }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic vision request failed with status ${response.status}.`);
    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    return { text: data.content?.[0]?.text ?? '' };
  }

  public async stream(request: LLMRequest, onChunk: StreamChunkHandler): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error('Anthropic API key is missing.');

    // Option 2 — idle timeout: only abort if no chunk arrives for IDLE_MS.
    const IDLE_MS = 300_000;
    const { signal, touch, cancel } = makeIdleTimeout(IDLE_MS);
    const { maxOutputTokens } = await getModelCapabilities(request.model, 'anthropic');

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: maxOutputTokens,
          temperature: request.temperature ?? 0.2,
          stream: true,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: request.prompt }],
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
      throw new Error(`Anthropic request failed with status ${response.status}.`);
    }

    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;
    try {
      const { parseSseLines } = await import('../../utils/sseReader');
      for await (const line of parseSseLines(response)) {
        const data = JSON.parse(line) as {
          type?: string;
          message?: { usage?: { input_tokens?: number } };
          delta?: { type?: string; text?: string };
          usage?: { output_tokens?: number };
        };
        if (data.type === 'message_start' && data.message?.usage) {
          promptTokens = data.message.usage.input_tokens ?? 0;
        }
        if (data.type === 'message_delta' && data.usage) {
          completionTokens = data.usage.output_tokens ?? 0;
        }
        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta' && data.delta.text) {
          fullText += data.delta.text;
          onChunk(data.delta.text);
          touch(); // reset idle window
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Option 3 — idle timeout mid-stream: return partial content if available
        cancel();
        const usage: TokenUsage | undefined = promptTokens ? { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } : undefined;
        if (fullText) return { text: fullText, usage };
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

    const usage: TokenUsage | undefined = promptTokens
      ? { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
      : undefined;
    return { text: fullText, usage };
  }
}
