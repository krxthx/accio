export interface LLMGenerateOptions {
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
}

export interface LLMClient {
  /** Provider + model identifier for logging */
  readonly name: string

  /**
   * Whether this provider supports true parallel requests.
   * False for local Ollama (GPU serializes). True for cloud APIs.
   */
  readonly supportsParallel: boolean

  generate(prompt: string, opts?: LLMGenerateOptions): Promise<string>
}

export interface EmbeddingClient {
  /** Embed a batch of texts, returns array of float vectors */
  embed(texts: string[]): Promise<number[][]>
}

// ── Tool calling ──────────────────────────────────────────────────────────────

export interface ToolDef {
  name: string
  description: string
  /** JSON Schema for the tool's input object */
  inputSchema: Record<string, unknown>
}

export interface ToolCallingClient extends LLMClient {
  readonly supportsToolCalling: true

  /**
   * Run an agentic loop: the model can call tools repeatedly until it returns
   * plain text. `handleToolCall` is invoked for each tool call; return a string
   * result that gets fed back to the model.
   */
  runAgentLoop(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDef[],
    handleToolCall: (toolName: string, toolInput: unknown) => Promise<string>,
    opts?: { maxTurns?: number } & LLMGenerateOptions
  ): Promise<string>
}

export function isToolCallingClient(llm: LLMClient): llm is ToolCallingClient {
  return (llm as ToolCallingClient).supportsToolCalling === true
}
