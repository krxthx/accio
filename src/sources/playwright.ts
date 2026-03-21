import { chromium } from "playwright"
import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"
import type { Source, FetchResult } from "./base.js"
import type { Article } from "../models/article.js"
import type { DateRange } from "../utils/dates.js"
import type { PlaywrightSourceConfig } from "../config/sources.js"
import { makeArticleId } from "../models/article.js"
import { inRange, parseDate } from "../utils/dates.js"
import { isValidArticleUrl, normalizeUrl } from "../utils/urls.js"
import { truncate } from "../utils/parsing.js"
import {
  PLAYWRIGHT_TIMEOUT_MS,
  PLAYWRIGHT_CLOUDFLARE_WAIT_MS,
  PLAYWRIGHT_NORMAL_WAIT_MS,
  DOMAIN_WAIT_MS,
  USER_AGENT,
} from "../config/constants.js"

function extractLinks(html: string, baseUrl: string): { href: string; text: string }[] {
  const dom = new JSDOM(html, { url: baseUrl })
  const links: { href: string; text: string }[] = []
  dom.window.document.querySelectorAll("a[href]").forEach((el) => {
    const href = (el as HTMLAnchorElement).href
    const text = (el.textContent ?? "").trim()
    if (href && text.length > 10) links.push({ href, text })
  })
  return links
}

function extractDateFromPage(html: string, url: string): Date | null {
  const dom = new JSDOM(html, { url })
  const doc = dom.window.document

  // Try meta tags
  const metaSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    'meta[itemprop="datePublished"]',
  ]
  for (const sel of metaSelectors) {
    const val = doc.querySelector(sel)?.getAttribute("content")
    const d = parseDate(val)
    if (d) return d
  }

  // Try time elements
  const timeEl = doc.querySelector("time[datetime]")
  if (timeEl) {
    const d = parseDate(timeEl.getAttribute("datetime"))
    if (d) return d
  }

  return null
}

function extractSnippet(html: string, url: string): string | null {
  try {
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    if (article?.textContent) {
      const text = article.textContent.replace(/\s+/g, " ").trim()
      return truncate(text, 400)
    }
  } catch { /* ignore */ }
  return null
}

export class PlaywrightSource implements Source {
  readonly key: string
  readonly name: string
  private pageUrl: string
  private cloudflare: boolean

  constructor(cfg: PlaywrightSourceConfig) {
    this.key = cfg.key
    this.name = cfg.name
    this.pageUrl = cfg.url
    this.cloudflare = cfg.cloudflare ?? false
  }

  async fetch(range: DateRange): Promise<FetchResult> {
    const browser = await chromium.launch({ headless: true })
    try {
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        locale: "en-US",
        timezoneId: "America/New_York",
        extraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9",
        },
      })
      const page = await context.newPage()

      // Navigate with Cloudflare awareness
      await page.goto(this.pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: PLAYWRIGHT_TIMEOUT_MS,
      })

      const html = await page.content()
      const isCloudflare = html.toLowerCase().includes("just a moment") ||
                           html.toLowerCase().includes("cloudflare")

      if (isCloudflare) {
        await page.waitForTimeout(PLAYWRIGHT_CLOUDFLARE_WAIT_MS)
        await page.waitForLoadState("networkidle")
      } else {
        const domain = new URL(this.pageUrl).hostname
        const wait = DOMAIN_WAIT_MS[domain] ?? PLAYWRIGHT_NORMAL_WAIT_MS
        await page.waitForTimeout(wait)
      }

      const finalHtml = await page.content()
      await context.close()

      // Extract article links from the listing page
      const links = extractLinks(finalHtml, this.pageUrl)
      const seen = new Set<string>()
      const articles: Article[] = []

      for (const { href, text } of links) {
        const url = normalizeUrl(href)
        if (!isValidArticleUrl(url) || seen.has(url)) continue
        // Only follow links within same domain
        if (!url.includes(new URL(this.pageUrl).hostname)) continue
        seen.add(url)

        // Date extraction from listing page is unreliable — skip date filter,
        // mark all Playwright articles as unverified so the badge shows
        const extracted = extractDateFromPage(finalHtml, url)
        const timestamp = extracted ?? new Date()
        const timestampVerified = false  // listing page can't reliably date individual articles

        // Only apply date filter if we actually extracted a date
        if (extracted && !inRange(extracted, range)) continue

        const snippet = extractSnippet(finalHtml, url)

        articles.push({
          id: makeArticleId(url),
          title: text.trim(),
          url,
          sourceKey: this.key,
          sourceName: this.name,
          timestamp,
          timestampVerified,
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

      return { articles }
    } catch (err) {
      return { articles: [], error: String(err) }
    } finally {
      await browser.close()
    }
  }
}
