/**
 * Renders a preview of the digest template with sample data.
 * Usage: bun scripts/preview.ts
 */
import nunjucks from "nunjucks"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { writeFile, mkdir } from "fs/promises"

const __dirname = dirname(fileURLToPath(import.meta.url))
const templatesDir = join(__dirname, "..", "src", "templates")
const env = nunjucks.configure(templatesDir, { autoescape: true })

env.addFilter("formatDate", (d: Date | null) => d ? d.toISOString().slice(0, 10) : "")
env.addFilter("sectionIcon", (heading: string) => heading.split(" ")[0] ?? "")
env.addFilter("sectionLabel", (heading: string) => heading.split(" ").slice(1).join(" "))

const sampleArticle = (overrides: Record<string, unknown>) => ({
  url: "https://example.com",
  title: "Sample Article",
  cleanedTitle: null,
  sourceKey: "hackernews",
  sourceName: "Hacker News",
  importanceScore: 3,
  timestamp: new Date("2026-03-18"),
  timestampVerified: true,
  summary: null,
  alsoСoveredBy: [],
  rawSnippet: null,
  ...overrides,
})

const digest = {
  dateFrom: new Date("2026-03-14"),
  dateTo: new Date("2026-03-21"),
  generatedAt: new Date(),
  stats: { collected: 149, afterDateFilter: 149, afterEnhance: 84, afterDedup: 84, inDigest: 56, failures: 2 },
  sections: [
    {
      key: "A",
      heading: "🚀 Product Releases & Announcements",
      cssClass: "product-news",
      articles: [
        sampleArticle({
          url: "https://openai.com/index/introducing-gpt-5-4-mini-and-nano",
          cleanedTitle: "Introducing GPT-5.4 mini and nano",
          sourceKey: "openai_news", sourceName: "OpenAI News",
          importanceScore: 5,
          timestamp: new Date("2026-03-17"),
          summary: "OpenAI released GPT-5.4 mini and nano, their most capable small models to date. GPT-5.4 mini offers over 2x speed over GPT-5 mini while significantly improving coding, reasoning, multimodal understanding, and tool use — approaching GPT-5.4 performance on SWE-Bench Pro.",
        }),
        sampleArticle({
          url: "https://huggingface.co/blog/Hcompany/holotron-12b",
          cleanedTitle: "Holotron-12B — High Throughput Computer Use Agent",
          sourceKey: "hf_blog", sourceName: "Hugging Face",
          importanceScore: 4,
          timestamp: new Date("2026-03-17"),
          summary: "H Company released Holotron-12B, a multimodal computer-use model post-trained from NVIDIA's Nemotron-Nano-2 VL. Uses a hybrid SSM architecture optimized for high-throughput inference, specifically for agentic workflows that handle long contexts with multiple images.",
        }),
        sampleArticle({
          url: "https://anthropic.com/news/claude-3-7",
          cleanedTitle: "Claude 3.7 Sonnet — Extended Thinking",
          sourceKey: "anthropic_news", sourceName: "Anthropic",
          importanceScore: 5,
          timestamp: new Date("2026-03-19"),
          summary: "Anthropic released Claude 3.7 Sonnet with extended thinking mode, enabling deeper reasoning for complex tasks. The model achieves new state-of-the-art on coding benchmarks and shows significantly improved performance on multi-step agentic tasks.",
        }),
        sampleArticle({
          url: "https://github.com/Tencent/Covo-Audio",
          cleanedTitle: "Covo-Audio: 7B End-to-End Large Audio Language Model",
          sourceKey: "github", sourceName: "GitHub",
          importanceScore: 4,
          timestamp: new Date("2026-03-16"),
          summary: "Tencent released Covo-Audio, a 7B end-to-end audio language model processing continuous audio and generating audio in a unified architecture. Introduces hierarchical tri-modal speech-text interleaving with a full-duplex variant for low-latency native voice interaction.",
        }),
        sampleArticle({
          url: "https://deepmind.com/blog/gemini-2-5",
          cleanedTitle: "Gemini 2.5 Pro — Experimental Release",
          sourceKey: "deepmind_blog", sourceName: "Google DeepMind",
          importanceScore: 5,
          timestamp: new Date("2026-03-20"),
          summary: "Google released Gemini 2.5 Pro in experimental preview, claiming top scores on reasoning and coding benchmarks. The model introduces improved tool use and a 1M token context window with better utilization across the full range.",
        }),
        sampleArticle({
          url: "https://example.com/mistral-release",
          cleanedTitle: "Mistral Small 3.1 — Multimodal Open Model",
          sourceKey: "other", sourceName: "Mistral AI",
          importanceScore: 3,
          timestamp: new Date("2026-03-18"),
          timestampVerified: false,
          summary: "Mistral AI released Small 3.1, a 24B multimodal model available under Apache 2.0. Supports vision and text inputs with a 128K context window, targeting on-device and edge deployment scenarios.",
        }),
      ],
    },
    {
      key: "B",
      heading: "🔧 Frameworks & Community",
      cssClass: "frameworks-community",
      articles: [
        sampleArticle({
          url: "https://github.com/example/langgraph-studio",
          cleanedTitle: "LangGraph Studio 2.0 — Visual Agent Debugger",
          sourceKey: "hackernews", sourceName: "Hacker News",
          importanceScore: 4,
          timestamp: new Date("2026-03-16"),
          summary: "LangGraph Studio 2.0 ships with a real-time visual debugger for agentic workflows, time-travel debugging, and breakpoint support. Integrates natively with LangSmith for tracing and evaluation, significantly reducing the iteration loop for complex multi-agent systems.",
        }),
        sampleArticle({
          url: "https://github.com/example/smolagents",
          cleanedTitle: "smolagents 1.1 — Simpler Tool Calling for Hugging Face Models",
          sourceKey: "hf_blog", sourceName: "Hugging Face",
          importanceScore: 3,
          timestamp: new Date("2026-03-15"),
          summary: "Hugging Face released smolagents 1.1 with improved tool-calling reliability, a new CodeAgent that writes and executes Python directly, and a library of 40+ pre-built tools for common agentic tasks.",
        }),
        sampleArticle({
          url: "https://github.com/example/dspy-optimizer",
          cleanedTitle: "DSPy — New MIPRO Optimizer Cuts Prompt Engineering",
          sourceKey: "hackernews", sourceName: "Hacker News",
          importanceScore: 3,
          timestamp: new Date("2026-03-14"),
          summary: "DSPy's new MIPRO optimizer automates instruction tuning and few-shot example selection, claiming 15-30% accuracy improvements on classification and reasoning tasks versus hand-written prompts.",
        }),
      ],
    },
    {
      key: "D",
      heading: "🧠 Research & Papers",
      cssClass: "research",
      articles: [
        sampleArticle({
          url: "https://arxiv.org/abs/2503.12345",
          cleanedTitle: "RLVR: Reinforcement Learning from Verifiable Rewards Scales to 70B",
          sourceKey: "arxiv_cs_ai", sourceName: "arXiv",
          importanceScore: 5,
          timestamp: new Date("2026-03-19"),
          summary: "Researchers demonstrate that RLVR — reinforcement learning from verifiable rewards — scales effectively to 70B models, achieving +12% on math and +8% on code benchmarks over SFT baselines without any human preference data.",
        }),
        sampleArticle({
          url: "https://arxiv.org/abs/2503.67890",
          cleanedTitle: "Chain-of-Draft: Thinking Faster with Fewer Tokens",
          sourceKey: "arxiv_cs_ai", sourceName: "arXiv",
          importanceScore: 4,
          timestamp: new Date("2026-03-17"),
          summary: "Chain-of-Draft proposes generating concise, information-dense reasoning drafts instead of verbose chain-of-thought, reducing token usage by 76% while matching or exceeding CoT accuracy on math, commonsense, and symbolic reasoning.",
        }),
        sampleArticle({
          url: "https://arxiv.org/abs/2503.11111",
          cleanedTitle: "MegaScale-Infer: Serving Mixture-of-Experts at 1M QPS",
          sourceKey: "arxiv_cs_ai", sourceName: "arXiv",
          importanceScore: 3,
          timestamp: new Date("2026-03-16"),
          summary: "ByteDance introduces MegaScale-Infer, a system for serving large MoE models at scale. Key innovations include disaggregated expert parallelism and a cross-node expert caching strategy that reduces all-to-all communication by 40%.",
        }),
      ],
    },
  ],
  failures: [
    { sourceName: "Reddit r/MachineLearning", error: "Connection timed out after 30s" },
    { sourceName: "MIT News", error: "SSL certificate verification failed" },
  ],
}

await mkdir(join(__dirname, "..", "output"), { recursive: true })

const html = env.render("digest.njk", {
  digest,
  dateRange: "2026-03-14 → 2026-03-21",
  generatedAt: new Date().toISOString(),
})

const outPath = join(__dirname, "..", "output", "preview.html")
await writeFile(outPath, html, "utf-8")
console.log(`Preview written → ${outPath}`)
