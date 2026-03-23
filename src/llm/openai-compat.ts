import OpenAI from "openai"
import type { LLMClient, LLMGenerateOptions, EmbeddingClient, ToolDef, ToolCallingClient } from "./types.js"
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

export class OpenAICompatLLM implements LLMClient, ToolCallingClient {
  readonly name: string
  readonly supportsParallel: boolean
  readonly supportsToolCalling = true as const
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
    this._isOllama = /localhost|127\.0\.0\.1/.test(opts.baseUrl)
  }

  private buildMessages(
    systemPrompt: string | undefined,
    userMessage: string
  ): OpenAI.ChatCompletionMessageParam[] {
    const messages: OpenAI.ChatCompletionMessageParam[] = []
    if (systemPrompt) {
      if (this._mergeSystemPrompt) {
        messages.push({ role: "user", content: `${systemPrompt}\n\n${userMessage}` })
      } else {
        messages.push({ role: "system", content: systemPrompt })
        messages.push({ role: "user", content: userMessage })
      }
    } else {
      messages.push({ role: "user", content: userMessage })
    }
    return messages
  }

  async generate(prompt: string, opts: LLMGenerateOptions = {}): Promise<string> {
    const messages = this.buildMessages(opts.systemPrompt, prompt)
    const body: Record<string, unknown> = {
      model: this._model,
      messages,
      temperature: opts.temperature ?? LLM_TEMPERATURE,
      max_tokens: opts.maxTokens ?? LLM_MAX_TOKENS,
      ...(this._isOllama ? { options: { num_ctx: 8192 } } : {}),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (this.client.chat.completions.create as any)(body)
    const content = res.choices[0]?.message?.content ?? ""
    return stripThinking(content)
  }

  async runAgentLoop(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDef[],
    handleToolCall: (toolName: string, toolInput: unknown) => Promise<string>,
    opts: { maxTurns?: number } & LLMGenerateOptions = {}
  ): Promise<string> {
    const maxTurns = opts.maxTurns ?? 10
    const openaiTools: OpenAI.ChatCompletionTool[] = tools.map(t => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }))

    const messages: OpenAI.ChatCompletionMessageParam[] = this.buildMessages(systemPrompt, userMessage)

    for (let turn = 0; turn < maxTurns; turn++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (this.client.chat.completions.create as any)({
        model: this._model,
        messages,
        tools: openaiTools,
        tool_choice: "auto",
        temperature: opts.temperature ?? LLM_TEMPERATURE,
        max_tokens: opts.maxTokens ?? LLM_MAX_TOKENS,
        ...(this._isOllama ? { options: { num_ctx: 8192 } } : {}),
      })

      const choice = res.choices[0]
      const message = choice.message
      messages.push(message)

      if (!message.tool_calls?.length) {
        return stripThinking(message.content ?? "")
      }

      for (const toolCall of message.tool_calls) {
        const input = JSON.parse(toolCall.function.arguments)
        const result = await handleToolCall(toolCall.function.name, input)
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: result })
      }
    }

    throw new Error(`Agent loop exceeded ${maxTurns} turns`)
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
