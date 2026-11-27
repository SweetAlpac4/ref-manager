import { createClient } from "@supabase/supabase-js"
import { CloudRevisionConflict } from "./cloudChanges.js"
import { normalizeReferenceMetadata } from "./referenceMetadata.js"
import { assertPdf } from "./pdfFile.js"

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
export const cloudClient = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)
  && key?.startsWith("sb_publishable_") ? createClient(url, key) : null

const table = () => cloudClient.from("ref_personal_references")
const pageSize = 200

async function read(request) {
  const { data, error } = await request
  if (error) throw error
  return data
}

export async function getCloudReferences() {
  const rows = []
  let after
  for (;;) {
    const query = table().select("id,title,revision").order("id").limit(pageSize)
    const page = await read(after ? query.gt("id", after) : query)
    rows.push(...page)
    if (page.length < pageSize) break
    after = page.at(-1).id
  }
  return rows.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
}

export async function getCloudReference(id) {
  const record = await read(table().select("*").eq("id", id).maybeSingle())
  return record && { ...record, metadata: normalizeReferenceMetadata(record.metadata) }
}

export const addCloudReference = item =>
  read(table().insert({ metadata: normalizeReferenceMetadata(item) }).select("id").single())

export async function updateCloudReference(record, changes) {
  const patch = {}
  if (Object.keys(changes.metadata ?? {}).length) patch.metadata = normalizeReferenceMetadata({ ...record.metadata, ...changes.metadata })
  if (changes.note !== undefined) patch.personal_note = changes.note
  const updated = await read(table().update(patch).eq("id", record.id).eq("revision", record.revision).select().maybeSingle())
  if (!updated) throw new CloudRevisionConflict()
  return { ...updated, metadata: normalizeReferenceMetadata(updated.metadata) }
}

export async function removeCloudReference(record) {
  const removed = await read(table().delete().eq("id", record.id).eq("revision", record.revision).select("id").maybeSingle())
  if (!removed) throw new Error("This reference changed or you no longer have permission to delete it.")
}

const pdfBucket = () => cloudClient.storage.from("ref-personal-pdfs")
const pdfDirectory = record => `${record.owner_id}/${record.id}`
const pdfPath = record => `${pdfDirectory(record)}/document.pdf`
const pdfSizeLimit = 20 * 1024 * 1024

export async function hasCloudPdf(record) {
  const objects = await read(pdfBucket().list(pdfDirectory(record), { limit: 1 }))
  return objects.some(object => object.name === "document.pdf")
}

export async function uploadCloudPdf(record, file) {
  if (file.size > pdfSizeLimit) throw new Error("Choose a PDF of 20 MB or less.")
  await assertPdf(file)
  return read(pdfBucket().upload(pdfPath(record), file, { contentType: "application/pdf" }))
}

export const downloadCloudPdf = record => read(pdfBucket().download(pdfPath(record), {}, { cache: "no-store" }))
export const openCloudPdfUrl = async record => (await read(pdfBucket().createSignedUrl(pdfPath(record), 60))).signedUrl
export const removeCloudPdf = record => read(pdfBucket().remove([pdfPath(record)]))
