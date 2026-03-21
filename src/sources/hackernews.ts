import type { Source, FetchResult } from "./base.js"
import type { Article } from "../models/article.js"
import type { DateRange } from "../utils/dates.js"
import type { HNSourceConfig } from "../config/sources.js"
import { makeArticleId } from "../models/article.js"
import { inRange } from "../utils/dates.js"
import { isValidArticleUrl, normalizeUrl } from "../utils/urls.js"
import { truncate } from "../utils/parsing.js"
import { HN_FETCH_LIMIT, HTTP_TIMEOUT_MS } from "../config/constants.js"

const HN_ALGOLIA = "https://hn.algolia.com/api/v1/search_by_date"
const HN_ITEM_BASE = "https://news.ycombinator.com/item?id="

interface HNHit {
  objectID: string
  title?: string
  story_title?: string
  url?: string
  story_url?: string
  story_text?: string
  created_at: string
  points?: number
  num_comments?: number
  author?: string
}

export class HackerNewsSource implements Source {
  readonly key = "hackernews"
  readonly name: string
  private queries: string[]

  constructor(cfg: HNSourceConfig) {
    this.name = cfg.name
    this.queries = cfg.queries
  }

  async fetch(range: DateRange): Promise<FetchResult> {
    const fromTs = Math.floor(range.from.getTime() / 1000)
    const toTs   = Math.floor(range.to.getTime() / 1000)

    // Pick a random subset of queries to avoid being too broad
    const selectedQueries = this.queries
      .sort(() => Math.random() - 0.5)
      .slice(0, 6)

    const seen = new Set<string>()
    const articles: Article[] = []
    const errors: string[] = []

    await Promise.all(
      selectedQueries.map(async (query) => {
        try {
          const params = new URLSearchParams({
            query,
            tags: "story",
            numericFilters: `created_at_i>${fromTs},created_at_i<${toTs},points>5`,
            hitsPerPage: String(HN_FETCH_LIMIT),
          })
          const res = await fetch(`${HN_ALGOLIA}?${params}`, {
            signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
          })
          if (!res.ok) return

          const data = await res.json() as { hits: HNHit[] }

          for (const hit of data.hits) {
            const rawUrl = hit.url ?? hit.story_url ?? `${HN_ITEM_BASE}${hit.objectID}`
            const url = normalizeUrl(rawUrl)
            if (!isValidArticleUrl(url) || seen.has(url)) continue
            seen.add(url)

            const timestamp = new Date(hit.created_at)

            const title = hit.title ?? hit.story_title ?? "Untitled"
            const snippet = hit.story_text
              ? truncate(hit.story_text.replace(/<[^>]+>/g, " ").trim(), 400)
              : null

            articles.push({
              id: makeArticleId(url),
              title: title.trim(),
              url,
              sourceKey: this.key,
              sourceName: this.name,
              timestamp,
              timestampVerified: true,
              rawSnippet: snippet,
              fullContent: null,
              summary: null,
              cleanedTitle: null,
              importanceScore: null,
              importanceJustification: null,
              section: null,
              duplicateOf: null,
              "alsoСoveredBy": [],
              fetchError: null,
            })
          }
        } catch (err) {
          errors.push(`HN query "${query}": ${String(err)}`)
        }
      })
    )

    return {
      articles,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    }
  }
}
