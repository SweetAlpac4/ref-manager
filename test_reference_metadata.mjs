import assert from "node:assert/strict"
import { test } from "node:test"
import "fake-indexeddb/auto"
import { createServer } from "vite"
import { toCSLInput } from "./src/lib/citation.js"
import { db, getLibrary, removeFromLibrary, saveToLibrary } from "./src/lib/storage.js"

const endpoint = "https://metadata-test.supabase.co"

test("reference metadata survives local → cloud → local copies and edits", async t => {
  process.env.VITE_SUPABASE_URL = endpoint
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_metadata_test"
  const server = await createServer({
    configFile: false,
    envDir: false,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, watch: null, ws: false },
  })
  t.after(async () => {
    await db.delete()
    await server.close()
  })

  const cloudId = crypto.randomUUID()
  let record
  t.mock.method(globalThis, "fetch", (input, options) => {
    const url = new URL(input)
    assert.equal(url.origin, endpoint)
    assert.equal(url.pathname, "/rest/v1/ref_personal_references")
    if (options.method === "POST") {
      record = { id: cloudId, revision: 1, personal_note: "", metadata: JSON.parse(options.body).metadata }
      return Response.json({ id: cloudId })
    }
    assert.equal(url.searchParams.get("id"), `eq.${cloudId}`)
    if (options.method === "PATCH") {
      assert.equal(url.searchParams.get("revision"), `eq.${record.revision}`)
      record = { ...record, ...JSON.parse(options.body), revision: record.revision + 1 }
    } else {
      assert.equal(options.method, "GET")
    }
    return Response.json([record])
  })
  const { addCloudReference, getCloudReference, updateCloudReference } = await server.ssrLoadModule("/src/lib/cloudLibrary.js")

  const reference = {
    title: "Metadata across libraries",
    authors: ["Jane van Doe (Ed.)", "Research Council (Ed.)"],
    citationAuthors: ["Jane van Doe", "Research Council"],
    authorsStructured: [
      { family: "Doe", given: "Jane", "non-dropping-particle": "van", suffix: "Jr." },
      { literal: "Research Council" },
    ],
    contributorRole: "editor",
    journal: "Digital Research Handbook",
    publisher: "Research Press",
    year: "2026",
    volume: "4",
    issue: "2",
    pages: "17–28",
    doi: "10.1234/metadata",
    isbn: "9780140328721",
    type: "book-chapter",
    abstract: "An example with complete reference metadata.",
    url: "https://example.org/research?edition=1#chapter",
    pdfUrl: "https://example.org/research.pdf",
    readingStatus: "reading",
    collections: ["Research", "Examples"],
    tags: ["Metadata", "Round-trip"],
  }
  assert.equal((await saveToLibrary({ ...reference, year: 2026 })).ok, true)
  const [local] = await getLibrary()
  const { id: localId, savedAt: localSavedAt, ...localMetadata } = local
  assert.ok(localSavedAt)
  assert.deepEqual(localMetadata, reference)

  const created = await addCloudReference(local)
  assert.deepEqual(record.metadata, reference)
  const uploaded = await getCloudReference(created.id)
  assert.deepEqual(uploaded.metadata, reference)

  const edits = { abstract: "Edited in the cloud.", tags: [" Updated ", "Updated"] }
  const edited = { ...reference, abstract: edits.abstract, tags: ["Updated"] }
  await updateCloudReference(uploaded, { metadata: edits })
  const updated = await getCloudReference(created.id)
  assert.deepEqual(updated.metadata, edited)

  assert.equal(await removeFromLibrary(localId), true)
  assert.equal((await saveToLibrary(updated.metadata)).ok, true)
  const [copy] = await getLibrary()
  const { id: copiedId, savedAt: copiedAt, ...copiedMetadata } = copy
  assert.notEqual(copiedId, localId)
  assert.ok(copiedAt)
  assert.deepEqual(copiedMetadata, edited)
  assert.equal(toCSLInput(copy).URL, reference.url)

  const cleared = await updateCloudReference(updated, { metadata: { url: null } })
  assert.equal(cleared.metadata.url, null)
  assert.equal(cleared.metadata.pdfUrl, reference.pdfUrl)

  record.metadata = { title: "Legacy cloud reference", authors: ["Jane Doe"], year: "2021" }
  const legacy = await getCloudReference(created.id)
  assert.equal(legacy.metadata.url, null)
  assert.equal(legacy.metadata.pdfUrl, null)
  assert.deepEqual(legacy.metadata.citationAuthors, ["Jane Doe"])
  const legacyEdit = await updateCloudReference(legacy, { metadata: { readingStatus: "read" } })
  assert.equal(legacyEdit.metadata.year, "2021")
  assert.equal(legacyEdit.metadata.readingStatus, "read")
})
