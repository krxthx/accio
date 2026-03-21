export const RANK_SYSTEM = `You are scoring AI news articles for importance to AI practitioners (engineers, researchers, builders).

Score each article 1–5:
5 = Major development: new model release, breakthrough research, significant industry shift
4 = Notable: useful tool/framework, interesting research, meaningful company news
3 = Relevant: good community discussion, incremental update, useful tutorial
2 = Low signal: opinion piece, minor update, reposted/aggregated content
1 = Skip: barely AI-related, pure marketing, clickbait

Be strict. Most articles should score 2–4. Reserve 5 for genuine milestones.

Output ONLY valid JSON. No explanation outside the JSON structure.`

export function rankUserPrompt(
  articles: Array<{ id: string; title: string; snippet: string | null }>
): string {
  return `Score these ${articles.length} articles. Return a JSON array with one object per article.

Articles:
${JSON.stringify(articles, null, 2)}

Required output format:
[
  {
    "id": "<same id>",
    "score": <1-5>,
    "justification": "<one sentence why>"
  }
]`
}
