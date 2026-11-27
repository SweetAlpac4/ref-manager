import Dexie from "dexie"
import { duplicateScore, normalizeDoi } from "./duplicates.js"

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
  authorsStructured: Array.isArray(item.authorsStructured) ? item.authorsStructured : null,
  journal: item.journal ?? null,
  year: item.year ?? null,
  volume: item.volume ?? null,
  issue: item.issue ?? null,
  pages: item.pages ?? null,
  doi: normalizeDoi(item.doi) || null,
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
  return (await getSavedDois()).has(normalizeDoi(doi))
}

// Batch version — jauh lebih cepat daripada memanggil isInLibrary() satu-satu
// dalam loop (mis. untuk menandai status "Tersimpan" di hasil batch search).
export const getSavedDois = async () => {
  const items = await db.references.toArray()
  return new Set(items.map(i => normalizeDoi(i.doi)).filter(Boolean))
}

export const saveToLibrary = async (metadata) => {
  try {
    return await db.transaction("rw", db.references, async () => {
      const entries = await db.references.toArray()
      if (entries.some(item => duplicateScore(item, metadata) >= 2)) {
        return { ok: false, reason: "duplicate" }
      }
      await db.references.add(sanitizeEntry({ ...metadata, id: crypto.randomUUID() }))
      return { ok: true, reason: null }
    })
  } catch {
    return { ok: false, reason: "storage_full" }
  }
}

export const mergeReferences = async (keepId, otherId) => {
  if (keepId === otherId) return false
  return db.transaction("rw", db.references, async () => {
    const [keep, other] = await db.references.bulkGet([keepId, otherId])
    if (!keep || !other) return false
    for (const key of ["journal", "year", "volume", "issue", "pages", "doi", "isbn", "abstract"]) {
      if (!keep[key] && other[key]) keep[key] = other[key]
    }
    if (!keep.authors.length) {
      keep.authors = other.authors
      keep.citationAuthors = other.citationAuthors
      keep.authorsStructured = other.authorsStructured
    }
    await db.references.put(keep)
    await db.references.delete(otherId)
    return true
  })
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

// CrossRef/DataCite pakai banyak istilah 'type' (journal-article, proceedings-article,
// book-chapter, dst) — sebelumnya semua disederhanakan jadi article/book saja, padahal
// BibTeX & RIS punya entry type yang lebih tepat untuk masing-masing.
const BIBTEX_TYPE_MAP = {
  'journal-article': 'article',
  'proceedings-article': 'inproceedings',
  'book-chapter': 'incollection',
  'book': 'book',
  'monograph': 'book',
  'edited-book': 'book',
  'reference-book': 'book',
  'report': 'techreport',
  'dissertation': 'phdthesis',
  'posted-content': 'misc',
  'dataset': 'misc',
  'software': 'misc',
  'other': 'misc',
}

const RIS_TYPE_MAP = {
  'journal-article': 'JOUR',
  'proceedings-article': 'CPAPER',
  'book-chapter': 'CHAP',
  'book': 'BOOK',
  'monograph': 'BOOK',
  'edited-book': 'BOOK',
  'reference-book': 'BOOK',
  'report': 'RPRT',
  'dissertation': 'THES',
  'posted-content': 'GEN',
  'dataset': 'DATA',
  'software': 'COMP',
  'other': 'GEN',
}

const bibtexKey = (item) => {
  const firstAuthor = (item.citationAuthors?.[0] || item.authors?.[0] || "unknown").split(" ").pop()
  return `${firstAuthor}${item.year || ""}`.replace(/[^a-zA-Z0-9]/g, "")
}

export const toBibtex = (item, keyOverride = null) => {
  const key = keyOverride || bibtexKey(item)
  const authors = (item.citationAuthors || item.authors || []).join(" and ")
  const type = BIBTEX_TYPE_MAP[item.type] || "article"

  // field "container" beda nama tergantung jenis (journal / booktitle / institution / publisher)
  const containerField = type === "inproceedings" || type === "incollection"
    ? "booktitle"
    : type === "techreport" ? "institution"
    : type === "book" ? "publisher"
    : "journal"

  const fields = [
    ["title", item.title],
    ["author", authors],
    [containerField, item.journal],
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
  const type = RIS_TYPE_MAP[item.type] || "JOUR"
  const lines = [`TY  - ${type}`]
  for (const author of (item.citationAuthors || item.authors || [])) {
    lines.push(`AU  - ${author}`)
  }
  if (item.title) lines.push(`TI  - ${item.title}`)
  if (item.journal) {
    // JO untuk jurnal, PB untuk penerbit (buku/laporan), T2 untuk judul induk (prosiding/bab buku)
    const containerCode = type === "JOUR" ? "JO"
      : (type === "BOOK" || type === "RPRT") ? "PB"
      : "T2"
    lines.push(`${containerCode}  - ${item.journal}`)
  }
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
  const usedKeys = new Set()
  return items.map(item => {
    const baseKey = bibtexKey(item)
    let key = baseKey
    let suffixCode = 0
    while (usedKeys.has(key)) {
      key = baseKey + String.fromCharCode(97 + suffixCode) // a, b, c, ...
      suffixCode++
    }
    usedKeys.add(key)
    return toBibtex(item, key)
  }).join("\n\n")
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

  try {
    return await db.transaction("rw", db.references, async () => {
      const existing = await db.references.toArray()
      const toAdd = []
      let skipped = 0, duplicates = 0
      for (const raw of parsed) {
        if (!isValidEntry({ ...raw, id: raw?.id ?? "tmp" })) { skipped++; continue }
        if (existing.some(item => duplicateScore(item, raw) >= 2)) { duplicates++; continue }
        const entry = sanitizeEntry({ ...raw, id: crypto.randomUUID() })
        existing.push(entry)
        toAdd.push(entry)
      }
      await db.references.bulkAdd(toAdd)
      return { ok: true, added: toAdd.length, skipped, duplicates }
    })
  } catch {
    return { ok: false, error: "Gagal menulis ke penyimpanan lokal." }
  }
}
