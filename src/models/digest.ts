import type { Article } from "./article.js"

export interface FetchFailure {
  sourceKey: string
  sourceName: string
  error: string
}

export interface DigestStats {
  collected: number
  afterDateFilter: number
  afterEnhance: number
  afterDedup: number
  inDigest: number
  failures: number
}

export interface DigestSection {
  key: string
  heading: string
  cssClass: string
  articles: Article[]
}

export interface DigestResult {
  dateFrom: Date
  dateTo: Date
  generatedAt: Date
  stats: DigestStats
  sections: DigestSection[]
  failures: FetchFailure[]
}
