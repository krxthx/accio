import { z } from "zod"

export const ArticleSchema = z.object({
  id: z.string(),                                          // hash of URL
  title: z.string(),
  url: z.string(),
  sourceKey: z.string(),                                   // e.g. "hackernews", "openai_rss"
  sourceName: z.string(),                                  // human label
  timestamp: z.date().nullable().default(null),
  timestampVerified: z.boolean().default(false),           // came from RSS pubDate / API created_at
  rawSnippet: z.string().nullable().default(null),
  fullContent: z.string().nullable().default(null),
  summary: z.string().nullable().default(null),            // LLM-generated
  cleanedTitle: z.string().nullable().default(null),       // LLM-cleaned
  importanceScore: z.number().int().min(1).max(5).nullable().default(null),
  importanceJustification: z.string().nullable().default(null),
  section: z.enum(["A", "B", "C", "D", "E"]).nullable().default(null),
  duplicateOf: z.string().nullable().default(null),        // ID of canonical article
  alsoСoveredBy: z.array(z.string()).default([]),          // URLs of near-duplicates
  fetchError: z.string().nullable().default(null),
})

export type Article = z.infer<typeof ArticleSchema>

export function makeArticleId(url: string): string {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = (Math.imul(31, hash) + url.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

export function displayTitle(article: Article): string {
  return article.cleanedTitle ?? article.title
}
