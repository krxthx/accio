export interface DateRange {
  from: Date
  to: Date
}

type Window = "1d" | "3d" | "7d" | "14d" | "30d"

export function resolveWindow(window: Window): DateRange {
  const days: Record<Window, number> = { "1d": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30 }
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - days[window])
  return { from, to }
}

export function resolveRange(fromStr: string, toStr: string): DateRange {
  const from = new Date(fromStr)
  const to = new Date(toStr)
  // Set to end of day for the 'to' date
  to.setHours(23, 59, 59, 999)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new Error(`Invalid date range: ${fromStr} → ${toStr}`)
  }
  if (from >= to) {
    throw new Error(`--from must be before --to`)
  }
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

export function parseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}
