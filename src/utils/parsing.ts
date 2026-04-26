/**
 * Extract JSON from LLM output that may contain markdown fences or prose.
 */
export function extractJSON<T = unknown>(raw: string): T {
  let cleaned = raw.trim()

  // Strip <think>...</think> blocks (reasoning models like DeepSeek, QwQ)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  // Find the first [ or { and last ] or }
  const arrStart = cleaned.indexOf("[")
  const objStart = cleaned.indexOf("{")
  const arrEnd   = cleaned.lastIndexOf("]")
  const objEnd   = cleaned.lastIndexOf("}")

  let jsonStr = cleaned

  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart) && arrEnd !== -1) {
    jsonStr = cleaned.slice(arrStart, arrEnd + 1)
  } else if (objStart !== -1 && objEnd !== -1) {
    jsonStr = cleaned.slice(objStart, objEnd + 1)
  }

  return JSON.parse(jsonStr) as T
}

/**
 * Chunk an array into fixed-size batches.
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

/**
 * Truncate a string to maxLen characters, adding ellipsis if needed.
 */
export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + "..."
}

/**
 * Sleep for ms milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
