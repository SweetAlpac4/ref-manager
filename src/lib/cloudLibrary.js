import { createClient } from "@supabase/supabase-js"

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

export const getCloudReference = id => read(table().select("*").eq("id", id).maybeSingle())

const metadataFields = [
  "title", "authors", "citationAuthors", "authorsStructured", "contributorRole", "journal", "publisher",
  "year", "volume", "issue", "pages", "doi", "isbn", "type", "abstract", "collections", "tags", "readingStatus",
]

function cloudMetadata(item) {
  return Object.fromEntries(metadataFields.filter(key => item[key] != null).map(key => [key, item[key]]))
}

export const addCloudReference = item => read(table().insert({ metadata: cloudMetadata(item) }).select("id").single())

export async function updateCloudReference(record, changes) {
  const patch = {}
  if (changes.metadata) patch.metadata = cloudMetadata(changes.metadata)
  if (changes.note !== undefined) patch.personal_note = changes.note
  const updated = await read(table().update(patch).eq("id", record.id).eq("revision", record.revision).select().maybeSingle())
  if (!updated) throw new Error("This reference changed or is no longer available. Copy your edits, then reopen it to review the latest version.")
  return updated
}

export async function removeCloudReference(record) {
  const removed = await read(table().delete().eq("id", record.id).eq("revision", record.revision).select("id").maybeSingle())
  if (!removed) throw new Error("This reference changed or you no longer have permission to delete it.")
}
