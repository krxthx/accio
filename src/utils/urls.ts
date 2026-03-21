const BLOCKED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".mp4", ".mp3",
  ".wav", ".pdf", ".zip", ".tar", ".gz", ".exe", ".dmg",
])

const BLOCKED_PATTERNS = [
  /^file:\/\//,
  /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/,
  /\/cdn-cgi\//,
  /\/static\//,
  /\/assets\//,
  /\/(tag|tags|category|categories|author|authors|page|pages|archive)\/?$/i,
  /\/search(\?|$)/,
  /\?(s|q|query)=/,
]

const BLOCKED_DOMAINS = new Set([
  "fakehackernews.com", "twitter.com", "x.com", "facebook.com",
  "instagram.com", "tiktok.com", "youtube.com", "reddit.com",
  "linkedin.com", "wikipedia.org",
])

const GENERIC_PATHS = new Set(["/", "/blog", "/news", "/articles", "/feed"])

export function isValidArticleUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false

  const domain = parsed.hostname.replace(/^www\./, "")
  if (BLOCKED_DOMAINS.has(domain)) return false

  const path = parsed.pathname.toLowerCase()

  // Block bare extensions
  const ext = path.slice(path.lastIndexOf("."))
  if (BLOCKED_EXTENSIONS.has(ext)) return false

  // Block generic/listing pages
  if (GENERIC_PATHS.has(path) || GENERIC_PATHS.has(path.replace(/\/$/, ""))) return false

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(url)) return false
  }

  return true
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    // Strip tracking params
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content",
                            "utm_term", "ref", "source", "fbclid", "gclid"]
    trackingParams.forEach(p => u.searchParams.delete(p))
    // Strip fragment
    u.hash = ""
    return u.toString()
  } catch {
    return url
  }
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}
