/**
 * Test script: verify that <think> tags are stripped from LLM responses
 * and that JSON extraction still works correctly.
 *
 * Usage: bun run scripts/test-think-tags.ts
 */
import "dotenv/config"
import { getLLM } from "../src/llm/index.js"
import { extractJSON } from "../src/utils/parsing.js"

const SYSTEM = `You are a JSON API. Output ONLY valid JSON. No explanation, no markdown, no prose.`

const PROMPT = `Return a JSON object with two fields:
- "message": the string "hello world"
- "status": the number 42`

async function main() {
  const llm = getLLM()
  console.log(`LLM: ${llm.name}\n`)

  // ── Test 1: unit test extractJSON strips think tags ───────────────────────
  console.log("=== Test 1: extractJSON strips <think> tags (unit) ===")
  const mockResponses = [
    {
      label: "think block before JSON",
      raw: `<think>Let me think about this carefully...</think>\n{"message": "hello world", "status": 42}`,
    },
    {
      label: "think block with no closing tag (truncated)",
      raw: `<think>thinking...\n{"message": "hello world", "status": 42}`,
    },
    {
      label: "THINK uppercase",
      raw: `<THINK>uppercase block</THINK>\n{"message": "hello world", "status": 42}`,
    },
    {
      label: "no think tags (baseline)",
      raw: `{"message": "hello world", "status": 42}`,
    },
  ]

  let allPassed = true
  for (const { label, raw } of mockResponses) {
    try {
      const result = extractJSON<{ message: string; status: number }>(raw)
      const ok = result.message === "hello world" && result.status === 42
      console.log(`  ${ok ? "✓" : "✗"} ${label}`)
      if (!ok) {
        console.log(`    got: ${JSON.stringify(result)}`)
        allPassed = false
      }
    } catch (e) {
      console.log(`  ✗ ${label} — threw: ${e}`)
      allPassed = false
    }
  }

  // ── Test 2: live LLM call — response parses as valid JSON ─────────────────
  console.log("\n=== Test 2: live LLM call ===")
  console.log(`Sending prompt to ${llm.name}...`)
  const raw = await llm.generate(PROMPT, { systemPrompt: SYSTEM })

  console.log("\nRaw response (after stripThinking in LLM client):")
  console.log("─".repeat(60))
  console.log(raw)
  console.log("─".repeat(60))

  try {
    const parsed = extractJSON<{ message: string; status: number }>(raw)
    const ok = parsed.message === "hello world" && parsed.status === 42
    console.log(`\n${ok ? "✓" : "✗"} Parsed correctly: ${JSON.stringify(parsed)}`)
    if (!ok) allPassed = false
  } catch (e) {
    console.log(`\n✗ JSON parse failed: ${e}`)
    allPassed = false
  }

  console.log(`\n${"─".repeat(60)}`)
  console.log(allPassed ? "All tests passed." : "Some tests FAILED.")
  process.exit(allPassed ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
