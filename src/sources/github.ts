import type { Source, FetchResult } from "./base.js"
import type { Article } from "../models/article.js"
import type { DateRange } from "../utils/dates.js"
import type { GitHubSourceConfig } from "../config/sources.js"
import { makeArticleId } from "../models/article.js"
import { isValidArticleUrl, normalizeUrl } from "../utils/urls.js"
import { truncate } from "../utils/parsing.js"
import { HTTP_TIMEOUT_MS, GITHUB_MIN_STARS } from "../config/constants.js"
import { logger } from "../utils/log.js"

interface GitHubRepo {
  html_url: string
  full_name: string
  description: string | null
  created_at: string
  pushed_at: string
  stargazers_count: number
  topics: string[]
}

interface GitHubSearchResponse {
  items: GitHubRepo[]
}

export class GitHubSource implements Source {
  readonly key = "github"
  readonly name = "GitHub"
  private queries: string[]
  private token: string | undefined

  constructor(cfg: GitHubSourceConfig) {
    this.queries = cfg.queries
    this.token = cfg.token
  }

  async fetch(range: DateRange): Promise<FetchResult> {
    const fromStr = range.from.toISOString().split("T")[0]
    const toStr   = range.to.toISOString().split("T")[0]

    const headers: Record<string, string> = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    }
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`

    const seen = new Set<string>()
    const articles: Article[] = []

    for (const query of this.queries) {
      // Use pushed: to capture recently active repos, not just newly created ones.
      // New repos rarely hit the star threshold in their first week, so created: was
      // returning almost nothing.
      const q = `${query} pushed:${fromStr}..${toStr} stars:>=${GITHUB_MIN_STARS}`
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`

      try {
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        })
        if (!res.ok) {
          logger.warn("github", `Search failed for "${query}": ${res.status}`)
          continue
        }

        const data = await res.json() as GitHubSearchResponse

        for (const repo of data.items ?? []) {
          const articleUrl = normalizeUrl(repo.html_url)
          if (!isValidArticleUrl(articleUrl) || seen.has(articleUrl)) continue
          seen.add(articleUrl)

          // Use pushed_at as the article timestamp since we're filtering by push date.
          // Don't re-check inRange here — the API already filtered by pushed:.
          const timestamp = new Date(repo.pushed_at)

          const topics = repo.topics?.length ? ` [${repo.topics.slice(0, 4).join(", ")}]` : ""
          const snippet = repo.description
            ? truncate(`${repo.description}${topics} · ★${repo.stargazers_count}`, 300)
            : null

          articles.push({
            id: makeArticleId(articleUrl),
            title: repo.full_name,
            url: articleUrl,
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
        logger.warn("github", `Error fetching "${query}": ${String(err)}`)
      }

      // Respect GitHub's secondary rate limit
      await new Promise(r => setTimeout(r, 300))
    }

    return { articles }
  }
}
