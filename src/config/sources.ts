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
  {
    key: "arxiv_ai",
    name: "ArXiv CS.AI",
    url: "https://rss.arxiv.org/rss/cs.AI",
    tier: 1,
    fetchLimit: 5,
  },
  {
    key: "arxiv_lg",
    name: "ArXiv CS.LG",
    url: "https://rss.arxiv.org/rss/cs.LG",
    tier: 1,
    fetchLimit: 5,
  },
  {
    key: "hf_blog",
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
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
    key: "mit_news",
    name: "MIT News AI",
    url: "https://news.mit.edu/rss/topic/artificial-intelligence2",
    tier: 1,
  },
  {
    key: "openai_news",
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    tier: 1,
  },
  // ── Business / Industry ───────────────────────────────────────────────────
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
  // ── Research (broader arXiv coverage) ────────────────────────────────────
  {
    key: "arxiv_cl",
    name: "ArXiv CS.CL",
    url: "https://rss.arxiv.org/rss/cs.CL",
    tier: 1,
    fetchLimit: 5,
  },
  {
    key: "arxiv_cv",
    name: "ArXiv CS.CV",
    url: "https://rss.arxiv.org/rss/cs.CV",
    tier: 1,
    fetchLimit: 5,
  },
]

// ── Tier 2: Structured APIs ───────────────────────────────────────────────────
export const HN_SOURCE: HNSourceConfig = {
  key: "hackernews",
  name: "Hacker News",
  tier: 2,
  queries: [
    "LLM", "large language model", "Claude", "ChatGPT", "Gemini", "GPT",
    "AI agent", "open source AI", "AI release", "transformer", "RAG",
    "fine-tuning", "inference", "AI safety", "multimodal",
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
    "new LLM model release",
    "AI benchmark state of the art results",
    "foundation model paper",
    "open source AI tool release",
    "AI safety research paper",
    "machine learning breakthrough",
  ],
}

export const GITHUB_SOURCE: GitHubSourceConfig = {
  key: "github",
  name: "GitHub",
  tier: 2,
  token: process.env.GITHUB_TOKEN,
  queries: [
    "language-model",
    "LLM inference",
    "AI agent framework",
    "machine learning",
    "diffusion model",
    "fine-tuning LLM",
  ],
}

// ── Tier 3: Playwright scrape ─────────────────────────────────────────────────
export const PLAYWRIGHT_SOURCES: PlaywrightSourceConfig[] = [
  { key: "anthropic_news", name: "Anthropic News",   url: "https://www.anthropic.com/news",       tier: 3 },
  // meta_ai disabled: no RSS feed, Playwright returns stale dates (Dec 2025 etc.) with no reliable fix
  // { key: "meta_ai",        name: "Meta AI Blog",     url: "https://ai.meta.com/blog/",            tier: 3 },
  // google_ai moved to RSS (blog.google/technology/ai/rss/) — has proper pubDate
]
