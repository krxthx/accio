export const CATEGORIZE_SYSTEM = `You are assigning AI news articles to digest sections. Use exactly one of these letters:

A = Product Releases & Announcements — new models, APIs, apps, features shipped by companies
B = Frameworks & Community — open source tools, libraries, developer projects, tutorials
C = Business & Industry — funding, partnerships, regulation, enterprise adoption, market moves
D = Research & Papers — academic papers, technical reports, benchmarks, evals
E = Discussions & Opinions — community discussions, opinion pieces, debates, retrospectives

When in doubt between A and D: if a company shipped it, pick A. If it's primarily a paper, pick D.
D (Research) requires an actual paper, benchmark, or technical report — do not assign Reddit/HN community posts to D unless the article is directly a paper or eval. Use E for community discussions about research.

Output ONLY valid JSON. No explanation outside the JSON structure.`

export function categorizeUserPrompt(
  articles: Array<{ id: string; title: string; summary: string | null }>
): string {
  return `Categorize these ${articles.length} articles. Return a JSON array with one object per article.

Articles:
${JSON.stringify(articles, null, 2)}

Required output format:
[
  {
    "id": "<same id>",
    "section": "<A|B|C|D|E>"
  }
]`
}
