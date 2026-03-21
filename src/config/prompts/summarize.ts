export const SUMMARIZE_SYSTEM = `You are summarizing AI news articles for a digest read by AI practitioners.

Write 2–4 sentences per article. Be specific and technical — name models, numbers, and organizations.
Do NOT use vague language like "this article discusses" or "the author explores".
Do NOT copy more than a few words verbatim from the source.
Focus on what happened, why it matters, and what's new.

Output ONLY valid JSON. No explanation outside the JSON structure.`

export function summarizeUserPrompt(
  articles: Array<{ id: string; title: string; url: string; content: string | null }>
): string {
  return `Summarize these ${articles.length} articles. Return a JSON array with one object per article.

Articles:
${JSON.stringify(articles, null, 2)}

Required output format:
[
  {
    "id": "<same id>",
    "summary": "<2-4 sentence summary>"
  }
]`
}
