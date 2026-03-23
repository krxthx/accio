import type { Article } from "../models/article.js"
import type { ToolCallingClient } from "../llm/types.js"
import type { DateRange } from "../utils/dates.js"
import { makeArticleId } from "../models/article.js"
import { inRange, formatDate } from "../utils/dates.js"
import { isValidArticleUrl, normalizeUrl } from "../utils/urls.js"
import { truncate } from "../utils/parsing.js"
import { HTTP_TIMEOUT_MS, GITHUB_MIN_STARS, HN_FETCH_LIMIT } from "../config/constants.js"
import { logger } from "../utils/log.js"

const COLLECT_AGENT_SYSTEM = `You are a news curation agent for a weekly AI practitioner digest.

Your job: surface the most important and diverse AI news from the given date range using your search tools.

Guidelines:
- Cover a mix of: model releases, research breakthroughs, open-source tools, industry news, community discussions
- Prefer high-signal content: benchmarks, new capabilities, significant releases, notable papers
- Run 6–10 targeted searches across both HackerNews and GitHub
- Vary your queries — don't repeat similar queries; explore different angles and topics
- Stop when you feel you have good coverage across topic areas

Call search_hackernews for news, discussions, and research links.
Call search_github for new open-source projects and tools.

When done, respond with a short plain-text summary of what you found (1–2 sentences). The articles have already been collected via your tool calls.`

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
  logger.step("collect-agent", "Agent deciding search queries…")

  const collected: Article[] = []
  const seen = new Set<string>()

  const userMessage = `Find the most important AI news and projects from ${formatDate(range.from)} to ${formatDate(range.to)}.`

  await llm.runAgentLoop(
    COLLECT_AGENT_SYSTEM,
    userMessage,
    [SEARCH_HN_TOOL, SEARCH_GITHUB_TOOL],
    async (toolName, toolInput) => {
      const { query } = toolInput as { query: string }
      logger.info("collect-agent", `${toolName}("${query}")`)

      const articles = toolName === "search_hackernews"
        ? await searchHN(query, range)
        : await searchGitHub(query, range)

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
