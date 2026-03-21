import type { Article } from "../models/article.js"
import type { FetchFailure } from "../models/digest.js"
import type { Source } from "../sources/base.js"
import type { DateRange } from "../utils/dates.js"
import { RSSSource } from "../sources/rss.js"
import { HackerNewsSource } from "../sources/hackernews.js"
import { RedditSource } from "../sources/reddit.js"
// import { LangSearchSource } from "../sources/langsearch.js"  // disabled for dev runs
import { GitHubSource } from "../sources/github.js"
import { PlaywrightSource } from "../sources/playwright.js"
import {
  RSS_SOURCES, HN_SOURCE, REDDIT_SOURCE, GITHUB_SOURCE, PLAYWRIGHT_SOURCES,
} from "../config/sources.js"
import { inRange } from "../utils/dates.js"
import { logger } from "../utils/log.js"

export interface CollectResult {
  articles: Article[]
  failures: FetchFailure[]
}

function buildSources(): Source[] {
  const sources: Source[] = [
    ...RSS_SOURCES.map(cfg => new RSSSource(cfg)),
    new HackerNewsSource(HN_SOURCE),
    new RedditSource(REDDIT_SOURCE),
    // new LangSearchSource(LANGSEARCH_SOURCE),  // disabled for dev runs
    new GitHubSource(GITHUB_SOURCE),
    ...PLAYWRIGHT_SOURCES.map(cfg => new PlaywrightSource(cfg)),
  ]
  return sources
}

export async function collect(range: DateRange): Promise<CollectResult> {
  const sources = buildSources()
  logger.step("collect", `Fetching ${sources.length} sources in parallel…`)

  // All sources fire simultaneously — the big parallelism win
  const results = await Promise.allSettled(
    sources.map(source =>
      source.fetch(range).then(result => ({ source, result }))
    )
  )

  const seen = new Set<string>()
  const articles: Article[] = []
  const failures: FetchFailure[] = []

  for (const settled of results) {
    if (settled.status === "rejected") {
      // Shouldn't happen since fetch() catches internally, but just in case
      logger.warn("collect", "Source threw unexpectedly", String(settled.reason))
      continue
    }

    const { source, result } = settled.value

    if (result.error) {
      logger.warn("collect", source.name, result.error)
      failures.push({ sourceKey: source.key, sourceName: source.name, error: result.error })
    }

    let kept = 0
    for (const article of result.articles) {
      if (seen.has(article.url)) continue
      seen.add(article.url)

      // Final date guard — each source already filters but this is the authoritative check
      if (!inRange(article.timestamp, range)) continue

      articles.push(article)
      kept++
    }

    logger.info("collect", source.name, `${kept} articles`)
  }

  logger.stat("Total collected", articles.length)
  logger.stat("Source failures", failures.length)

  return { articles, failures }
}
