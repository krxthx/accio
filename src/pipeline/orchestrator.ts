import type { DateRange } from "../utils/dates.js"
import type { DigestResult, DigestStats } from "../models/digest.js"
import { getLLM, getEmbeddings } from "../llm/index.js"
import { collect } from "./collect.js"
import { enhance } from "./enhance.js"
import { dedup } from "./dedup.js"
import { rank } from "./rank.js"
import { summarize } from "./summarize.js"
import { categorize } from "./categorize.js"
import { render } from "./render.js"
import { logger } from "../utils/log.js"
import { SECTIONS } from "../config/constants.js"

export interface RunOptions {
  range: DateRange
  outputPath?: string
  verbose?: boolean
  dryRun?: boolean
}

export async function run(opts: RunOptions): Promise<string> {
  const startTime = Date.now()
  const startAt = new Date()
  const llm = getLLM()
  const embeddings = getEmbeddings()

  logger.info("accio", `LLM: ${llm.name}`)
  logger.info("accio", `Parallel: ${llm.supportsParallel ? "yes" : "no (batch mode)"}`)
  logger.info("accio", `Started: ${startAt.toLocaleTimeString()}`)

  // ── Phase 1: Collect (all sources in parallel) ─────────────────────────────
  const { articles: collected, failures } = await collect(opts.range)

  const stats: Partial<DigestStats> = {
    collected: collected.length,
    failures: failures.length,
  }

  if (opts.dryRun) {
    logger.info("accio", "--dry-run: stopping after collect")
    stats.afterDateFilter = collected.length
    stats.afterEnhance = collected.length
    stats.afterDedup = collected.length
    stats.inDigest = collected.length
    const digest: DigestResult = {
      dateFrom: opts.range.from,
      dateTo: opts.range.to,
      generatedAt: new Date(),
      stats: stats as DigestStats,
      sections: [],
      failures,
    }
    return render(digest, opts.outputPath)
  }

  stats.afterDateFilter = collected.length

  // ── Phase 2: Enhance — LLM quality filter ─────────────────────────────────
  const enhanced = await enhance(collected, llm, opts.range)
  stats.afterEnhance = enhanced.length

  // ── Phase 3: Dedup — embedding-based, no LLM ──────────────────────────────
  const deduplicated = await dedup(enhanced, embeddings)
  stats.afterDedup = deduplicated.length

  // ── Phase 4: Rank — single batched LLM call ───────────────────────────────
  const ranked = await rank(deduplicated, llm, opts.verbose)

  // ── Phase 5: Summarize — batched LLM calls ────────────────────────────────
  const summarized = await summarize(ranked, llm)

  // ── Phase 6: Categorize — single batched LLM call ─────────────────────────
  const categorized = await categorize(summarized, llm)
  stats.inDigest = categorized.length

  // ── Phase 7: Render ────────────────────────────────────────────────────────
  const sections = buildSectionsFromArticles(categorized)
  const digest: DigestResult = {
    dateFrom: opts.range.from,
    dateTo: opts.range.to,
    generatedAt: new Date(),
    stats: stats as DigestStats,
    sections,
    failures,
  }

  const outputFile = await render(digest, opts.outputPath)

  const endAt = new Date()
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
  logger.info("accio", `Started:  ${startAt.toLocaleTimeString()}`)
  logger.info("accio", `Finished: ${endAt.toLocaleTimeString()}`)
  logger.info("accio", `Elapsed:  ${elapsed} min`)
  logger.stat("Collected", stats.collected!)
  logger.stat("After enhance", stats.afterEnhance!)
  logger.stat("After dedup", stats.afterDedup!)
  logger.stat("In digest", stats.inDigest!)

  return outputFile
}

function buildSectionsFromArticles(articles: import("../models/article.js").Article[]): DigestResult["sections"] {
  const buckets = new Map<string, import("../models/article.js").Article[]>(
    Object.keys(SECTIONS).map(k => [k, []])
  )

  for (const a of articles) {
    const key = a.section ?? "E"
    buckets.get(key)?.push(a)
  }

  return Object.entries(SECTIONS)
    .filter(([k]) => (buckets.get(k)?.length ?? 0) > 0)
    .map(([k, def]) => ({
      key: def.key,
      heading: def.heading,
      cssClass: def.cssClass,
      articles: buckets.get(k)!,
    }))
}
