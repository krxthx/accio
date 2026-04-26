import type { Article } from "../models/article.js"
import type { LLMClient } from "../llm/types.js"
import { isToolCallingClient } from "../llm/types.js"
import type { DateRange } from "../utils/dates.js"
import { ENHANCE_SYSTEM, enhanceUserPrompt } from "../config/prompts/enhance.js"
import { ENHANCE_BATCH_SIZE } from "../config/constants.js"
import { chunk, extractJSON } from "../utils/parsing.js"
import { inRange, parseDate, formatDate } from "../utils/dates.js"
import { fetchArticleContent } from "../utils/fetch-content.js"
import { logger } from "../utils/log.js"

interface EnhanceDecision {
  id: string
  keep: boolean
  cleanedTitle?: string
  publishedDate?: string | null
  reason?: string
}

const FETCH_ARTICLE_TOOL = {
  name: "fetch_article",
  description: "Fetch the full text content of an article URL when the title/snippet is ambiguous and you need more context to make a confident keep/reject decision.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The article URL to fetch" },
    },
    required: ["url"],
  },
}

async function processBatchAgentic(
  batch: Article[],
  llm: import("../llm/types.js").ToolCallingClient,
  dateRange: DateRange
): Promise<EnhanceDecision[]> {
  const toolLLM = llm

  const input = batch.map(a => ({
    id: a.id,
    title: a.title,
    url: a.url,
    snippet: a.rawSnippet?.slice(0, 200) ?? null,
  }))

  const rangeFmt = { from: formatDate(dateRange.from), to: formatDate(dateRange.to) }
  const userMessage = enhanceUserPrompt(input, rangeFmt)

  const raw = await toolLLM.runAgentLoop(
    ENHANCE_SYSTEM,
    userMessage,
    [FETCH_ARTICLE_TOOL],
    async (_toolName, toolInput) => {
      const { url } = toolInput as { url: string }
      logger.debug("enhance", `fetch_article ${url}`)
      const content = await fetchArticleContent(url)
      return content ?? "Could not fetch content for this URL."
    },
    { maxTurns: 12 }
  )

  try {
    return extractJSON<EnhanceDecision[]>(raw)
  } catch {
    logger.warn("enhance", "JSON parse failed on agentic batch, keeping all as fallback")
    return batch.map(a => ({ id: a.id, keep: true }))
  }
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
    logger.warn("enhance", "JSON parse failed on batch, keeping all as fallback")
    return batch.map(a => ({ id: a.id, keep: true }))
  }
}

export async function enhance(articles: Article[], llm: LLMClient, range: DateRange): Promise<Article[]> {
  const agentic = isToolCallingClient(llm)
  logger.step("enhance", `Quality filtering ${articles.length} articles (batch=${ENHANCE_BATCH_SIZE}, agentic=${agentic})...`)

  const batches = chunk(articles, ENHANCE_BATCH_SIZE)
  let kept = 0
  let rejected = 0
  let dateRejected = 0
  const result: Article[] = []

  const runBatch = (batch: Article[]) =>
    agentic
      ? processBatchAgentic(batch, llm as import("../llm/types.js").ToolCallingClient, range)
      : processBatch(batch, llm, range)

  const processAll = llm.supportsParallel
    ? () => Promise.all(batches.map(runBatch))
    : async () => {
        const decisions: EnhanceDecision[][] = []
        for (const batch of batches) decisions.push(await runBatch(batch))
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

    const extractedDate = parseDate(decision.publishedDate ?? null)
    if (extractedDate) {
      if (!inRange(extractedDate, range)) {
        logger.debug("enhance", `REJECT (stale date ${formatDate(extractedDate)}) ${article.title.slice(0, 60)}`)
        dateRejected++
        rejected++
        continue
      }
      result.push({ ...article, cleanedTitle: decision.cleanedTitle ?? null, timestamp: extractedDate, timestampVerified: true })
    } else {
      result.push({ ...article, cleanedTitle: decision.cleanedTitle ?? null })
    }
    kept++
  }

  logger.stat("Kept", kept)
  logger.stat("Rejected", rejected)
  if (dateRejected > 0) logger.stat("Rejected (stale date)", dateRejected)

  return result
}
