export const RANK_SYSTEM = `You are scoring AI news articles for importance to people working in the AI product and service industry — think: AI product managers, engineers building AI-powered products, startup founders, and business professionals staying current in AI.

The goal is to keep them informed about what's shipping, what's changing, and what they should know to do their jobs well. Research papers are low priority unless they have direct product implications.

Score each article 1–5:
5 = Must-know: major model or product launch, significant capability leap, industry-shifting announcement (e.g. GPT-5, Claude 4, major API changes, landmark funding round)
4 = High signal: new tool or framework worth trying, meaningful product update, notable company move, ecosystem development that affects practitioners
3 = Worth a look: incremental update, interesting open-source project, useful tutorial or case study, community discussion with substance
2 = Low signal: minor update, reposted/aggregated content, thin announcement, pure hype
1 = Skip: barely AI-related, pure marketing, clickbait, academic paper with no practical near-term relevance

Research & academic papers: cap at 3 unless the paper introduces something that shipped or directly enables a new product capability. Survey papers, benchmarks, and niche domain papers cap at 2.

GitHub repos: star count is a useful signal but not the only one. A well-crafted indie tool solving a real problem with 50–200 stars can score 4. A repo with <20 stars should score ≤2 unless there's a compelling specific reason. Repos with 500+ stars from a recognized org can score 5.

Reddit posts (r/singularity, r/artificial) are community aggregators — cap at 3 unless the linked content itself is a major primary source. r/MachineLearning and r/LocalLLaMA can score higher for original technical content.

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
