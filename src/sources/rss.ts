import Parser from "rss-parser"
import type { Source, FetchResult } from "./base.js"
import type { Article } from "../models/article.js"
import type { DateRange } from "../utils/dates.js"
import type { RSSSourceConfig } from "../config/sources.js"
import { makeArticleId } from "../models/article.js"
import { inRange, parseDate } from "../utils/dates.js"
import { isValidArticleUrl, normalizeUrl } from "../utils/urls.js"
import { truncate } from "../utils/parsing.js"
import { RSS_FETCH_TIMEOUT_MS } from "../config/constants.js"

const parser = new Parser({ timeout: RSS_FETCH_TIMEOUT_MS })

export class RSSSource implements Source {
  readonly key: string
  readonly name: string
  private feedUrl: string

  constructor(cfg: RSSSourceConfig) {
    this.key = cfg.key
    this.name = cfg.name
    this.feedUrl = cfg.url
  }

  async fetch(range: DateRange): Promise<FetchResult> {
    let feed: Awaited<ReturnType<typeof parser.parseURL>>
    try {
      feed = await parser.parseURL(this.feedUrl)
    } catch (err) {
      return { articles: [], error: String(err) }
    }

    const articles: Article[] = []

    for (const item of feed.items) {
      const url = normalizeUrl(item.link ?? item.guid ?? "")
      if (!url || !isValidArticleUrl(url)) continue

      const timestamp = parseDate(item.pubDate ?? item.isoDate ?? null)
      if (!inRange(timestamp, range)) continue

      const snippet = item.contentSnippet ?? item.content ?? null

      articles.push({
        id: makeArticleId(url),
        title: (item.title ?? "Untitled").trim(),
        url,
        sourceKey: this.key,
        sourceName: this.name,
        timestamp,
        timestampVerified: true,   // RSS pubDate is reliable
        rawSnippet: snippet ? truncate(snippet, 400) : null,
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

    return { articles }
  }
}
