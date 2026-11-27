import { getDocument, GlobalWorkerOptions } from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url"
import { normalizeText } from "./duplicates.js"

GlobalWorkerOptions.workerSrc = workerUrl

export const openPdf = data => getDocument({ data, isEvalSupported: false })

export async function getPageText(pdf, page) {
  const content = await (await pdf.getPage(page)).getTextContent()
  return content.items.map(item => item.str ?? "").join(" ")
}

export function findTextInPage(text, normalizedQuery) {
  if (!normalizeText(text).includes(normalizedQuery)) return null
  // Keep original spelling in the snippet while matching across line and punctuation boundaries.
  const words = text.trim().split(/\s+/)
  const queryStart = normalizedQuery.split(" ")[0]
  const matchIndex = words.findIndex(word => normalizeText(word).includes(queryStart))
  const start = Math.max(0, matchIndex - 5)
  const end = start + 22
  return `${start > 0 ? "…" : ""}${words.slice(start, end).join(" ")}${end < words.length ? "…" : ""}`
}
