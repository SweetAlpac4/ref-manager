import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
export const teamClient = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)
  && key?.startsWith("sb_publishable_") ? createClient(url, key) : null

const table = () => teamClient.from("ref_team_references")
const pageSize = 200

async function read(request) {
  const { data, error } = await request
  if (error) throw error
  return data
}

export const getMembership = () => read(teamClient.from("ref_team_members").select("user_id").maybeSingle())

export async function getTeamReferences() {
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

export const getTeamReference = id => read(table().select("*").eq("id", id).maybeSingle())

const metadataFields = [
  "title", "authors", "citationAuthors", "authorsStructured", "contributorRole", "journal", "publisher",
  "year", "volume", "issue", "pages", "doi", "isbn", "type", "abstract", "collections", "tags",
]

function sharedMetadata(item) {
  return Object.fromEntries(metadataFields.filter(key => item[key] != null).map(key => [key, item[key]]))
}

export const publishTeamReference = item => read(table().insert({ metadata: sharedMetadata(item) }).select("id").single())

export async function updateTeamReference(record, changes) {
  const patch = changes.metadata ? { metadata: sharedMetadata(changes.metadata) } : { shared_note: changes.note }
  const updated = await read(table().update(patch).eq("id", record.id).eq("revision", record.revision).select().maybeSingle())
  if (!updated) throw new Error("This reference changed or is no longer available. Copy your edits, then reopen it to review the latest version.")
  return updated
}

export async function removeTeamReference(record) {
  const removed = await read(table().delete().eq("id", record.id).eq("revision", record.revision).select("id").maybeSingle())
  if (!removed) throw new Error("This reference changed or you no longer have permission to delete it.")
}
