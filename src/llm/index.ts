import "dotenv/config"
import type { LLMClient, EmbeddingClient } from "./types.js"
import { OpenAICompatLLM, OpenAICompatEmbeddings } from "./openai-compat.js"
import { AnthropicLLM } from "./anthropic.js"
import { LocalEmbeddings } from "./local-embeddings.js"

export type { LLMClient, EmbeddingClient }

export function getLLM(): LLMClient {
  const provider = process.env.LLM_PROVIDER ?? "openai-compat"

  if (provider === "openai-compat") {
    const baseUrl = process.env.OPENAI_COMPAT_BASE_URL
    const apiKey  = process.env.OPENAI_COMPAT_API_KEY ?? "none"
    const model   = process.env.OPENAI_COMPAT_MODEL

    if (!baseUrl) throw new Error("OPENAI_COMPAT_BASE_URL is required for provider=openai-compat")
    if (!model)   throw new Error("OPENAI_COMPAT_MODEL is required for provider=openai-compat")

    const workers = parseInt(process.env.LLM_PARALLEL_WORKERS ?? "1", 10)
    return new OpenAICompatLLM({
      baseUrl,
      apiKey,
      model,
      supportsParallel: workers > 1,
    })
  }

  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY
    const model  = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001"
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for provider=anthropic")
    return new AnthropicLLM({ apiKey, model })
  }

  throw new Error(`Unknown LLM_PROVIDER: "${provider}". Valid options: openai-compat | anthropic`)
}

export function getEmbeddings(): EmbeddingClient {
  const provider = process.env.EMBED_PROVIDER ?? "local"

  if (provider === "openai-compat") {
    // Explicit opt-in: use Ollama or any OpenAI-compat embeddings endpoint
    const baseUrl = process.env.EMBED_BASE_URL ?? process.env.OPENAI_COMPAT_BASE_URL
    const apiKey  = process.env.EMBED_API_KEY  ?? process.env.OPENAI_COMPAT_API_KEY ?? "none"
    const model   = process.env.EMBED_MODEL    ?? "nomic-embed-text"
    if (!baseUrl) throw new Error("EMBED_BASE_URL is required when EMBED_PROVIDER=openai-compat")
    return new OpenAICompatEmbeddings({ baseUrl, apiKey, model })
  }

  // Default: in-process ONNX via @huggingface/transformers — no server needed
  const model = process.env.EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2"
  return new LocalEmbeddings(model)
}
