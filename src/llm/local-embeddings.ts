import type { EmbeddingClient } from "./types.js"
import { logger } from "../utils/log.js"

const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2"

/**
 * In-process embeddings via @huggingface/transformers (ONNX runtime).
 * Downloads the model once to ~/.cache/huggingface, no server required.
 */
export class LocalEmbeddings implements EmbeddingClient {
  private model: string
  private pipe: any = null

  constructor(model = DEFAULT_MODEL) {
    this.model = model
  }

  private async getPipeline() {
    if (this.pipe) return this.pipe
    logger.debug("embeddings", `Loading local model ${this.model}…`)
    const { pipeline } = await import("@huggingface/transformers")
    this.pipe = await pipeline("feature-extraction", this.model, { dtype: "fp32" })
    logger.debug("embeddings", "Model ready")
    return this.pipe
  }

  async embed(texts: string[]): Promise<number[][]> {
    const pipe = await this.getPipeline()
    const output = await pipe(texts, { pooling: "mean", normalize: true })
    // output.tolist() returns number[][] directly
    return output.tolist() as number[][]
  }
}
