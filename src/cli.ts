#!/usr/bin/env bun
import "dotenv/config"
import { Command } from "commander"
import chalk from "chalk"
import { setLogLevel } from "./utils/log.js"
import { run } from "./pipeline/orchestrator.js"

const program = new Command()

program
  .name("accio")
  .description("Agentic AI news digest generator")
  .version("2.0.0")

program
  .command("run")
  .description("Generate an AI news digest for the last 7 days")
  .option("--output <path>",   "Output HTML file path")
  .option("--verbose",         "Include low-importance articles, show LLM reasoning")
  .option("--dry-run",         "Collect and date-filter only, skip LLM phases")
  .option("--debug",           "Show debug logs")
  .action(async (opts) => {
    if (opts.debug) setLogLevel("debug")

    console.log(chalk.bold("\n  Accio AI\n"))
    if (opts.dryRun)  console.log(`  ${chalk.yellow("Mode:")} dry-run`)
    if (opts.verbose) console.log(`  ${chalk.cyan("Mode:")} verbose`)
    console.log()

    try {
      const outputFile = await run({
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
