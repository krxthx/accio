# Accio AI v2 — Requirements & Architecture

> CLI-based agentic AI news digest generator for AI practitioners.
> **Status: Implemented** (TypeScript / Bun)

---

## Core Goals

- Daily or weekly digest of what matters in AI, targeting engineers, researchers, and product builders
- Full run completes in **7–15 minutes** — parallelism is a top-level constraint
- **70%+ LLM-driven** decisions (filter, rank, summarize, categorize)
- Transparent about failures — surface what couldn't be fetched, never silently skip
- Never present stale content as fresh — date filtering runs before any LLM call
- Terminal-only, outputs clean self-contained HTML

---

## CLI Interface

```bash
# Shorthand windows
accio run --window 7d
accio run --window 1d
accio run --window 3d
accio run --window 14d

# Explicit date range
accio run --from 2025-03-13 --to 2025-03-20

# Options
accio run --window 7d --output ./my-digest.html
accio run --window 7d --verbose      # include low-importance articles
accio run --window 7d --dry-run      # collect + date filter only, no LLM
accio run --window 7d --debug        # show debug logs
```

`--window` and `--from/--to` are mutually exclusive. One must be provided.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | **Bun** | Fast startup, native TS, no build step needed |
| Language | **TypeScript** | Strong typing, natural `Promise.all()` parallelism |
| CLI | `commander` | Lightweight, standard |
| LLM (OpenAI-compat) | `openai` npm package | Covers Ollama, OpenRouter, OpenAI, LM Studio, vLLM |
| LLM (Anthropic) | `@anthropic-ai/sdk` | Direct SDK for prod |
| Embeddings | Ollama via `openai` package | OpenAI-compat `/embeddings` endpoint — keeps stack local |
| RSS | `rss-parser` | Mature, reliable |
| Scraping | `playwright` + `@mozilla/readability` + `jsdom` | Full browser for Cloudflare/JS-heavy sites |
| Validation | `zod` | Pydantic equivalent for TS |
| Templates | `nunjucks` | Jinja2-compatible syntax |
| Logging | `chalk` | Colored terminal output |

**Dev LLM:** `gemma3` via Ollama (local, `http://localhost:11434/v1`)
**Prod LLM:** Anthropic Claude or any OpenAI-compat cloud endpoint

---

## Project Structure

```
accio-ai-v2/
├── package.json
├── tsconfig.json
├── .env / .env.example
└── src/
    ├── cli.ts                          # commander CLI entry point
    ├── pipeline/
    │   ├── orchestrator.ts             # wires all phases, tracks timing
    │   ├── collect.ts                  # Phase 1: parallel fetch + date filter
    │   ├── enhance.ts                  # Phase 2: LLM quality filter (batched)
    │   ├── dedup.ts                    # Phase 3: embedding-based dedup (no LLM)
    │   ├── rank.ts                     # Phase 4: batched LLM importance scoring
    │   ├── summarize.ts                # Phase 5: batched LLM summarization
    │   ├── categorize.ts               # Phase 6: batched LLM categorization
    │   └── render.ts                   # Phase 7: Nunjucks → HTML
    ├── sources/
    │   ├── base.ts                     # Source interface
    │   ├── rss.ts                      # RSS feeds (Tier 1 — verified timestamps)
    │   ├── hackernews.ts               # HN Algolia API (Tier 2)
    │   ├── reddit.ts                   # Reddit JSON API (Tier 2)
    │   ├── langsearch.ts               # LangSearch web search (Tier 2)
    │   └── playwright.ts               # Playwright scrape (Tier 3)
    ├── llm/
    │   ├── types.ts                    # LLMClient + EmbeddingClient interfaces
    │   ├── openai-compat.ts            # OpenAI-compat (Ollama, OpenRouter, etc.)
    │   ├── anthropic.ts                # Anthropic SDK
    │   └── index.ts                    # getLLM() + getEmbeddings() factories
    ├── models/
    │   ├── article.ts                  # Article zod schema + helpers
    │   └── digest.ts                   # DigestResult, DigestSection, FetchFailure
    ├── config/
    │   ├── constants.ts                # All tunable values (batch sizes, thresholds)
    │   ├── sources.ts                  # Source registry (RSS, HN, Reddit, etc.)
    │   └── prompts/
    │       ├── enhance.ts              # Quality filter prompt
    │       ├── rank.ts                 # Importance scoring prompt
    │       ├── summarize.ts            # Summarization prompt
    │       └── categorize.ts          # Section assignment prompt
    ├── utils/
    │   ├── dates.ts                    # Window/range resolution, inRange()
    │   ├── urls.ts                     # URL validation, normalization
    │   ├── log.ts                      # chalk logger with levels
    │   └── parsing.ts                  # extractJSON(), chunk(), truncate()
    └── templates/
        └── digest.njk                  # Dark theme HTML template
```

---

## Pipeline Architecture

### Parallelism Strategy

**Key constraint:** local Ollama serializes LLM requests on the GPU — firing N concurrent calls just queues them. The right strategy depends on provider:

| Phase type | Local (Ollama) | Cloud (Anthropic/OpenRouter) |
|---|---|---|
| Source fetching (I/O) | `Promise.all()` — true parallelism | same |
| LLM phases | Sequential large batches | `Promise.all()` across batches |

The `LLMClient` interface exposes `supportsParallel: boolean`. Pipeline phases check this flag. Set via `LLM_PARALLEL_WORKERS > 1` in env.

### Phase Breakdown (target: 7–10 min)

```
Phase 1 │ collect      │ Promise.all(all sources)       │ ~2–3 min
Phase 2 │ enhance      │ LLM batch=8, sequential/par    │ ~1–2 min
Phase 3 │ dedup        │ embeddings + cosine, CPU-only  │ ~20–30s
Phase 4 │ rank         │ 1–2 LLM calls (all articles)   │ ~30–60s
Phase 5 │ summarize    │ LLM batch=4, sequential/par    │ ~2–3 min
Phase 6 │ categorize   │ 1 LLM call (all articles)      │ ~30s
Phase 7 │ render       │ Nunjucks + writeFile            │ ~5s
────────┴──────────────┴────────────────────────────────┴──────────
Total                                                    ~7–10 min
```

### Phase 1: Collect

All sources fire simultaneously via `Promise.all`. Date filtering is the **first gate** — runs before any LLM call.

**Sources:**
- **Tier 1 (RSS — verified timestamps):** ArXiv CS.AI, ArXiv CS.LG, Hugging Face Blog, Google DeepMind, MIT News AI
- **Tier 2 (APIs):** Hacker News (Algolia), Reddit (r/MachineLearning, r/LocalLLaMA, r/artificial, r/singularity), LangSearch
- **Tier 3 (Playwright):** OpenAI News, Anthropic News, Meta AI Blog, Google AI Blog

**LangSearch queries** (model discovery, benchmarks, frontier research):
- "new LLM model release", "AI benchmark state of the art", "foundation model paper",
  "open source AI tool release", "AI safety research paper", "machine learning breakthrough"

### Phase 2: Enhance (LLM)

Batch 8 articles per call. Returns: keep/reject + cleaned title.
- **Reject:** tag/listing pages, media content, off-topic, job postings
- **Keep:** anything an AI practitioner finds useful

### Phase 3: Dedup (No LLM — deterministic)

1. Embed `title + snippet[:100]` via Ollama embeddings endpoint (OpenAI-compat)
2. Cosine similarity O(n²) — fine for n < 200
3. Union-Find clustering at threshold `0.92`
4. Pick canonical by source priority: lab blogs → papers → press → community
5. Non-canonical URLs stored in `alsoСoveredBy[]`

### Phase 4: Rank (LLM)

Single batched call across all deduplicated articles. Score 1–5:

| Score | Meaning |
|---|---|
| 5 | Major milestone — new model, breakthrough research, significant industry shift |
| 4 | Notable — useful tool, interesting research, meaningful news |
| 3 | Relevant — good discussion, incremental update, useful tutorial |
| 2 | Low signal — opinion, minor update, reposted content |
| 1 | Skip — barely AI-related, pure marketing |

Articles below `MIN_IMPORTANCE_SCORE=3` excluded (unless `--verbose`).

### Phase 5: Summarize (LLM)

Batch 4 articles per call. Fetches full content via `fetch` + `@mozilla/readability` if snippet < 200 chars. 2–4 sentences, specific and technical.

### Phase 6: Categorize (LLM)

Single batched call. Sections:
- **A** — Product Releases & Announcements
- **B** — Frameworks & Community
- **C** — Business & Industry
- **D** — Research & Papers
- **E** — Discussions & Opinions

### Phase 7: Render

Nunjucks → self-contained HTML (inline CSS, no JS). Dark theme, responsive, print-friendly.
Written to `./output/digest-YYYY-MM-DD.html`.

---

## LLM Provider Configuration

```bash
# Local dev — gemma3 via Ollama
LLM_PROVIDER=openai-compat
OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1
OPENAI_COMPAT_API_KEY=ollama
OPENAI_COMPAT_MODEL=gemma3:27b
LLM_PARALLEL_WORKERS=1          # keep 1 for local Ollama

# Prod — Anthropic
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
LLM_PARALLEL_WORKERS=4

# Any OpenAI-compat cloud (OpenRouter, vLLM, LM Studio, etc.)
LLM_PROVIDER=openai-compat
OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1
OPENAI_COMPAT_API_KEY=sk-or-...
OPENAI_COMPAT_MODEL=anthropic/claude-3.5-haiku
LLM_PARALLEL_WORKERS=3

# Embeddings (defaults to Ollama nomic-embed-text)
EMBED_BASE_URL=http://localhost:11434/v1
EMBED_MODEL=nomic-embed-text
```

---

## Data Models

### Article

| Field | Type | Set by |
|---|---|---|
| `id` | `string` | hash of URL |
| `title` | `string` | source |
| `url` | `string` | source |
| `sourceKey` | `string` | source |
| `sourceName` | `string` | source |
| `timestamp` | `Date \| null` | RSS pubDate / API `created_at` |
| `timestampVerified` | `boolean` | `true` if from RSS/API |
| `rawSnippet` | `string \| null` | source |
| `cleanedTitle` | `string \| null` | Phase 2 LLM |
| `summary` | `string \| null` | Phase 5 LLM |
| `importanceScore` | `1–5 \| null` | Phase 4 LLM |
| `importanceJustification` | `string \| null` | Phase 4 LLM |
| `section` | `A–E \| null` | Phase 6 LLM |
| `duplicateOf` | `string \| null` | Phase 3 |
| `alsoСoveredBy` | `string[]` | Phase 3 |

---

## Setup

```bash
# Prerequisites: Bun, Ollama running with gemma3 + nomic-embed-text pulled

bun install
bunx playwright install chromium
cp .env.example .env

# Run
bun run dev run --window 7d

# With Anthropic in prod
LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-... bun run dev run --window 7d
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| TypeScript over Python | Natural `Promise.all()` parallelism; `openai` npm covers all LLM providers |
| Bun over Node | Faster startup, built-in TS support |
| Embedding dedup over LLM dedup | Deterministic, fast, no token cost, no hallucination risk |
| Large batches over parallel LLM | Local GPU serializes parallel requests — batching is faster |
| `supportsParallel` flag | Same codebase works optimally for local (batch) and cloud (parallel) |
| `openai` npm for Ollama | Ollama exposes OpenAI-compat API — one SDK covers all providers |
| No orchestration framework | Raw `async/await` + `Promise.all()` is simpler, faster, no overhead |
| Playwright only for Tier 3 | Heavy; only used for sites without RSS/API |
| `@mozilla/readability` | Firefox's own reader mode — solid Trafilatura equivalent in TS |

## Correctness Rules

1. Date filter runs before any LLM call — guaranteed
2. Articles without verified timestamps are flagged (`timestampVerified: false`) and shown with a badge
3. All HTTP requests use `AbortSignal.timeout(15_000)` — no hanging requests
4. Dedup is deterministic — cosine similarity, not LLM
5. LLM JSON parse failures fall back gracefully — articles kept with defaults
6. Source failures are surfaced in digest footer — never silently swallowed
