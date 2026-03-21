#!/usr/bin/env bun
import "dotenv/config"
import { Command } from "commander"
import chalk from "chalk"
import { resolveWindow, resolveRange } from "./utils/dates.js"
import { setLogLevel } from "./utils/log.js"
import { run } from "./pipeline/orchestrator.js"

const program = new Command()

program
  .name("accio")
  .description("Agentic AI news digest generator")
  .version("2.0.0")

program
  .command("run")
  .description("Generate an AI news digest for a date range")
  .option("--window <window>", "Shorthand window: 1d | 3d | 7d | 14d | 30d")
  .option("--from <date>",     "Start date YYYY-MM-DD (use with --to)")
  .option("--to <date>",       "End date YYYY-MM-DD (use with --from)")
  .option("--output <path>",   "Output HTML file path")
  .option("--verbose",         "Include low-importance articles, show LLM reasoning")
  .option("--dry-run",         "Collect and date-filter only, skip LLM phases")
  .option("--debug",           "Show debug logs")
  .action(async (opts) => {
    if (opts.debug) setLogLevel("debug")

    // Validate date input
    if (!opts.window && (!opts.from || !opts.to)) {
      console.error(chalk.red("Error: provide either --window or both --from and --to"))
      process.exit(1)
    }
    if (opts.window && (opts.from || opts.to)) {
      console.error(chalk.red("Error: --window and --from/--to are mutually exclusive"))
      process.exit(1)
    }

    let range
    try {
      range = opts.window
        ? resolveWindow(opts.window)
        : resolveRange(opts.from, opts.to)
    } catch (err) {
      console.error(chalk.red(`Error: ${String(err)}`))
      process.exit(1)
    }

    console.log(chalk.bold("\n  Accio AI v2\n"))
    console.log(`  ${chalk.gray("Range:")} ${range.from.toDateString()} → ${range.to.toDateString()}`)
    if (opts.dryRun)  console.log(`  ${chalk.yellow("Mode:")} dry-run`)
    if (opts.verbose) console.log(`  ${chalk.cyan("Mode:")} verbose`)
    console.log()

    try {
      const outputFile = await run({
        range,
        outputPath: opts.output,
        verbose: !!opts.verbose,
        dryRun: !!opts.dryRun,
      })
      console.log(chalk.green(`\n  Open: file://${outputFile}\n`))
    } catch (err) {
      console.error(chalk.red(`\nFatal: ${String(err)}`))
      process.exit(1)
    }
  })

program.parse()
