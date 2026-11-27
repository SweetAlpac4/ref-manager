import Dexie from "dexie"
import { duplicateScore } from "./duplicates.js"
import { cleanLabels, normalizeReferenceMetadata, READING_STATUSES } from "./referenceMetadata.js"

export { READING_STATUSES }

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

db.version(2).stores({
  references: "id, doi, savedAt",
  notes: "id, *referenceIds, updatedAt",
})

db.version(3).stores({
  references: "id, doi, savedAt",
  notes: "id, *referenceIds, updatedAt",
  attachments: "id, referenceId",
})

export const getAllAttachments = () => db.attachments.toArray()

export const getAttachments = referenceId =>
  db.attachments.where("referenceId").equals(referenceId).toArray()

export const attachPdf = async (referenceId, file) => {
  const header = await file.slice(0, 1024).text()
  if (!header.includes("%PDF-")) throw new Error("Choose a valid PDF file.")
  return db.transaction("rw", db.references, db.attachments, async () => {
    if (!await db.references.get(referenceId)) throw new Error("Reference not found.")
    return db.attachments.add({
      id: crypto.randomUUID(), referenceId, name: file.name,
      file: file.slice(0, file.size, "application/pdf"),
    })
  })
}

export const deleteAttachment = id => db.attachments.delete(id)

export const editPdfAnnotations = async (attachmentId, edit) =>
  db.transaction("rw", db.attachments, async () => {
    const attachment = await db.attachments.get(attachmentId)
    if (!attachment) throw new Error("Attachment not found.")
    const annotations = edit(attachment.annotations ?? [])
    await db.attachments.update(attachmentId, { annotations })
    return annotations
  })

export const NOTE_KINDS = [
  ["note", "Note"], ["insight", "Research insight"], ["excerpt", "Excerpt"],
]

export const getNotes = async referenceId => {
  if (!referenceId) return db.notes.orderBy("updatedAt").reverse().toArray()
  const notes = await db.notes.where("referenceIds").equals(referenceId).toArray()
  return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const saveNote = async ({ id, title, body, kind, referenceIds }) =>
  db.transaction("rw", db.notes, db.references, async () => {
    if (!title.trim() || !body.trim()) throw new Error("Enter a title and note.")
    if (id && !await db.notes.get(id)) throw new Error("Note not found.")
    const ids = [...new Set(referenceIds)]
    const references = await db.references.bulkGet(ids)
    if (references.some(reference => !reference)) throw new Error("The linked references have changed. Reload the note.")
    await db.notes.put({
      id: id ?? crypto.randomUUID(), title: title.trim(), body: body.trim(),
      kind: NOTE_KINDS.some(([value]) => value === kind) ? kind : "note",
      referenceIds: ids, updatedAt: new Date().toISOString(),
    })
  })

export const deleteNote = id => db.notes.delete(id)

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

const sanitizeEntry = item => ({
  id: item.id,
  ...normalizeReferenceMetadata(item),
  savedAt: typeof item.savedAt === "string" && Number.isFinite(Date.parse(item.savedAt))
    ? item.savedAt : new Date().toISOString(),
})

export const getLibrary = async () => {
  const items = await db.references.orderBy("savedAt").reverse().toArray()
  return items.filter(isValidEntry)
}

export const getSavedMatches = async candidates => {
  const items = await db.references.toArray()
  return new Set(candidates.filter(candidate => items.some(item => duplicateScore(item, candidate) >= 2)))
}

export const saveToLibrary = async (metadata) => {
  try {
    return await db.transaction("rw", db.references, async () => {
      const entries = await db.references.toArray()
      if (entries.some(item => duplicateScore(item, metadata) >= 2)) {
        return { ok: false, reason: "duplicate" }
      }
      const entry = sanitizeEntry({ ...metadata, id: crypto.randomUUID() })
      if (!isValidEntry(entry)) return { ok: false, reason: "invalid" }
      await db.references.add(entry)
      return { ok: true, reason: null }
    })
  } catch {
    return { ok: false, reason: "storage_full" }
  }
}

export const updateReference = async (id, changes) => db.transaction("rw", db.references, async () => {
  const current = await db.references.get(id)
  if (!current) throw new Error("Reference not found.")
  const updated = sanitizeEntry({ ...current, ...changes, id })
  if (!isValidEntry(updated)) throw new Error("Title is required.")
  await db.references.update(id, updated)
  return { ...current, ...updated }
})

export const mergeReferences = async (keepId, otherId) => {
  if (keepId === otherId) return false
  return db.transaction("rw", db.references, db.notes, db.attachments, async () => {
    const [keep, other] = await db.references.bulkGet([keepId, otherId])
    if (!keep || !other) return false
    for (const key of ["journal", "publisher", "year", "volume", "issue", "pages", "doi", "isbn", "abstract", "url", "pdfUrl"]) {
      if (!keep[key] && other[key]) keep[key] = other[key]
    }
    if (!keep.authors.length) {
      keep.contributorRole = other.contributorRole
      keep.authors = other.authors
      keep.citationAuthors = other.citationAuthors
      keep.authorsStructured = other.authorsStructured
    }
    keep.collections = cleanLabels([...(keep.collections ?? []), ...(other.collections ?? [])])
    keep.tags = cleanLabels([...(keep.tags ?? []), ...(other.tags ?? [])])
    const status = READING_STATUSES.map(([value]) => value)
    if (status.indexOf(other.readingStatus) > status.indexOf(keep.readingStatus)) keep.readingStatus = other.readingStatus
    await db.notes.where("referenceIds").equals(otherId).modify(note => {
      note.referenceIds = [...new Set(note.referenceIds.map(id => id === otherId ? keepId : id))]
    })
    await db.attachments.where("referenceId").equals(otherId).modify({ referenceId: keepId })
    await db.references.put(keep)
    await db.references.delete(otherId)
    return true
  })
}

const deleteReferences = async ids => {
  try {
    await db.transaction("rw", db.references, db.notes, db.attachments, async () => {
      const removed = new Set(ids ?? await db.references.toCollection().primaryKeys())
      await db.notes.where("referenceIds").anyOf([...removed]).distinct().modify(note => {
        note.referenceIds = note.referenceIds.filter(id => !removed.has(id))
      })
      await db.attachments.where("referenceId").anyOf([...removed]).delete()
      await db.references.bulkDelete([...removed])
    })
    return true
  } catch {
    return false
  }
}

export const removeFromLibrary = id => deleteReferences([id])
export const removeManyFromLibrary = ids => deleteReferences(ids)
export const clearLibrary = () => deleteReferences()

export const getWorkspace = () => db.transaction("r", db.references, db.notes, db.attachments, async () => ({
  references: await getLibrary(),
  notes: await db.notes.toArray(),
  attachments: await db.attachments.toArray(),
}))

export const restoreWorkspace = ({ references, notes, attachments }) =>
  db.transaction("rw", db.references, db.notes, db.attachments, async () => {
    const local = await getLibrary()
    const referenceIds = new Map()
    const localById = new Map(local.map(item => [item.id, item]))
    const added = { references: 0, notes: 0, attachments: 0 }

    for (const item of references) {
      if (!isValidEntry(item)) throw new Error("The backup contains an invalid reference.")
      const entry = sanitizeEntry(item)
      const match = localById.get(item.id) ?? local.find(existing => duplicateScore(existing, entry) >= 2)
      referenceIds.set(item.id, match?.id ?? item.id)
      if (match) {
        const current = await db.references.get(match.id)
        await db.references.update(match.id, {
          collections: cleanLabels([...(current.collections ?? []), ...entry.collections]),
          tags: cleanLabels([...(current.tags ?? []), ...entry.tags]),
        })
      } else {
        await db.references.add(entry)
        added.references++
      }
    }

    for (const note of notes) {
      if (await db.notes.get(note.id)) continue
      await db.notes.add({
        ...note,
        referenceIds: [...new Set(note.referenceIds.map(id => referenceIds.get(id)))],
      })
      added.notes++
    }

    for (const attachment of attachments) {
      if (await db.attachments.get(attachment.id)) continue
      await db.attachments.add({ ...attachment, referenceId: referenceIds.get(attachment.referenceId) })
      added.attachments++
    }
    return added
  })

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
    return { ok: false, error: "The file is not valid JSON." }
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "The JSON file must contain an array of references." }
  }

  try {
    return await db.transaction("rw", db.references, async () => {
      const existing = await db.references.toArray()
      const toAdd = []
      let skipped = 0, duplicates = 0
      for (const raw of parsed) {
        if (!isValidEntry({ ...raw, id: raw?.id ?? "tmp" })) { skipped++; continue }
        const entry = sanitizeEntry({ ...raw, id: crypto.randomUUID() })
        if (existing.some(item => duplicateScore(item, entry) >= 2)) { duplicates++; continue }
        existing.push(entry)
        toAdd.push(entry)
      }
      await db.references.bulkAdd(toAdd)
      return { ok: true, added: toAdd.length, skipped, duplicates }
    })
  } catch {
    return { ok: false, error: "Could not write to local storage." }
  }
}
