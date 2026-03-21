// ── LLM ──────────────────────────────────────────────────────────────────────
export const LLM_TEMPERATURE = 0.0          // deterministic for all quality tasks
export const LLM_MAX_TOKENS = 4096

// Batch sizes — tuned for local gemma3 context window.
// Larger batches = fewer LLM calls = faster on local (serialized GPU).
export const ENHANCE_BATCH_SIZE = 4         // articles per enhance call
export const SUMMARIZE_BATCH_SIZE = 2       // articles per summarize call
export const RANK_MAX_ARTICLES = 20         // single rank call cap (split if over)
export const CATEGORIZE_MAX_ARTICLES = 20   // single categorize call cap

// ── Dedup ─────────────────────────────────────────────────────────────────────
export const DEDUP_SIMILARITY_THRESHOLD = 0.92   // cosine similarity for duplicate
export const DEDUP_EMBED_BATCH_SIZE = 32          // articles per embedding request

// ── Date filtering ────────────────────────────────────────────────────────────
export const DATE_FILTER_TOLERANCE_HOURS = 6     // slack for timezone drift

// ── HTTP ──────────────────────────────────────────────────────────────────────
export const HTTP_TIMEOUT_MS = 15_000
export const PLAYWRIGHT_TIMEOUT_MS = 30_000
export const PLAYWRIGHT_CLOUDFLARE_WAIT_MS = 10_000
export const PLAYWRIGHT_NORMAL_WAIT_MS = 3_000

// ── Sources ───────────────────────────────────────────────────────────────────
export const HN_FETCH_LIMIT = 20
export const REDDIT_FETCH_LIMIT = 8         // per subreddit
export const REDDIT_MIN_SCORE = 10          // ignore low-signal posts
export const LANGSEARCH_RESULT_COUNT = 8
export const RSS_FETCH_TIMEOUT_MS = 10_000

// ── Ranking ───────────────────────────────────────────────────────────────────
export const MIN_IMPORTANCE_SCORE = 3       // articles below this are excluded

// ── Output ────────────────────────────────────────────────────────────────────
export const OUTPUT_DIR = "./output"

// ── Sections ──────────────────────────────────────────────────────────────────
export const SECTIONS = {
  A: { key: "product_news",          heading: "🚀 Product Releases & Announcements", cssClass: "product-news" },
  B: { key: "frameworks_community",  heading: "🔧 Frameworks & Community",           cssClass: "frameworks-community" },
  C: { key: "business_industry",     heading: "💼 Business & Industry",              cssClass: "business-industry" },
  D: { key: "research",              heading: "🧠 Research & Papers",                cssClass: "research" },
  E: { key: "discussions",           heading: "💬 Discussions & Opinions",           cssClass: "discussions" },
} as const

// ── Source priority for dedup canonical selection ─────────────────────────────
// Lower index = higher priority (lab blogs > papers > press > community)
export const SOURCE_PRIORITY = [
  "openai_rss", "anthropic_rss", "deepmind_rss", "meta_rss",
  "arxiv_rss", "hf_rss",
  "hackernews", "langsearch",
  "reddit_ml", "reddit_localllm",
]

// ── Browser ───────────────────────────────────────────────────────────────────
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

export const CLOUDFLARE_DOMAINS = new Set(["openai.com", "blogs.nvidia.com", "aimagazine.com"])

export const DOMAIN_WAIT_MS: Record<string, number> = {
  "openai.com": 10_000,
  "anthropic.com": 5_000,
  "blogs.nvidia.com": 8_000,
  "blog.google": 4_000,
  "deepmind.google": 4_000,
}
