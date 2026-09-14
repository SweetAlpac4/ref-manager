import Dexie from "dexie"

// --- Database ---
// IndexedDB dipakai untuk data yang bisa berkembang besar (referensi + metadata).
// localStorage sengaja TIDAK dipakai lagi untuk ini karena:
// 1. Setiap update harus baca-ubah-tulis seluruh isi library sekaligus (lambat & rawan race condition)
// 2. Batas ukuran ~5-10MB gampang kena kalau nanti ada abstract, tags, notes, dsb dalam jumlah banyak
// 3. IndexedDB bisa query/update satu record saja, dan punya index (mis. by doi) untuk cek duplikat cepat
export const db = new Dexie("RefManagerDB")
db.version(1).stores({
  // "id" primary key, "doi" & "savedAt" di-index karena sering dipakai untuk query/cek duplikat/urutan
  references: "id, doi, savedAt",
})

// --- Validasi & sanitasi skema minimal ---
// Dipakai saat baca dari DB maupun saat import file, supaya entry yang bentuknya
// tidak sesuai di-skip (bukan bikin seluruh app crash).
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

export const getLibrary = async () => {
  const items = await db.references.orderBy("savedAt").reverse().toArray()
  return items.filter(isValidEntry)
}

export const isInLibrary = async (doi) => {
  if (!doi) return false
  const count = await db.references.where("doi").equals(doi).count()
  return count > 0
}

// Batch version — jauh lebih cepat daripada memanggil isInLibrary() satu-satu
// dalam loop (mis. untuk menandai status "Tersimpan" di hasil batch search).
export const getSavedDois = async () => {
  const items = await db.references.toArray()
  return new Set(items.map(i => i.doi).filter(Boolean))
}

export const saveToLibrary = async (metadata) => {
  if (metadata.doi) {
    const existing = await db.references.where("doi").equals(metadata.doi).count()
    if (existing > 0) return { ok: false, reason: "duplicate" }
  }
  const entry = sanitizeEntry({
    ...metadata,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  })
  try {
    await db.references.add(entry)
    return { ok: true, reason: null }
  } catch {
    return { ok: false, reason: "storage_full" }
  }
}

export const removeFromLibrary = async (id) => {
  try {
    await db.references.delete(id)
    return true
  } catch {
    return false
  }
}

// Hapus banyak sekaligus (dipakai tombol "Hapus yang Dipilih")
export const removeManyFromLibrary = async (ids) => {
  try {
    await db.references.bulkDelete(ids)
    return true
  } catch {
    return false
  }
}

export const clearLibrary = async () => {
  try {
    await db.references.clear()
    return true
  } catch {
    return false
  }
}

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

const resolveExportItems = async (ids) => {
  if (!ids) return getLibrary()
  const items = await db.references.bulkGet(ids)
  return items.filter(Boolean)
}

export const exportLibraryAsBibtex = async (ids = null) => {
  const items = await resolveExportItems(ids)
  return items.map(toBibtex).join("\n\n")
}

export const exportLibraryAsRis = async (ids = null) => {
  const items = await resolveExportItems(ids)
  return items.map(toRis).join("\n\n")
}

export const exportLibraryAsJson = async (ids = null) => {
  const items = await resolveExportItems(ids)
  return JSON.stringify(items, null, 2)
}

// --- Import ---
// Mengembalikan { added, skipped, duplicates } supaya UI bisa kasih feedback jelas.
export const importLibraryFromJson = async (jsonText) => {
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return { ok: false, error: "File bukan JSON yang valid." }
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Format JSON tidak sesuai (harus berupa array referensi)." }
  }

  const existingDois = await getSavedDois()
  let added = 0, skipped = 0, duplicates = 0
  const toAdd = []

  for (const raw of parsed) {
    if (!isValidEntry({ ...raw, id: raw?.id ?? "tmp" })) { skipped++; continue }
    if (raw.doi && existingDois.has(raw.doi)) { duplicates++; continue }
    if (raw.doi) existingDois.add(raw.doi)
    toAdd.push(sanitizeEntry({ ...raw, id: crypto.randomUUID(), savedAt: new Date().toISOString() }))
    added++
  }

  try {
    await db.references.bulkAdd(toAdd)
    return { ok: true, added, skipped, duplicates }
  } catch {
    return { ok: false, error: "Gagal menulis ke penyimpanan lokal." }
  }
}
