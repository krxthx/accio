import chalk from "chalk"

type Level = "debug" | "info" | "warn" | "error"

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

let currentLevel: Level = (process.env.LOG_LEVEL as Level) ?? "info"

export function setLogLevel(level: Level) {
  currentLevel = level
}

function log(level: Level, label: string, msg: string, detail?: string) {
  if (LEVELS[level] < LEVELS[currentLevel]) return
  const prefix = {
    debug: chalk.gray("[debug]"),
    info:  chalk.cyan("[info] "),
    warn:  chalk.yellow("[warn] "),
    error: chalk.red("[error]"),
  }[level]
  const line = `${prefix} ${chalk.bold(label.padEnd(14))} ${msg}`
  console.log(line)
  if (detail) console.log(chalk.gray(`              ${detail}`))
}

export const logger = {
  debug: (label: string, msg: string, detail?: string) => log("debug", label, msg, detail),
  info:  (label: string, msg: string, detail?: string) => log("info",  label, msg, detail),
  warn:  (label: string, msg: string, detail?: string) => log("warn",  label, msg, detail),
  error: (label: string, msg: string, detail?: string) => log("error", label, msg, detail),

  step: (phase: string, msg: string) =>
    console.log(`\n${chalk.bold.blue(`▶ ${phase}`)} ${chalk.white(msg)}`),

  stat: (label: string, value: number | string, note?: string) =>
    console.log(`  ${chalk.gray("·")} ${chalk.white(label.padEnd(22))} ${chalk.bold(String(value))}${note ? chalk.gray(` (${note})`) : ""}`),

  success: (msg: string) => console.log(`\n${chalk.green("✓")} ${chalk.bold(msg)}`),
  fail:    (msg: string) => console.log(`\n${chalk.red("✗")} ${chalk.bold(msg)}`),
}
