import type { Article } from "../models/article.js"
import type { LLMClient } from "../llm/types.js"
import { CATEGORIZE_SYSTEM, categorizeUserPrompt } from "../config/prompts/categorize.js"
import { CATEGORIZE_MAX_ARTICLES } from "../config/constants.js"
import { chunk, extractJSON } from "../utils/parsing.js"
import { logger } from "../utils/log.js"

interface CategorizeDecision {
  id: string
  section: "A" | "B" | "C" | "D" | "E"
}

const VALID_SECTIONS = new Set(["A", "B", "C", "D", "E"])

async function categorizeBatch(batch: Article[], llm: LLMClient): Promise<CategorizeDecision[]> {
  const input = batch.map(a => ({
    id: a.id,
    title: a.cleanedTitle ?? a.title,
    summary: a.summary,
  }))

  const raw = await llm.generate(categorizeUserPrompt(input), { systemPrompt: CATEGORIZE_SYSTEM })
  try {
    const parsed = extractJSON<CategorizeDecision[]>(raw)
    return parsed.filter(d => VALID_SECTIONS.has(d.section))
  } catch {
    logger.warn("categorize", "JSON parse failed, defaulting to section E")
    return batch.map(a => ({ id: a.id, section: "E" as const }))
  }
}

export async function categorize(articles: Article[], llm: LLMClient): Promise<Article[]> {
  logger.step("categorize", `Categorizing ${articles.length} articles...`)

  const batches = chunk(articles, CATEGORIZE_MAX_ARTICLES)
  const sectionMap = new Map<string, "A" | "B" | "C" | "D" | "E">()

  if (llm.supportsParallel) {
    const all = await Promise.all(batches.map(b => categorizeBatch(b, llm)))
    all.flat().forEach(d => sectionMap.set(d.id, d.section))
  } else {
    for (const batch of batches) {
      const decisions = await categorizeBatch(batch, llm)
      decisions.forEach(d => sectionMap.set(d.id, d.section))
    }
  }

  return articles.map(a => ({
    ...a,
    section: sectionMap.get(a.id) ?? "E",
  }))
}
