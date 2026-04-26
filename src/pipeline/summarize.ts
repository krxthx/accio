import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom"
import type { Article } from "../models/article.js"
import type { LLMClient } from "../llm/types.js"
import { SUMMARIZE_SYSTEM, summarizeUserPrompt } from "../config/prompts/summarize.js"
import { SUMMARIZE_BATCH_SIZE, HTTP_TIMEOUT_MS } from "../config/constants.js"
import { chunk, extractJSON, truncate } from "../utils/parsing.js"
import { logger } from "../utils/log.js"

async function fetchFullContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AccioAI/2.0)" },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const html = await res.text()
    const { document } = parseHTML(html)
    const reader = new Readability(document as unknown as Document)
    const parsed = reader.parse()
    return parsed?.textContent?.replace(/\s+/g, " ").trim() ?? null
  } catch {
    return null
  }
}

interface SummaryResult {
  id: string
  summary: string
}

async function summarizeBatch(batch: Article[], llm: LLMClient): Promise<SummaryResult[]> {
  // Fetch full content for articles with thin snippets
  const enriched = await Promise.all(
    batch.map(async (a) => {
      let content = a.fullContent ?? a.rawSnippet
      if (!content || content.length < 200) {
        const full = await fetchFullContent(a.url)
        // Only use fetched content if it looks like real article text (not nav/redirect)
        if (full && full.length >= 150) content = truncate(full, 2000)
      }
      return {
        id: a.id,
        title: a.cleanedTitle ?? a.title,
        url: a.url,
        content: content ? truncate(content, 1500) : null,
      }
    })
  )

  const raw = await llm.generate(summarizeUserPrompt(enriched), { systemPrompt: SUMMARIZE_SYSTEM })
  try {
    return extractJSON<SummaryResult[]>(raw)
  } catch {
    logger.warn("summarize", "JSON parse failed for batch, using snippet as fallback")
    return batch.map(a => ({
      id: a.id,
      summary: a.rawSnippet ?? a.title,
    }))
  }
}

export async function summarize(articles: Article[], llm: LLMClient): Promise<Article[]> {
  logger.step("summarize", `Summarizing ${articles.length} articles (batch=${SUMMARIZE_BATCH_SIZE})...`)

  const batches = chunk(articles, SUMMARIZE_BATCH_SIZE)
  const summaryMap = new Map<string, string>()

  // Sequential for local LLM, parallel for cloud
  if (llm.supportsParallel) {
    const allResults = await Promise.all(batches.map(b => summarizeBatch(b, llm)))
    allResults.flat().forEach(r => summaryMap.set(r.id, r.summary))
  } else {
    for (const batch of batches) {
      const results = await summarizeBatch(batch, llm)
      results.forEach(r => summaryMap.set(r.id, r.summary))
    }
  }

  return articles.map(a => ({
    ...a,
    summary: summaryMap.get(a.id) ?? a.rawSnippet ?? null,
  }))
}
