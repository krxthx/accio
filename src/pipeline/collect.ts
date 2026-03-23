import type { Article } from "../models/article.js"
import type { FetchFailure } from "../models/digest.js"
import type { Source } from "../sources/base.js"
import type { LLMClient } from "../llm/types.js"
import type { DateRange } from "../utils/dates.js"
import { isToolCallingClient } from "../llm/types.js"
import { RSSSource } from "../sources/rss.js"
import { HackerNewsSource } from "../sources/hackernews.js"
import { RedditSource } from "../sources/reddit.js"
import { GitHubSource } from "../sources/github.js"
import { PlaywrightSource } from "../sources/playwright.js"
import {
  RSS_SOURCES, HN_SOURCE, REDDIT_SOURCE, GITHUB_SOURCE, PLAYWRIGHT_SOURCES,
} from "../config/sources.js"
import { inRange } from "../utils/dates.js"
import { agentCollect } from "./collect-agent.js"
import { logger } from "../utils/log.js"

export interface CollectResult {
  articles: Article[]
  failures: FetchFailure[]
}

/** Sources that always run regardless of agent mode (feeds/scrapers, not query-based). */
function buildStaticSources(): Source[] {
  return [
    ...RSS_SOURCES.map(cfg => new RSSSource(cfg)),
    new RedditSource(REDDIT_SOURCE),
    ...PLAYWRIGHT_SOURCES.map(cfg => new PlaywrightSource(cfg)),
  ]
}

/** Fallback query-based sources used when no tool-calling LLM is available. */
function buildQuerySources(): Source[] {
  return [
    new HackerNewsSource(HN_SOURCE),
    new GitHubSource(GITHUB_SOURCE),
  ]
}

export async function collect(range: DateRange, llm: LLMClient): Promise<CollectResult> {
  const useAgent = isToolCallingClient(llm)

  const staticSources = buildStaticSources()
  const querySources  = useAgent ? [] : buildQuerySources()
  const allSources    = [...staticSources, ...querySources]

  logger.step("collect", `Fetching ${allSources.length} sources in parallel${useAgent ? " + agent queries" : ""}…`)

  // Static sources + agent fire simultaneously
  const [sourceResults, agentArticles] = await Promise.all([
    Promise.allSettled(
      allSources.map(source =>
        source.fetch(range).then(result => ({ source, result }))
      )
    ),
    useAgent ? agentCollect(llm, range) : Promise.resolve([] as Article[]),
  ])

  const seen = new Set<string>()
  const articles: Article[] = []
  const failures: FetchFailure[] = []

  // Process static/query source results
  for (const settled of sourceResults) {
    if (settled.status === "rejected") {
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
      if (!inRange(article.timestamp, range)) continue
      articles.push(article)
      kept++
    }

    logger.info("collect", source.name, `${kept} articles`)
  }

  // Merge agent articles (already date-filtered)
  let agentKept = 0
  for (const article of agentArticles) {
    if (seen.has(article.url)) continue
    seen.add(article.url)
    articles.push(article)
    agentKept++
  }
  if (agentKept > 0) logger.info("collect", "Agent (HN + GitHub)", `${agentKept} articles`)

  logger.stat("Total collected", articles.length)
  logger.stat("Source failures", failures.length)

  return { articles, failures }
}
