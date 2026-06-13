import {
  type LocalAgentEnv,
  readLocalAgentEnv,
  resolveLocalAgentMode,
  resolveOllamaBaseUrl,
} from "./env.js";
import { OllamaProvider } from "./providers/ollamaProvider.js";
import { OpenAiCompatibleProvider } from "./providers/openAiCompatibleProvider.js";
import type { AgentStatus, LlmProvider } from "./types.js";

export interface CreateProviderOptions {
  env?: LocalAgentEnv;
  fetchImpl?: typeof fetch;
}

async function tryOllama(
  env: LocalAgentEnv,
  fetchImpl?: typeof fetch,
): Promise<{
  provider: LlmProvider | null;
  status: AgentStatus;
}> {
  const ollama = new OllamaProvider({
    baseUrl: resolveOllamaBaseUrl(env),
    model: env.ollamaModel,
    timeoutMs: env.timeoutMs,
    fetchImpl,
  });
  const status = await ollama.checkHealth();
  return { provider: status.ready ? ollama : null, status };
}

async function tryOpenAiCompatible(
  env: LocalAgentEnv,
  fetchImpl?: typeof fetch,
): Promise<{
  provider: LlmProvider | null;
  status: AgentStatus;
}> {
  if (!env.openAiCompatibleUrl || !env.openAiCompatibleModel) {
    return {
      provider: null,
      status: {
        provider: "openai_compatible",
        ready: false,
        message: "TPC_OPENAI_COMPATIBLE_URL と TPC_OPENAI_COMPATIBLE_MODEL を設定してください",
      },
    };
  }
  const openAi = new OpenAiCompatibleProvider({
    baseUrl: env.openAiCompatibleUrl,
    model: env.openAiCompatibleModel,
    timeoutMs: env.timeoutMs,
    fetchImpl,
  });
  const status = await openAi.checkHealth();
  return { provider: status.ready ? openAi : null, status };
}

export async function createLlmProvider(options: CreateProviderOptions = {}): Promise<{
  provider: LlmProvider | null;
  status: AgentStatus;
}> {
  const env = options.env ?? readLocalAgentEnv();
  const fetchImpl = options.fetchImpl;

  if (env.mode === "off") {
    return {
      provider: null,
      status: {
        provider: "off",
        ready: false,
        message: "TPC_LOCAL_AGENT=off のため無効です",
      },
    };
  }

  if (env.mode === "openai_compatible") {
    const result = await tryOpenAiCompatible(env, fetchImpl);
    return { provider: result.provider, status: result.status };
  }

  if (env.mode === "ollama") {
    const result = await tryOllama(env, fetchImpl);
    return { provider: result.provider, status: result.status };
  }

  // auto: Ollama を優先
  const ollamaResult = await tryOllama(env, fetchImpl);
  if (ollamaResult.provider) {
    return { provider: ollamaResult.provider, status: ollamaResult.status };
  }

  return {
    provider: null,
    status: {
      provider: "off",
      ready: false,
      message:
        ollamaResult.status.message ??
        "ローカル LLM が利用できません。Ollama の起動とモデル取得を確認してください。",
    },
  };
}

export { resolveLocalAgentMode };
