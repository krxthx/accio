import type { Article } from "../models/article.js"
import type { ToolCallingClient } from "../llm/types.js"
import type { DateRange } from "../utils/dates.js"
import { makeArticleId } from "../models/article.js"
import { inRange, formatDate } from "../utils/dates.js"
import { isValidArticleUrl, normalizeUrl } from "../utils/urls.js"
import { truncate } from "../utils/parsing.js"
import { HTTP_TIMEOUT_MS, GITHUB_MIN_STARS, HN_FETCH_LIMIT } from "../config/constants.js"
import { logger } from "../utils/log.js"
import { RSSSource } from "../sources/rss.js"
import { RedditSource } from "../sources/reddit.js"
import { PlaywrightSource } from "../sources/playwright.js"
import { RSS_SOURCES, REDDIT_SOURCE, PLAYWRIGHT_SOURCES } from "../config/sources.js"

const COLLECT_AGENT_SYSTEM = `You are a news curation agent for a weekly AI practitioner digest.

Your job: surface the most important and diverse AI news from the given date range using your tools.

Step 1 — always call these three tools first to fetch all curated sources:
  1. fetch_rss_feeds — fetches all configured RSS/blog feeds
  2. fetch_reddit — fetches all configured subreddits
  3. fetch_playwright — scrapes all configured news pages

Step 2 — run 3–5 targeted searches to fill gaps:
  - Call search_hackernews for news, discussions, and research links
  - Call search_github for new open-source projects and tools
  - Cover a mix of: model releases, open-source tools, industry news, community discussions
  - Vary your queries — don't repeat similar queries; explore different angles
  - Stop when you feel you have good coverage across topic areas

Quality over quantity — aim for 50–150 total articles. Avoid redundant queries that return overlapping results.
Research papers are already covered by RSS feeds; do not search specifically for papers.

When done, respond with a short plain-text summary of what you found (1–2 sentences). The articles have already been collected via your tool calls.`

const FETCH_RSS_TOOL = {
  name: "fetch_rss_feeds",
  description: "Fetch all curated RSS/blog feeds (ArXiv, Hugging Face, OpenAI, Google DeepMind, VentureBeat, TechCrunch, MIT News, etc.). Call this once at the start.",
  inputSchema: { type: "object", properties: {}, required: [] },
}

const FETCH_REDDIT_TOOL = {
  name: "fetch_reddit",
  description: "Fetch recent hot posts from all configured AI subreddits (r/MachineLearning, r/LocalLLaMA, r/artificial, r/singularity). Call this once at the start.",
  inputSchema: { type: "object", properties: {}, required: [] },
}

const FETCH_PLAYWRIGHT_TOOL = {
  name: "fetch_playwright",
  description: "Scrape curated AI news pages that don't have RSS feeds (e.g. Anthropic News). Call this once at the start.",
  inputSchema: { type: "object", properties: {}, required: [] },
}

const SEARCH_HN_TOOL = {
  name: "search_hackernews",
  description: "Search Hacker News for AI-related stories matching a query. Returns titles, URLs, and snippets.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query, e.g. 'new LLM release', 'AI agent framework', 'transformer paper'" },
    },
    required: ["query"],
  },
}

const SEARCH_GITHUB_TOOL = {
  name: "search_github",
  description: "Search GitHub for new AI/ML repositories created in the digest window. Returns repo names, descriptions, and star counts.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query, e.g. 'LLM inference', 'AI agent', 'fine-tuning'" },
    },
    required: ["query"],
  },
}

async function fetchRSSFeeds(range: DateRange): Promise<Article[]> {
  const results = await Promise.allSettled(
    RSS_SOURCES.map(cfg => new RSSSource(cfg).fetch(range))
  )
  const articles: Article[] = []
  for (const r of results) {
    if (r.status === "fulfilled") articles.push(...r.value.articles)
  }
  return articles
}

async function fetchReddit(range: DateRange): Promise<Article[]> {
  const result = await new RedditSource(REDDIT_SOURCE).fetch(range)
  return result.articles
}

async function fetchPlaywright(range: DateRange): Promise<Article[]> {
  const results = await Promise.allSettled(
    PLAYWRIGHT_SOURCES.map(cfg => new PlaywrightSource(cfg).fetch(range))
  )
  const articles: Article[] = []
  for (const r of results) {
    if (r.status === "fulfilled") articles.push(...r.value.articles)
  }
  return articles
}

async function searchHN(query: string, range: DateRange): Promise<Article[]> {
  const fromTs = Math.floor(range.from.getTime() / 1000)
  const toTs   = Math.floor(range.to.getTime()   / 1000)

  const params = new URLSearchParams({
    query,
    tags: "story",
    numericFilters: `created_at_i>${fromTs},created_at_i<${toTs},points>5`,
    hitsPerPage: String(HN_FETCH_LIMIT),
  })

  try {
    const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${params}`, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
    if (!res.ok) return []

    const data = await res.json() as { hits: Array<{
      objectID: string; title?: string; story_title?: string
      url?: string; story_url?: string; story_text?: string; created_at: string
    }> }

    const articles: Article[] = []
    const seen = new Set<string>()

    for (const hit of data.hits ?? []) {
      const rawUrl = hit.url ?? hit.story_url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`
      const url = normalizeUrl(rawUrl)
      if (!isValidArticleUrl(url) || seen.has(url)) continue
      seen.add(url)

      const timestamp = new Date(hit.created_at)
      if (!inRange(timestamp, range)) continue

      const snippet = hit.story_text
        ? truncate(hit.story_text.replace(/<[^>]+>/g, " ").trim(), 400)
        : null

      articles.push({
        id: makeArticleId(url),
        title: (hit.title ?? hit.story_title ?? "Untitled").trim(),
        url,
        sourceKey: "hackernews",
        sourceName: "Hacker News",
        timestamp,
        timestampVerified: true,
        rawSnippet: snippet,
        fullContent: null, summary: null, cleanedTitle: null,
        importanceScore: null, importanceJustification: null, section: null,
        duplicateOf: null, "alsoСoveredBy": [], fetchError: null,
      })
    }
    return articles
  } catch {
    return []
  }
}

async function searchGitHub(query: string, range: DateRange): Promise<Article[]> {
  const fromStr = formatDate(range.from)
  const toStr   = formatDate(range.to)
  const token   = process.env.GITHUB_TOKEN

  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const q = `${query} created:${fromStr}..${toStr}`
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })
    if (!res.ok) return []

    const data = await res.json() as { items: Array<{
      html_url: string; full_name: string; description: string | null
      created_at: string; stargazers_count: number; topics: string[]
    }> }

    const articles: Article[] = []
    const seen = new Set<string>()

    for (const repo of data.items ?? []) {
      if (repo.stargazers_count < GITHUB_MIN_STARS) continue
      const articleUrl = normalizeUrl(repo.html_url)
      if (!isValidArticleUrl(articleUrl) || seen.has(articleUrl)) continue
      seen.add(articleUrl)

      const timestamp = new Date(repo.created_at)
      if (!inRange(timestamp, range)) continue

      const topics = repo.topics?.length ? ` [${repo.topics.slice(0, 4).join(", ")}]` : ""
      const snippet = repo.description
        ? truncate(`${repo.description}${topics} · ★${repo.stargazers_count}`, 300)
        : null

      articles.push({
        id: makeArticleId(articleUrl),
        title: repo.full_name,
        url: articleUrl,
        sourceKey: "github",
        sourceName: "GitHub",
        timestamp,
        timestampVerified: true,
        rawSnippet: snippet,
        fullContent: null, summary: null, cleanedTitle: null,
        importanceScore: null, importanceJustification: null, section: null,
        duplicateOf: null, "alsoСoveredBy": [], fetchError: null,
      })
    }
    return articles
  } catch {
    return []
  }
}

/**
 * Run the LLM agent to decide what queries to run against HN and GitHub.
 * Returns all articles the agent discovered via its tool calls.
 */
export async function agentCollect(llm: ToolCallingClient, range: DateRange): Promise<Article[]> {
  logger.step("collect-agent", "Agent deciding search queries...")

  const collected: Article[] = []
  const seen = new Set<string>()

  const userMessage = `Find the most important AI news and projects from ${formatDate(range.from)} to ${formatDate(range.to)}.`

  await llm.runAgentLoop(
    COLLECT_AGENT_SYSTEM,
    userMessage,
    [FETCH_RSS_TOOL, FETCH_REDDIT_TOOL, FETCH_PLAYWRIGHT_TOOL, SEARCH_HN_TOOL, SEARCH_GITHUB_TOOL],
    async (toolName, toolInput) => {
      let articles: Article[]

      if (toolName === "fetch_rss_feeds") {
        logger.info("collect-agent", "fetch_rss_feeds()")
        articles = await fetchRSSFeeds(range)
      } else if (toolName === "fetch_reddit") {
        logger.info("collect-agent", "fetch_reddit()")
        articles = await fetchReddit(range)
      } else if (toolName === "fetch_playwright") {
        logger.info("collect-agent", "fetch_playwright()")
        articles = await fetchPlaywright(range)
      } else {
        const { query } = toolInput as { query: string }
        logger.info("collect-agent", `${toolName}("${query}")`)
        articles = toolName === "search_hackernews"
          ? await searchHN(query, range)
          : await searchGitHub(query, range)
      }

      // Accumulate unique articles as side effects
      for (const a of articles) {
        if (!seen.has(a.url)) {
          seen.add(a.url)
          collected.push(a)
        }
      }

      // Return a summary to the agent so it can decide what to search next
      const titles = articles.slice(0, 5).map(a => `- ${a.title}`)
      return `Found ${articles.length} results.\n${titles.join("\n")}${articles.length > 5 ? `\n... and ${articles.length - 5} more` : ""}`
    },
    { maxTurns: 16 }
  ).catch(err => {
    logger.warn("collect-agent", `Agent loop ended: ${String(err)}`)
  })

  logger.stat("Agent collected", collected.length)
  return collected
}
