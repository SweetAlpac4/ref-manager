import { normalizeDoi } from "./duplicates.js"

export const READING_STATUSES = [
  ["unread", "Unread"], ["reading", "Reading"], ["read", "Read"],
]

export const cleanLabels = values => Array.isArray(values)
  ? [...new Set(values.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean))]
  : []

const cleanText = value => typeof value === "string" ? value.trim() || null
  : typeof value === "number" && Number.isFinite(value) ? String(value) : null

const nameFields = ["family", "given", "literal", "suffix", "dropping-particle", "non-dropping-particle"]

export function normalizeReferenceUrl(value) {
  const url = typeof value === "string" ? value.trim() : ""
  if (!/^https?:\/\//i.test(url)) return null
  try {
    new URL(url)
    return url
  } catch {
    return null
  }
}

export function normalizeReferenceMetadata(item) {
  const authors = (Array.isArray(item.authors) ? item.authors : []).filter(value => typeof value === "string" && value.trim())
  const citationAuthors = (Array.isArray(item.citationAuthors) ? item.citationAuthors : authors)
    .filter(value => typeof value === "string" && value.trim())
  const names = Array.isArray(item.authorsStructured) ? item.authorsStructured : []
  return {
    title: cleanText(item.title) ?? "",
    authors,
    citationAuthors,
    contributorRole: item.contributorRole === "editor" ? "editor" : "author",
    authorsStructured: names.filter(name => name && typeof name === "object")
      .map(name => Object.fromEntries(nameFields.filter(key => typeof name[key] === "string").map(key => [key, name[key]])))
      .filter(name => name.literal || name.family || name.given),
    journal: cleanText(item.journal),
    publisher: cleanText(item.publisher),
    year: cleanText(item.year),
    volume: cleanText(item.volume),
    issue: cleanText(item.issue),
    pages: cleanText(item.pages),
    doi: normalizeDoi(item.doi) || null,
    isbn: cleanText(item.isbn),
    type: cleanText(item.type) ?? "article-journal",
    abstract: cleanText(item.abstract),
    url: normalizeReferenceUrl(item.url),
    pdfUrl: normalizeReferenceUrl(item.pdfUrl),
    readingStatus: READING_STATUSES.some(([value]) => value === item.readingStatus) ? item.readingStatus : "unread",
    collections: cleanLabels(item.collections),
    tags: cleanLabels(item.tags),
  }
}
