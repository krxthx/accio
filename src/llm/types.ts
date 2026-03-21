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
