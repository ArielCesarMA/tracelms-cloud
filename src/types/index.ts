export type LLMProviderName = 'OpenAI' | 'Anthropic' | 'Gemini' | 'Groq';

export interface TraceLMSettings {
  llmProvider: LLMProviderName;
  llmModel: string;
  llmApiKey: string;
  jiraUrl: string;
  jiraProjectKey: string;
  jiraEmail: string;
  jiraApiToken: string;
  xrayClientId: string;
  xrayClientSecret: string;
}

export interface LLMRequest {
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  text: string;
  usage?: TokenUsage;
}

export type StreamChunkHandler = (chunk: string) => void;
