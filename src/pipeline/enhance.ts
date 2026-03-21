import type { Article } from "../models/article.js"
import type { LLMClient } from "../llm/types.js"
import type { DateRange } from "../utils/dates.js"
import { ENHANCE_SYSTEM, enhanceUserPrompt } from "../config/prompts/enhance.js"
import { ENHANCE_BATCH_SIZE } from "../config/constants.js"
import { chunk, extractJSON } from "../utils/parsing.js"
import { inRange, parseDate, formatDate } from "../utils/dates.js"
import { logger } from "../utils/log.js"

interface EnhanceDecision {
  id: string
  keep: boolean
  cleanedTitle?: string
  publishedDate?: string | null
  reason?: string
}

async function processBatch(
  batch: Article[],
  llm: LLMClient,
  dateRange: DateRange
): Promise<EnhanceDecision[]> {
  const input = batch.map(a => ({
    id: a.id,
    title: a.title,
    url: a.url,
    snippet: a.rawSnippet,
  }))

  const rangeFmt = { from: formatDate(dateRange.from), to: formatDate(dateRange.to) }
  const prompt = enhanceUserPrompt(input, rangeFmt)
  const raw = await llm.generate(prompt, { systemPrompt: ENHANCE_SYSTEM })

  try {
    return extractJSON<EnhanceDecision[]>(raw)
  } catch {
    // If JSON parsing fails, fall back to keeping all with original titles
    logger.warn("enhance", "JSON parse failed on batch, keeping all as fallback")
    return batch.map(a => ({ id: a.id, keep: true }))
  }
}

export async function enhance(articles: Article[], llm: LLMClient, range: DateRange): Promise<Article[]> {
  logger.step("enhance", `Quality filtering ${articles.length} articles (batch=${ENHANCE_BATCH_SIZE})…`)

  const batches = chunk(articles, ENHANCE_BATCH_SIZE)
  let kept = 0
  let rejected = 0
  let dateRejected = 0
  const result: Article[] = []

  // Sequential batches — correct for local LLM (GPU serializes parallel calls anyway)
  // For cloud LLM (supportsParallel=true), we could Promise.all here
  const processAll = llm.supportsParallel
    ? () => Promise.all(batches.map(b => processBatch(b, llm, range)))
    : async () => {
        const decisions: EnhanceDecision[][] = []
        for (const batch of batches) {
          decisions.push(await processBatch(batch, llm, range))
        }
        return decisions
      }

  const allDecisions = await processAll()
  const decisionMap = new Map<string, EnhanceDecision>()
  allDecisions.flat().forEach(d => decisionMap.set(d.id, d))

  for (const article of articles) {
    const decision = decisionMap.get(article.id)
    if (!decision || decision.keep === false) {
      logger.debug("enhance", `REJECT ${article.title.slice(0, 60)}`, decision?.reason)
      rejected++
      continue
    }

    // If LLM extracted a date, use it to filter stale articles and update the article timestamp
    const extractedDate = parseDate(decision.publishedDate ?? null)
    if (extractedDate) {
      if (!inRange(extractedDate, range)) {
        logger.debug("enhance", `REJECT (stale date ${formatDate(extractedDate)}) ${article.title.slice(0, 60)}`)
        dateRejected++
        rejected++
        continue
      }
      // Valid in-range date — update the article
      result.push({
        ...article,
        cleanedTitle: decision.cleanedTitle ?? null,
        timestamp: extractedDate,
        timestampVerified: true,
      })
    } else {
      result.push({
        ...article,
        cleanedTitle: decision.cleanedTitle ?? null,
      })
    }
    kept++
  }

  logger.stat("Kept", kept)
  logger.stat("Rejected", rejected)
  if (dateRejected > 0) logger.stat("Rejected (stale date)", dateRejected)

  return result
}
