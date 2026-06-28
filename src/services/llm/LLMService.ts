import { LLMProviderName, LLMRequest, LLMResponse, StreamChunkHandler } from '../../types';
import { AnthropicProvider } from './AnthropicProvider';
import { GeminiProvider } from './GeminiProvider';
import { GroqProvider } from './GroqProvider';
import { LLMProvider } from './LLMProvider';
import { OpenAIProvider } from './OpenAIProvider';

export class LLMService {
  private readonly provider: LLMProvider;

  constructor(providerName: LLMProviderName, apiKey: string) {
    this.provider = LLMService.createProvider(providerName, apiKey);
  }

  public complete(request: LLMRequest): Promise<LLMResponse> {
    return this.provider.complete(request);
  }

  public stream(request: LLMRequest, onChunk: StreamChunkHandler): Promise<LLMResponse> {
    return this.provider.stream(request, onChunk);
  }

  public completeVision(imageBase64: string, mimeType: string, systemPrompt: string): Promise<LLMResponse> {
    if (!this.provider.completeVision) {
      return Promise.reject(new Error('The selected LLM provider does not support image analysis. Switch to OpenAI, Anthropic, or Google in LLM Providers settings.'));
    }
    return this.provider.completeVision(imageBase64, mimeType, systemPrompt);
  }

  private static createProvider(providerName: LLMProviderName, apiKey: string): LLMProvider {
    switch (providerName) {
      case 'OpenAI':
        return new OpenAIProvider(apiKey);
      case 'Anthropic':
        return new AnthropicProvider(apiKey);
      case 'Gemini':
        return new GeminiProvider(apiKey);
      case 'Groq':
        return new GroqProvider(apiKey);
      default:
        throw new Error(`Unsupported LLM provider: ${providerName}`);
    }
  }
}
