import OpenAI from "openai"
import type { LLMClient, LLMGenerateOptions, EmbeddingClient } from "./types.js"
import { LLM_TEMPERATURE, LLM_MAX_TOKENS } from "../config/constants.js"

function stripThinking(content: string): string {
  // Strip <think>...</think> blocks (Qwen3, DeepSeek-R1, etc.)
  content = content.replace(/<think>[\s\S]*?<\/think>/g, "")
  if (content.includes("</think>")) {
    content = content.split("</think>").pop()!
  }
  return content.trim()
}

// Models whose chat templates don't support a system role
const NO_SYSTEM_ROLE_MODELS = /gemma|gemini/i

export class OpenAICompatLLM implements LLMClient {
  readonly name: string
  readonly supportsParallel: boolean
  private client: OpenAI
  private _model: string
  private _mergeSystemPrompt: boolean
  private _isOllama: boolean

  constructor(opts: {
    baseUrl: string
    apiKey: string
    model: string
    supportsParallel?: boolean
  }) {
    this.client = new OpenAI({ baseURL: opts.baseUrl, apiKey: opts.apiKey })
    this.name = `openai-compat/${opts.model}`
    this.supportsParallel = opts.supportsParallel ?? false
    this._model = opts.model
    this._mergeSystemPrompt = NO_SYSTEM_ROLE_MODELS.test(opts.model)
    // Ollama typically runs on localhost:11434
    this._isOllama = /localhost|127\.0\.0\.1/.test(opts.baseUrl)
  }

  async generate(prompt: string, opts: LLMGenerateOptions = {}): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = []
    if (opts.systemPrompt) {
      if (this._mergeSystemPrompt) {
        // Gemma/Gemini: no system role — prepend to user message
        messages.push({ role: "user", content: `${opts.systemPrompt}\n\n${prompt}` })
      } else {
        messages.push({ role: "system", content: opts.systemPrompt })
        messages.push({ role: "user", content: prompt })
      }
    } else {
      messages.push({ role: "user", content: prompt })
    }

    const body: Record<string, unknown> = {
      model: this._model,
      messages,
      temperature: opts.temperature ?? LLM_TEMPERATURE,
      max_tokens: opts.maxTokens ?? LLM_MAX_TOKENS,
      // Ollama-specific: expand context window beyond its 2048 default
      ...(this._isOllama ? { options: { num_ctx: 8192 } } : {}),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (this.client.chat.completions.create as any)(body)

    const content = res.choices[0]?.message?.content ?? ""
    return stripThinking(content)
  }
}

export class OpenAICompatEmbeddings implements EmbeddingClient {
  private client: OpenAI
  private model: string

  constructor(opts: { baseUrl: string; apiKey: string; model: string }) {
    this.client = new OpenAI({ baseURL: opts.baseUrl, apiKey: opts.apiKey })
    this.model = opts.model
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    })
    // Sort by index to maintain order
    return res.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding)
  }
}
