/**
 * LLM smoke test: verifies the configured provider can do both
 * a plain text generation call and an agent-loop/tool-calling round trip.
 *
 * Usage:
 *   bun run scripts/test-llm.ts
 *   bun run test:llm
 */
import "dotenv/config"
import { getLLM } from "../src/llm/index.js"

const ECHO_TOOL = {
  name: "echo",
  description: "Echo a short string back to the model.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to echo" },
    },
    required: ["text"],
  },
} as const

function mask(value: string | undefined): string {
  if (!value) return "<unset>"
  return `<set len=${value.length}>`
}

async function main() {
  const llm = getLLM()

  console.log(`LLM: ${llm.name}`)
  console.log(`Provider: ${process.env.LLM_PROVIDER ?? "openai-compat"}`)
  if ((process.env.LLM_PROVIDER ?? "openai-compat") === "openai-compat") {
    console.log(`Base URL: ${process.env.OPENAI_COMPAT_BASE_URL ?? "<unset>"}`)
    console.log(`Model: ${process.env.OPENAI_COMPAT_MODEL ?? "<unset>"}`)
    console.log(`API key: ${mask(process.env.OPENAI_COMPAT_API_KEY)}`)
  } else {
    console.log(`Model: ${process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001"}`)
    console.log(`API key: ${mask(process.env.ANTHROPIC_API_KEY)}`)
  }

  console.log("\n=== Test 1: generate ===")
  try {
    const output = await llm.generate("Reply with exactly: OK")
    console.log(`Success: ${JSON.stringify(output)}`)
  } catch (err) {
    console.error(`Generate failed: ${String(err)}`)
    process.exit(1)
  }

  if (!llm.supportsToolCalling) {
    console.log("\nTool calling not supported by this client. Done.")
    return
  }

  console.log("\n=== Test 2: agent loop ===")
  try {
    const output = await llm.runAgentLoop(
      "Use the echo tool once, then answer with exactly: AGENT_OK",
      "Call the tool with text='hello', then finish.",
      [ECHO_TOOL],
      async (_toolName, toolInput) => {
        const { text } = toolInput as { text: string }
        return `echo:${text}`
      },
      { maxTurns: 4 }
    )
    console.log(`Success: ${JSON.stringify(output)}`)
  } catch (err) {
    console.error(`Agent loop failed: ${String(err)}`)
    process.exit(1)
  }

  console.log("\nAll LLM smoke tests passed.")
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
