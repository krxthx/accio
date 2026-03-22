import { DIGEST_WINDOW_DAYS } from "../config/constants.js"

export interface DateRange {
  from: Date
  to: Date
}

export function digestWindow(): DateRange {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - DIGEST_WINDOW_DAYS)
  return { from, to }
}

export function inRange(date: Date | null, range: DateRange, toleranceHours = 6): boolean {
  if (!date) return false
  const slackMs = toleranceHours * 60 * 60 * 1000
  return date.getTime() >= range.from.getTime() - slackMs &&
         date.getTime() <= range.to.getTime() + slackMs
}

export function formatDateRange(range: DateRange): string {
  const fmt = (d: Date) => d.toISOString().split("T")[0]
  return `${fmt(range.from)} → ${fmt(range.to)}`
}

export function formatDate(d: Date): string {
  return d.toISOString().split("T")[0]
}

