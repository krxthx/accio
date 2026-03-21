import Anthropic from "@anthropic-ai/sdk"
import type { LLMClient, LLMGenerateOptions } from "./types.js"
import { LLM_TEMPERATURE, LLM_MAX_TOKENS } from "../config/constants.js"

export class AnthropicLLM implements LLMClient {
  readonly name: string
  readonly supportsParallel = true   // cloud API handles concurrency
  private client: Anthropic
  private model: string

  constructor(opts: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: opts.apiKey })
    this.model = opts.model
    this.name = `anthropic/${opts.model}`
  }

  async generate(prompt: string, opts: LLMGenerateOptions = {}): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? LLM_MAX_TOKENS,
      temperature: opts.temperature ?? LLM_TEMPERATURE,
      ...(opts.systemPrompt ? { system: opts.systemPrompt } : {}),
      messages: [{ role: "user", content: prompt }],
    })

    const block = res.content[0]
    return block.type === "text" ? block.text : ""
  }
}
