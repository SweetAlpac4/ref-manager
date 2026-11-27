export const normalizeDoi = value => String(value ?? "").trim().toLowerCase()
  .replace(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/, "")

export const normalizeText = value => String(value ?? "").normalize("NFKD")
  .replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()

const authorKey = item => normalizeText(
  item.authorsStructured?.[0]?.family ?? (item.authors?.[0] ?? "").split(",")[0].trim().split(/\s+/).at(-1),
)

export function duplicateScore(a, b) {
  const firstDoi = normalizeDoi(a.doi)
  const secondDoi = normalizeDoi(b.doi)
  if (firstDoi && secondDoi) return firstDoi === secondDoi ? 3 : 0
  const title = normalizeText(a.title)
  const otherTitle = normalizeText(b.title)
  if (!title || !otherTitle) return 0
  if (a.year && b.year && String(a.year) !== String(b.year)) return 0
  const sameAuthor = authorKey(a) && authorKey(a) === authorKey(b)
  if (title === otherTitle && sameAuthor && a.year && b.year) return 2
  if (title === otherTitle && sameAuthor) return 1
  if (!sameAuthor) return 0
  const words = new Set(title.split(" "))
  const otherWords = new Set(otherTitle.split(" "))
  const common = [...words].filter(word => otherWords.has(word)).length
  return common >= 4 && common / new Set([...words, ...otherWords]).size >= 0.8 ? 1 : 0
}
