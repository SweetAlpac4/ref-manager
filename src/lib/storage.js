const STORAGE_KEY = "refmanager:library:v1"

// --- validasi skema minimal, dipakai saat baca dari localStorage MAUPUN saat import file ---
// Kalau ada entry yang bentuknya tidak sesuai, entry itu di-skip, bukan bikin seluruh app crash.
const isValidEntry = (item) => {
  return (
    item &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    item.title.trim().length > 0 &&
    Array.isArray(item.authors)
  )
}

const sanitizeEntry = (item) => ({
  id: item.id,
  title: item.title,
  authors: Array.isArray(item.citationAuthors) ? item.citationAuthors : (item.authors || []),
  citationAuthors: Array.isArray(item.citationAuthors) ? item.citationAuthors : (item.authors || []),
  journal: item.journal ?? null,
  year: item.year ?? null,
  volume: item.volume ?? null,
  issue: item.issue ?? null,
  pages: item.pages ?? null,
  doi: item.doi ?? null,
  isbn: item.isbn ?? null,
  type: item.type ?? "article-journal",
  abstract: item.abstract ?? null,
  savedAt: item.savedAt ?? new Date().toISOString(),
})

const readRaw = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidEntry)
  } catch {
    // data korup / bukan JSON valid -> anggap kosong, jangan crash app
    return []
  }
}

const writeRaw = (items) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    return true
  } catch {
    // kemungkinan quota localStorage penuh
    return false
  }
}

export const getLibrary = () => readRaw()

export const isInLibrary = (doi) => {
  if (!doi) return false
  return readRaw().some(item => item.doi === doi)
}

export const saveToLibrary = (metadata) => {
  const items = readRaw()
  // hindari duplikat berdasarkan DOI (kalau ada)
  if (metadata.doi && items.some(item => item.doi === metadata.doi)) {
    return { ok: false, reason: "duplicate" }
  }
  const entry = sanitizeEntry({
    ...metadata,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  })
  const next = [entry, ...items]
  const ok = writeRaw(next)
  return { ok, reason: ok ? null : "storage_full" }
}

export const removeFromLibrary = (id) => {
  const items = readRaw().filter(item => item.id !== id)
  return writeRaw(items)
}

export const clearLibrary = () => writeRaw([])

// --- Export ---

const escapeBibtex = (str) => (str || "").replace(/[{}]/g, "")

const bibtexKey = (item) => {
  const firstAuthor = (item.citationAuthors?.[0] || item.authors?.[0] || "unknown").split(" ").pop()
  return `${firstAuthor}${item.year || ""}`.replace(/[^a-zA-Z0-9]/g, "")
}

export const toBibtex = (item) => {
  const key = bibtexKey(item)
  const authors = (item.citationAuthors || item.authors || []).join(" and ")
  const type = item.type === "book" || item.type === "edited-book" ? "book" : "article"
  const fields = [
    ["title", item.title],
    ["author", authors],
    [type === "book" ? "publisher" : "journal", item.journal],
    ["year", item.year],
    ["volume", item.volume],
    ["number", item.issue],
    ["pages", item.pages],
    ["doi", item.doi],
    ["isbn", item.isbn],
  ].filter(([, v]) => v)

  const body = fields.map(([k, v]) => `  ${k} = {${escapeBibtex(String(v))}}`).join(",\n")
  return `@${type}{${key},\n${body}\n}`
}

export const exportLibraryAsBibtex = () => {
  const items = readRaw()
  return items.map(toBibtex).join("\n\n")
}

export const toRis = (item) => {
  const type = item.type === "book" || item.type === "edited-book" ? "BOOK" : "JOUR"
  const lines = [`TY  - ${type}`]
  for (const author of (item.citationAuthors || item.authors || [])) {
    lines.push(`AU  - ${author}`)
  }
  if (item.title) lines.push(`TI  - ${item.title}`)
  if (item.journal) lines.push(`${type === "BOOK" ? "PB" : "JO"}  - ${item.journal}`)
  if (item.year) lines.push(`PY  - ${item.year}`)
  if (item.volume) lines.push(`VL  - ${item.volume}`)
  if (item.issue) lines.push(`IS  - ${item.issue}`)
  if (item.pages) lines.push(`SP  - ${item.pages}`)
  if (item.doi) lines.push(`DO  - ${item.doi}`)
  if (item.isbn) lines.push(`SN  - ${item.isbn}`)
  lines.push("ER  - ")
  return lines.join("\n")
}

export const exportLibraryAsRis = () => {
  const items = readRaw()
  return items.map(toRis).join("\n\n")
}

export const exportLibraryAsJson = () => {
  return JSON.stringify(readRaw(), null, 2)
}

// --- Import ---
// Mengembalikan { added, skipped, duplicates } supaya UI bisa kasih feedback jelas.
export const importLibraryFromJson = (jsonText) => {
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return { ok: false, error: "File bukan JSON yang valid." }
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Format JSON tidak sesuai (harus berupa array referensi)." }
  }

  const existing = readRaw()
  const existingDois = new Set(existing.map(i => i.doi).filter(Boolean))
  let added = 0, skipped = 0, duplicates = 0

  const toAdd = []
  for (const raw of parsed) {
    if (!isValidEntry({ ...raw, id: raw?.id ?? "tmp" })) { skipped++; continue }
    if (raw.doi && existingDois.has(raw.doi)) { duplicates++; continue }
    if (raw.doi) existingDois.add(raw.doi)
    toAdd.push(sanitizeEntry({ ...raw, id: crypto.randomUUID(), savedAt: new Date().toISOString() }))
    added++
  }

  const ok = writeRaw([...toAdd, ...existing])
  return { ok, added, skipped, duplicates }
}
