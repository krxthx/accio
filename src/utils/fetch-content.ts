import { HTTP_TIMEOUT_MS, USER_AGENT } from "../config/constants.js"

/**
 * Fetch a URL and return plain text of its main content.
 * Returns null on any error (timeout, non-200, parse failure).
 */
export async function fetchArticleContent(url: string, maxChars = 4000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    })
    if (!res.ok) return null
    const html = await res.text()
    return extractText(html, maxChars)
  } catch {
    return null
  }
}

function extractText(html: string, maxChars: number): string {
  const text = html
    // Drop non-content blocks
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    // Common HTML entities
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    // Strip remaining tags and collapse whitespace
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return text.slice(0, maxChars)
}
