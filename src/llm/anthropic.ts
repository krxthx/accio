import Anthropic from "@anthropic-ai/sdk"
import type { LLMClient, LLMGenerateOptions, ToolDef, ToolCallingClient } from "./types.js"
import { LLM_TEMPERATURE, LLM_MAX_TOKENS } from "../config/constants.js"

export class AnthropicLLM implements LLMClient, ToolCallingClient {
  readonly name: string
  readonly supportsParallel = true   // cloud API handles concurrency
  readonly supportsToolCalling = true as const
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

  async runAgentLoop(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDef[],
    handleToolCall: (toolName: string, toolInput: unknown) => Promise<string>,
    opts: { maxTurns?: number } & LLMGenerateOptions = {}
  ): Promise<string> {
    const maxTurns = opts.maxTurns ?? 10
    const anthropicTools: Anthropic.Tool[] = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }))

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userMessage },
    ]

    for (let turn = 0; turn < maxTurns; turn++) {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: opts.maxTokens ?? LLM_MAX_TOKENS,
        temperature: opts.temperature ?? LLM_TEMPERATURE,
        system: systemPrompt,
        tools: anthropicTools,
        messages,
      })

      messages.push({ role: "assistant", content: res.content })

      if (res.stop_reason === "end_turn") {
        const textBlock = res.content.find(b => b.type === "text")
        return textBlock?.type === "text" ? textBlock.text : ""
      }

      if (res.stop_reason === "tool_use") {
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const block of res.content) {
          if (block.type === "tool_use") {
            const result = await handleToolCall(block.name, block.input)
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result })
          }
        }
        messages.push({ role: "user", content: toolResults })
      }
    }

    throw new Error(`Agent loop exceeded ${maxTurns} turns`)
  }
}
