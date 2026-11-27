import assert from "node:assert/strict"
import { test } from "node:test"
import "fake-indexeddb/auto"
import { cloudDraft, rebaseCloudDraft } from "./src/lib/cloudChanges.js"
import { findUncopiedReferences } from "./src/lib/cloudCopies.js"
import { filterLibrary } from "./src/lib/libraryFilters.js"
import { normalizeReferenceMetadata } from "./src/lib/referenceMetadata.js"
import {
  attachPdf, db, editPdfAnnotations, exportLibraryAsJson, getAttachmentReferenceIds, getLibrary,
  getWorkspace, importLibraryFromJson, saveNote, saveToLibrary,
} from "./src/lib/storage.js"
import { exportWorkspaceBackup, importWorkspaceBackup } from "./src/lib/workspaceBackup.js"

test("cloud copy omits matching DOIs and known works without a DOI", () => {
  const local = [
    { id: "doi", title: "Local title", doi: "https://doi.org/10.1234/Paper" },
    { id: "book", title: "Research handbook", authors: ["Jane Doe"], year: "2020" },
    { id: "other-doi", title: "Different work", doi: "10.1234/other" },
    { id: "edition", title: "Research handbook", authors: ["Jane Doe"], year: "2024" },
  ]
  const cloud = [
    { title: "Corrected title", doi: "10.1234/paper" },
    { title: "Research Handbook", authorsStructured: [{ family: "Doe" }], year: "2020" },
    { title: "Different work", doi: "10.1234/different" },
  ]
  assert.deepEqual(findUncopiedReferences(local, cloud).map(item => item.id), ["other-doi", "edition"])
})

test("cloud conflict recovery keeps independent changes and shows overlapping edits", () => {
  const base = {
    revision: 1,
    metadata: normalizeReferenceMetadata({ title: "Original", year: "2024", tags: ["Existing"] }),
    personal_note: "Original note",
  }
  const latest = {
    revision: 2,
    metadata: { ...base.metadata, title: "Other title", tags: ["Remote"] },
    personal_note: "Other note",
  }
  const draft = cloudDraft(base, { metadata: { title: "Draft title", year: 2026, tags: ["Existing"] }, note: "Draft note" })
  assert.deepEqual(draft, { metadata: { title: "Draft title", year: "2026" }, note: "Draft note" })
  const keepLatest = rebaseCloudDraft(base, latest, draft)
  assert.deepEqual(keepLatest.changes, { metadata: { year: "2026" } })
  assert.deepEqual(keepLatest.conflicts, [
    { field: "title", latest: "Other title", draft: "Draft title" },
    { field: "Cloud note", latest: "Other note", draft: "Draft note" },
  ])
  assert.deepEqual(rebaseCloudDraft(base, latest, draft, true).changes, draft)
  assert.deepEqual(rebaseCloudDraft(base, { ...latest, personal_note: draft.note }, draft).conflicts.map(item => item.field), ["title"])
})

test("smart collections combine with text, publication year, tags and manual collections", () => {
  const now = Date.parse("2026-11-27T12:00:00Z")
  const references = [
    { id: "article", title: "Análisis de citas", authors: ["Rivera"], savedAt: "2026-11-21", year: 2024, tags: ["Study"], collections: ["Methods"] },
    { id: "book", title: "Citas en archivos", authors: ["Rivera"], savedAt: "2025-10-15", year: "2024", readingStatus: "read" },
    { id: "report", title: "Citas abiertas", authors: [], savedAt: "2026-11-24", year: "2025", doi: "10.1234/test" },
  ]
  const attachments = new Set(["book"])
  const run = filters => filterLibrary(references, filters, attachments, now).map(item => item.id)
  assert.deepEqual(run({ smart: "no-pdf" }), ["article", "report"])
  assert.deepEqual(run({ smart: "no-doi" }), ["article", "book"])
  assert.deepEqual(run({ smart: "recent" }), ["article", "report"])
  assert.deepEqual(run({ smart: "unread", query: "analisis rivera", year: "2024", collection: "Methods", tag: "Study" }), ["article"])
  assert.deepEqual(run({ smart: "unread", readingStatus: "read" }), [])
})

test("cloud conflict recovery keeps structured and display names from the same version", () => {
  const base = {
    metadata: normalizeReferenceMetadata({ title: "Original", authors: ["Jane Doe"] }),
  }
  const latest = {
    metadata: { ...base.metadata, authorsStructured: [{ family: "Doe", given: "Jane" }] },
  }
  const draft = cloudDraft(base, { metadata: { authors: ["Ari Chan"], citationAuthors: ["Ari Chan"] } })
  const compared = rebaseCloudDraft(base, latest, draft)
  assert.deepEqual(compared.changes, { metadata: {} })
  assert.deepEqual(compared.conflicts, [{ field: "Contributors", latest: "Jane Doe · Author", draft: "Ari Chan · Author" }])
  const resolved = rebaseCloudDraft(base, latest, draft, true).changes.metadata
  assert.deepEqual(resolved.authors, ["Ari Chan"])
  assert.deepEqual(resolved.authorsStructured, [])
})

test("reference JSON and workspace backups restore metadata and PDF annotations", async t => {
  t.after(() => db.delete())
  globalThis.FileReader = class {
    async readAsDataURL(blob) {
      try {
        this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`
        this.onload()
      } catch (error) {
        this.error = error
        this.onerror()
      }
    }
  }
  const url = "https://example.org/reference#chapter"
  const pdfUrl = "https://example.org/reference.pdf"
  assert.equal((await saveToLibrary({ title: "Research", authors: ["Jane Doe"], url, pdfUrl, collections: ["Reading"] })).ok, true)
  const [original] = await getLibrary()
  const exported = await exportLibraryAsJson()
  await db.references.clear()
  assert.deepEqual(await importLibraryFromJson(exported), { ok: true, added: 1, skipped: 0, duplicates: 0 })
  const [restored] = await getLibrary()
  assert.notEqual(restored.id, original.id)
  assert.equal(restored.url, url)
  assert.equal(restored.pdfUrl, pdfUrl)
  assert.deepEqual(restored.collections, ["Reading"])
  assert.equal((await importLibraryFromJson("{")).ok, false)

  const pdf = new File(["%PDF-1.7\nSample backup PDF"], "journal.pdf", { type: "application/pdf" })
  const attachment = await attachPdf(restored.id, pdf)
  assert.deepEqual(await getAttachmentReferenceIds(), [restored.id])
  const annotation = { id: "highlight", page: 1, quote: "Sample", comment: "Read this", rects: [
    { left: 0.1, top: 0.2, width: 0.3, height: 0.4 },
  ] }
  await editPdfAnnotations(attachment, () => [annotation])
  await saveNote({ title: "Notes", body: "A useful source", kind: "note", referenceIds: [restored.id] })
  const backup = await exportWorkspaceBackup()
  await db.transaction("rw", db.references, db.notes, db.attachments, async () => {
    await db.references.clear()
    await db.notes.clear()
    await db.attachments.clear()
  })
  assert.deepEqual(await importWorkspaceBackup(backup), { references: 1, notes: 1, attachments: 1 })
  const workspace = await getWorkspace()
  assert.equal(workspace.references[0].url, url)
  assert.deepEqual(workspace.notes[0].referenceIds, [restored.id])
  assert.equal(workspace.attachments[0].referenceId, restored.id)
  assert.deepEqual(workspace.attachments[0].annotations, [annotation])
  assert.equal(await workspace.attachments[0].file.text(), await pdf.text())
})
