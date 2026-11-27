import { normalizeDoi, normalizeText } from "./duplicates.js"

export const SMART_COLLECTIONS = [
  ["recent", "Recently added (30 days)"],
  ["unread", "Unread"],
  ["no-doi", "Without DOI"],
  ["no-pdf", "Without local PDF"],
]

export function filterLibrary(items, { query, collection, tag, readingStatus, year, smart }, attachmentIds, now = Date.now()) {
  const terms = normalizeText(query).split(" ").filter(Boolean)
  const recentSince = now - 30 * 24 * 60 * 60 * 1000
  return items.filter(item => {
    const status = item.readingStatus ?? "unread"
    if (readingStatus && status !== readingStatus) return false
    if (collection && !item.collections?.includes(collection)) return false
    if (tag && !item.tags?.includes(tag)) return false
    if (year && String(item.year) !== year) return false
    if (smart === "recent" && !(Date.parse(item.savedAt) >= recentSince)) return false
    if (smart === "unread" && status !== "unread") return false
    if (smart === "no-doi" && normalizeDoi(item.doi)) return false
    if (smart === "no-pdf" && attachmentIds.has(item.id)) return false
    if (!terms.length) return true
    const text = normalizeText([item.title, ...item.authors, item.journal, item.year, item.doi, item.isbn,
      item.abstract, ...(item.collections ?? []), ...(item.tags ?? [])].join(" "))
    return terms.every(term => text.includes(term))
  })
}
