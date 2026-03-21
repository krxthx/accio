import type { Source, FetchResult } from "./base.js"
import type { Article } from "../models/article.js"
import type { DateRange } from "../utils/dates.js"
import type { RedditSourceConfig } from "../config/sources.js"
import { makeArticleId } from "../models/article.js"
import { inRange } from "../utils/dates.js"
import { isValidArticleUrl, normalizeUrl } from "../utils/urls.js"
import { truncate } from "../utils/parsing.js"
import { REDDIT_FETCH_LIMIT, REDDIT_MIN_SCORE, HTTP_TIMEOUT_MS } from "../config/constants.js"

const REDDIT_BASE = "https://www.reddit.com"
const USER_AGENT = "Mozilla/5.0 (compatible; AccioAIBot/2.0)"

interface RedditPost {
  data: {
    id: string
    title: string
    url: string
    permalink: string
    selftext?: string
    score: number
    created_utc: number
    is_self: boolean
    domain: string
  }
}

export class RedditSource implements Source {
  readonly key: string
  readonly name: string
  private subreddits: string[]

  constructor(cfg: RedditSourceConfig) {
    this.key = cfg.key
    this.name = cfg.name
    this.subreddits = cfg.subreddits
  }

  async fetch(range: DateRange): Promise<FetchResult> {
    const articles: Article[] = []
    const seen = new Set<string>()
    const errors: string[] = []

    await Promise.all(
      this.subreddits.map(async (sub) => {
        try {
          const res = await fetch(
            `${REDDIT_BASE}/r/${sub}/hot.json?limit=${REDDIT_FETCH_LIMIT}`,
            {
              headers: { "User-Agent": USER_AGENT },
              signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
            }
          )
          if (!res.ok) throw new Error(`HTTP ${res.status}`)

          const data = await res.json() as { data: { children: RedditPost[] } }

          for (const child of data.data.children) {
            const post = child.data
            if (post.score < REDDIT_MIN_SCORE) continue

            const timestamp = new Date(post.created_utc * 1000)
            if (!inRange(timestamp, range)) continue

            // Use the linked URL if it's not a self-post, else use permalink
            const rawUrl = post.is_self
              ? `${REDDIT_BASE}${post.permalink}`
              : post.url
            const url = normalizeUrl(rawUrl)

            if (!isValidArticleUrl(url) || seen.has(url)) continue
            seen.add(url)

            const snippet = post.is_self && post.selftext
              ? truncate(post.selftext, 400)
              : null

            articles.push({
              id: makeArticleId(url),
              title: post.title.trim(),
              url,
              sourceKey: this.key,
              sourceName: `Reddit r/${sub}`,
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
          errors.push(`Reddit r/${sub}: ${String(err)}`)
        }
      })
    )

    return {
      articles,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    }
  }
}
