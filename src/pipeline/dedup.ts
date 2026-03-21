import type { Article } from "../models/article.js"
import type { EmbeddingClient } from "../llm/types.js"
import { SOURCE_PRIORITY, DEDUP_SIMILARITY_THRESHOLD, DEDUP_EMBED_BATCH_SIZE } from "../config/constants.js"
import { chunk } from "../utils/parsing.js"
import { logger } from "../utils/log.js"

function cosine(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function sourcePriority(sourceKey: string): number {
  const idx = SOURCE_PRIORITY.indexOf(sourceKey)
  return idx === -1 ? SOURCE_PRIORITY.length : idx
}

// Union-Find for grouping duplicates
class UnionFind {
  private parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x])
    return this.parent[x]
  }
  union(x: number, y: number) {
    this.parent[this.find(x)] = this.find(y)
  }
}

export async function dedup(articles: Article[], embeddings: EmbeddingClient): Promise<Article[]> {
  if (articles.length <= 1) return articles

  logger.step("dedup", `Embedding ${articles.length} articles for deduplication…`)

  // Embed title + short snippet for each article
  const texts = articles.map(a =>
    `${a.cleanedTitle ?? a.title} ${(a.rawSnippet ?? "").slice(0, 100)}`
  )

  // Batch embed requests
  const batches = chunk(texts, DEDUP_EMBED_BATCH_SIZE)
  const allVectors: number[][] = []
  for (const batch of batches) {
    const vecs = await embeddings.embed(batch)
    allVectors.push(...vecs)
  }

  // O(n²) cosine similarity — fine for n < 200
  const uf = new UnionFind(articles.length)
  for (let i = 0; i < allVectors.length; i++) {
    for (let j = i + 1; j < allVectors.length; j++) {
      if (cosine(allVectors[i], allVectors[j]) >= DEDUP_SIMILARITY_THRESHOLD) {
        uf.union(i, j)
      }
    }
  }

  // Group by cluster root
  const clusters = new Map<number, number[]>()
  for (let i = 0; i < articles.length; i++) {
    const root = uf.find(i)
    if (!clusters.has(root)) clusters.set(root, [])
    clusters.get(root)!.push(i)
  }

  const result: Article[] = []
  let dedupCount = 0

  for (const [, members] of clusters) {
    if (members.length === 1) {
      result.push(articles[members[0]])
      continue
    }

    // Pick canonical: lowest SOURCE_PRIORITY index wins
    members.sort((a, b) => sourcePriority(articles[a].sourceKey) - sourcePriority(articles[b].sourceKey))
    const canonIdx = members[0]
    const canonical = articles[canonIdx]

    const alsoСoveredBy = members
      .slice(1)
      .map(i => articles[i].url)

    result.push({ ...canonical, "alsoСoveredBy": alsoСoveredBy })
    dedupCount += members.length - 1
    logger.debug("dedup", `Merged ${members.length} → "${(canonical.cleanedTitle ?? canonical.title).slice(0, 50)}"`)
  }

  logger.stat("After dedup", result.length, `removed ${dedupCount} duplicates`)
  return result
}
