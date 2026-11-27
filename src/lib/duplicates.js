export const normalizeDoi = value => typeof value === "string" ? value.trim().toLowerCase()
  .replace(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/, "") : ""

export const normalizeText = value => String(value ?? "").normalize("NFKD")
  .replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()

const authorKey = item => {
  const structured = item.authorsStructured?.[0]
  if (structured?.literal) return normalizeText(structured.literal)
  if (structured?.family) return normalizeText(structured.family)
  const name = item.citationAuthors?.[0] || item.authors?.[0]
  if (typeof name !== "string") return ""
  return normalizeText(name.includes(",") ? name.split(",")[0] : name.trim().split(/\s+/).at(-1))
}

const bookTypes = new Set(["book", "monograph", "edited-book", "reference-book"])

const canonicalIsbn = value => {
  const raw = String(value ?? "").toUpperCase().replace(/[^\dX]/g, "")
  if (/^\d{9}[\dX]$/.test(raw)) {
    const sum = [...raw].reduce((total, digit, index) => total + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0)
    return sum % 11 === 0 ? `978${raw.slice(0, 9)}` : ""
  }
  if (!/^97[89]\d{10}$/.test(raw)) return ""
  const sum = [...raw].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0)
  return sum % 10 === 0 ? raw.slice(0, 12) : ""
}

export function duplicateScore(a, b) {
  const firstDoi = normalizeDoi(a.doi)
  const secondDoi = normalizeDoi(b.doi)
  if (firstDoi && secondDoi) return firstDoi === secondDoi ? 4 : 0
  const title = normalizeText(a.title)
  const otherTitle = normalizeText(b.title)
  if (!title || !otherTitle) return 0
  if (bookTypes.has(a.type) && bookTypes.has(b.type)) {
    const isbn = canonicalIsbn(a.isbn)
    const otherIsbn = canonicalIsbn(b.isbn)
    if (isbn && otherIsbn && isbn !== otherIsbn) return 0
    if (isbn && isbn === otherIsbn && title === otherTitle) return 3
  }
  if (a.year && b.year && String(a.year) !== String(b.year)) return 0
  const firstAuthor = authorKey(a)
  const secondAuthor = authorKey(b)
  const sameAuthor = firstAuthor && firstAuthor === secondAuthor
  if (title === otherTitle && sameAuthor && a.year && b.year) return 2
  if (title === otherTitle && (sameAuthor || ((!firstAuthor || !secondAuthor) && title.length >= 20))) return 1
  if (!sameAuthor) return 0
  const words = new Set(title.split(" "))
  const otherWords = new Set(otherTitle.split(" "))
  const common = [...words].filter(word => otherWords.has(word)).length
  return common >= 4 && common / new Set([...words, ...otherWords]).size >= 0.8 ? 1 : 0
}
