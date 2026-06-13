export type LocalAgentProviderId = "off" | "ollama" | "openai_compatible";

export interface AgentStatus {
  provider: LocalAgentProviderId;
  ready: boolean;
  model?: string;
  message?: string;
  accelerator?: "cuda" | "cpu" | "none";
  gpuVramGiB?: number;
}

export interface LlmProvider {
  readonly providerId: Exclude<LocalAgentProviderId, "off">;
  readonly model: string;
  checkHealth(): Promise<AgentStatus>;
  complete(prompt: string): Promise<string>;
}

export class LlmProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmProviderError";
  }
}
