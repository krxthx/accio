import nunjucks from "nunjucks"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { mkdir, writeFile } from "fs/promises"
import type { DigestResult } from "../models/digest.js"
import type { Article } from "../models/article.js"
import { SECTIONS, OUTPUT_DIR } from "../config/constants.js"
import { formatDate, formatDateRange } from "../utils/dates.js"
import { logger } from "../utils/log.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

function formatFilenameTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z")
}

export async function render(
  digest: DigestResult,
  outputPath?: string
): Promise<string> {
  logger.step("render", "Generating HTML digest...")

  const templatesDir = join(__dirname, "..", "templates")
  const env = nunjucks.configure(templatesDir, { autoescape: true })

  env.addFilter("formatDate", (d: Date | null) => d ? formatDate(d) : "unknown date")
  env.addFilter("sectionIcon", (heading: string) => heading.split(" ")[0] ?? "")
  env.addFilter("sectionLabel", (heading: string) => heading.split(" ").slice(1).join(" "))

  const outDir = process.env.OUTPUT_DIR ?? OUTPUT_DIR
  await mkdir(outDir, { recursive: true })

  const filename =
    outputPath ??
    join(outDir, `digest-${formatFilenameTimestamp(digest.generatedAt)}.html`)

  const html = env.render("digest.njk", {
    digest,
    dateRange: formatDateRange({ from: digest.dateFrom, to: digest.dateTo }),
    generatedAt: digest.generatedAt.toISOString(),
  })

  await writeFile(filename, html, "utf-8")
  logger.success(`Digest written → ${filename}`)

  return filename
}
