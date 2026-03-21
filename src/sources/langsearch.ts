import type { Source, FetchResult } from "./base.js"
import type { Article } from "../models/article.js"
import type { DateRange } from "../utils/dates.js"
import type { LangSearchSourceConfig } from "../config/sources.js"
import { makeArticleId } from "../models/article.js"
import { isValidArticleUrl, normalizeUrl } from "../utils/urls.js"
import { truncate, sleep } from "../utils/parsing.js"
import { formatDate } from "../utils/dates.js"
import { LANGSEARCH_RESULT_COUNT, HTTP_TIMEOUT_MS } from "../config/constants.js"

const LANGSEARCH_ENDPOINT =
  process.env.LANGSEARCH_ENDPOINT ?? "https://api.langsearch.com/v1/web-search"

interface LangSearchResult {
  name: string
  url: string
  snippet?: string
  datePublished?: string
}

interface LangSearchResponse {
  data?: {
    webPages?: {
      value?: LangSearchResult[]
    }
  }
}

// Rate limit: 1 QPS with a small buffer
let lastCallAt = 0
async function rateLimitedFetch(query: string, apiKey: string): Promise<LangSearchResult[]> {
  const now = Date.now()
  const gap = now - lastCallAt
  if (gap < 1100) await sleep(1100 - gap)
  lastCallAt = Date.now()

  const res = await fetch(LANGSEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, freshness: "oneWeek", count: LANGSEARCH_RESULT_COUNT }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS * 2),
  })

  if (!res.ok) throw new Error(`LangSearch HTTP ${res.status}`)
  const data = await res.json() as LangSearchResponse
  return data?.data?.webPages?.value ?? []
}

export class LangSearchSource implements Source {
  readonly key = "langsearch"
  readonly name: string
  private queries: string[]
  private apiKey: string

  constructor(cfg: LangSearchSourceConfig) {
    this.name = cfg.name
    this.queries = cfg.queries
    this.apiKey = process.env.LANGSEARCH_API_KEY ?? ""
  }

  async fetch(range: DateRange): Promise<FetchResult> {
    if (!this.apiKey) {
      return { articles: [], error: "LANGSEARCH_API_KEY not set — skipping web search" }
    }

    const dateLabel = `${formatDate(range.from)} to ${formatDate(range.to)}`
    const seen = new Set<string>()
    const articles: Article[] = []
    const errors: string[] = []

    // Run queries sequentially to respect rate limit
    for (const queryTemplate of this.queries) {
      const query = `${queryTemplate} ${dateLabel}`
      try {
        const results = await rateLimitedFetch(query, this.apiKey)

        for (const result of results) {
          const url = normalizeUrl(result.url)
          if (!isValidArticleUrl(url) || seen.has(url)) continue
          seen.add(url)

          // LangSearch may return datePublished — use it if present
          const timestamp = result.datePublished ? new Date(result.datePublished) : new Date()
          const timestampVerified = !!result.datePublished

          articles.push({
            id: makeArticleId(url),
            title: (result.name ?? "Untitled").trim(),
            url,
            sourceKey: this.key,
            sourceName: this.name,
            timestamp,
            timestampVerified,
            rawSnippet: result.snippet ? truncate(result.snippet, 400) : null,
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
        errors.push(`LangSearch "${query}": ${String(err)}`)
      }
    }

    return {
      articles,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    }
  }
}
