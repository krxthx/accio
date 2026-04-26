export interface RSSSourceConfig {
  key: string
  name: string
  url: string          // RSS feed URL
  tier: 1
  fetchLimit?: number  // max articles to keep (applied after date filter)
}

export interface PlaywrightSourceConfig {
  key: string
  name: string
  url: string          // page URL to scrape
  tier: 3
  cloudflare?: boolean
}

export interface HNSourceConfig {
  key: "hackernews"
  name: string
  tier: 2
  queries: string[]
}

export interface RedditSourceConfig {
  key: string
  name: string
  tier: 2
  subreddits: string[]
}

export interface LangSearchSourceConfig {
  key: "langsearch"
  name: string
  tier: 2
  queries: string[]    // {dateRange} placeholder replaced at runtime
}

export interface GitHubSourceConfig {
  key: "github"
  name: string
  tier: 2
  queries: string[]
  token?: string
}

export type SourceConfig =
  | RSSSourceConfig
  | PlaywrightSourceConfig
  | HNSourceConfig
  | RedditSourceConfig
  | LangSearchSourceConfig
  | GitHubSourceConfig

// ── Tier 1: RSS feeds (verified timestamps) ───────────────────────────────────
export const RSS_SOURCES: RSSSourceConfig[] = [
  // ── Lab & product blogs ───────────────────────────────────────────────────
  {
    key: "openai_news",
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    tier: 1,
  },
  {
    key: "deepmind_rss",
    name: "Google DeepMind",
    url: "https://deepmind.google/blog/rss.xml",
    tier: 1,
  },
  {
    key: "google_ai_blog",
    name: "Google AI Blog",
    url: "https://blog.google/technology/ai/rss/",
    tier: 1,
  },
  {
    key: "hf_blog",
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    tier: 1,
  },
  {
    key: "nvidia_blog",
    name: "NVIDIA AI Blog",
    url: "https://blogs.nvidia.com/feed/",
    tier: 1,
    fetchLimit: 5,
  },
  {
    key: "msft_ai_blog",
    name: "Microsoft AI Blog",
    url: "https://blogs.microsoft.com/ai/feed/",
    tier: 1,
    fetchLimit: 5,
  },
  // ── Industry news ─────────────────────────────────────────────────────────
  {
    key: "venturebeat_ai",
    name: "VentureBeat AI",
    url: "https://venturebeat.com/ai/feed/",
    tier: 1,
  },
  {
    key: "techcrunch_ai",
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    tier: 1,
  },
  {
    key: "theverge_ai",
    name: "The Verge AI",
    url: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml",
    tier: 1,
  },
  {
    key: "wired_ai",
    name: "Wired AI",
    url: "https://www.wired.com/feed/tag/ai/latest/rss",
    tier: 1,
    fetchLimit: 8,
  },
  // ── Research (top papers only — ranked strictly) ──────────────────────────
  {
    key: "arxiv_ai",
    name: "ArXiv CS.AI",
    url: "https://rss.arxiv.org/rss/cs.AI",
    tier: 1,
    fetchLimit: 3,
  },
]

// ── Tier 2: Structured APIs ───────────────────────────────────────────────────
export const HN_SOURCE: HNSourceConfig = {
  key: "hackernews",
  name: "Hacker News",
  tier: 2,
  queries: [
    "Claude", "ChatGPT", "Gemini", "GPT", "Grok",
    "AI agent", "LLM app", "AI product", "AI startup",
    "MCP server", "model context protocol",
    "open source AI", "AI tool", "AI release",
    "vibe coding", "cursor", "AI coding",
    "RAG", "fine-tuning", "AI API",
  ],
}

export const REDDIT_SOURCE: RedditSourceConfig = {
  key: "reddit",
  name: "Reddit",
  tier: 2,
  subreddits: ["MachineLearning", "LocalLLaMA", "artificial", "singularity"],
}

export const LANGSEARCH_SOURCE: LangSearchSourceConfig = {
  key: "langsearch",
  name: "Web Search",
  tier: 2,
  queries: [
    "new AI model release {dateRange}",
    "AI product launch {dateRange}",
    "AI startup funding announcement {dateRange}",
    "new AI API features {dateRange}",
    "AI industry news {dateRange}",
  ],
}

export const GITHUB_SOURCE: GitHubSourceConfig = {
  key: "github",
  name: "GitHub",
  tier: 2,
  token: process.env.GITHUB_TOKEN,
  queries: [
    "AI agent",
    "LLM app",
    "MCP server",
    "Claude tool",
    "AI coding assistant",
    "open source AI product",
  ],
}

// ── Tier 3: Playwright scrape ─────────────────────────────────────────────────
export const PLAYWRIGHT_SOURCES: PlaywrightSourceConfig[] = [
  { key: "anthropic_news", name: "Anthropic News",   url: "https://www.anthropic.com/news",       tier: 3 },
  // meta_ai disabled: no RSS feed, Playwright returns stale dates (Dec 2025 etc.) with no reliable fix
  // { key: "meta_ai",        name: "Meta AI Blog",     url: "https://ai.meta.com/blog/",            tier: 3 },
  // google_ai moved to RSS (blog.google/technology/ai/rss/) — has proper pubDate
]
