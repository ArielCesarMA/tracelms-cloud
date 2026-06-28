import { LLMRequest, LLMResponse, StreamChunkHandler } from '../../types';

export interface LLMProvider {
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest, onChunk: StreamChunkHandler): Promise<LLMResponse>;
  completeVision?(imageBase64: string, mimeType: string, systemPrompt: string): Promise<LLMResponse>;
}
