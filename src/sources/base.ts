import type { Article } from "../models/article.js"
import type { DateRange } from "../utils/dates.js"

export interface FetchResult {
  articles: Article[]
  error?: string
}

export interface Source {
  readonly key: string
  readonly name: string
  fetch(range: DateRange): Promise<FetchResult>
}
