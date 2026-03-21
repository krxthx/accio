import type { Article } from "../models/article.js"
import type { LLMClient } from "../llm/types.js"
import { RANK_SYSTEM, rankUserPrompt } from "../config/prompts/rank.js"
import { MIN_IMPORTANCE_SCORE, RANK_MAX_ARTICLES } from "../config/constants.js"
import { chunk, extractJSON } from "../utils/parsing.js"
import { logger } from "../utils/log.js"

interface RankDecision {
  id: string
  score: number
  justification: string
}

async function rankBatch(batch: Article[], llm: LLMClient): Promise<RankDecision[]> {
  const input = batch.map(a => ({
    id: a.id,
    title: a.cleanedTitle ?? a.title,
    snippet: a.rawSnippet,
  }))

  const raw = await llm.generate(rankUserPrompt(input), { systemPrompt: RANK_SYSTEM })
  try {
    return extractJSON<RankDecision[]>(raw)
  } catch {
    logger.warn("rank", "JSON parse failed, defaulting score=3 for batch")
    return batch.map(a => ({ id: a.id, score: 3, justification: "parse error fallback" }))
  }
}

export async function rank(articles: Article[], llm: LLMClient, verbose = false): Promise<Article[]> {
  logger.step("rank", `Scoring ${articles.length} articles…`)

  // Split into chunks if over cap (single call is faster; cap avoids context overflow)
  const batches = chunk(articles, RANK_MAX_ARTICLES)
  const allDecisions: RankDecision[] = []

  const runBatches = llm.supportsParallel
    ? async () => (await Promise.all(batches.map(b => rankBatch(b, llm)))).flat()
    : async () => {
        const results: RankDecision[] = []
        for (const b of batches) results.push(...await rankBatch(b, llm))
        return results
      }

  allDecisions.push(...await runBatches())

  const scoreMap = new Map(allDecisions.map(d => [d.id, d]))
  const result: Article[] = []

  for (const article of articles) {
    const d = scoreMap.get(article.id)
    const score = d?.score ?? 3

    if (!verbose && score < MIN_IMPORTANCE_SCORE) {
      logger.debug("rank", `SKIP score=${score} "${(article.cleanedTitle ?? article.title).slice(0, 50)}"`)
      continue
    }

    result.push({
      ...article,
      importanceScore: score,
      importanceJustification: d?.justification ?? null,
    })
  }

  // Sort by score descending
  result.sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0))

  logger.stat("In digest", result.length, `min score ${MIN_IMPORTANCE_SCORE}`)
  return result
}
