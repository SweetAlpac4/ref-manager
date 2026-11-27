import { normalizeReferenceMetadata } from "./referenceMetadata.js"

export class CloudRevisionConflict extends Error {
  constructor() {
    super("This reference changed in the cloud. Review the latest version before saving again.")
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const contributorFields = ["authors", "citationAuthors", "authorsStructured", "contributorRole"]
const contributors = metadata => Object.fromEntries(contributorFields.map(field => [field, metadata[field]]))
const contributorSummary = metadata => {
  const names = metadata.authorsStructured.length > 0 ? metadata.authorsStructured.map(name =>
    name.literal ?? [name.given, name["non-dropping-particle"], name.family, name.suffix].filter(Boolean).join(" "))
    : metadata.authors
  return names.length ? `${names.join(", ")} · ${metadata.contributorRole === "editor" ? "Editor" : "Author"}` : ""
}

export function cloudDraft(record, updates) {
  const metadata = normalizeReferenceMetadata({ ...record.metadata, ...updates.metadata })
  return {
    metadata: Object.fromEntries(Object.entries(metadata).filter(([field, value]) => !same(record.metadata[field], value))),
    ...(updates.note !== undefined && updates.note !== record.personal_note ? { note: updates.note } : {}),
  }
}

export function hasCloudChanges(draft) {
  return Object.keys(draft.metadata).length > 0 || draft.note !== undefined
}

export function rebaseCloudDraft(base, latest, draft, useDraftForConflicts = false) {
  const conflicts = []
  const metadata = {}
  if (contributorFields.some(field => Object.hasOwn(draft.metadata, field))) {
    const original = contributors(base.metadata)
    const current = contributors(latest.metadata)
    const edited = contributors({ ...base.metadata, ...draft.metadata })
    if (!same(edited, current)) {
      const bothEdited = !same(original, current)
      if (bothEdited) conflicts.push({ field: "Contributors", latest: contributorSummary(current), draft: contributorSummary(edited) })
      if (!bothEdited || useDraftForConflicts) Object.assign(metadata, edited)
    }
  }
  for (const [field, value] of Object.entries(draft.metadata)) {
    if (contributorFields.includes(field)) continue
    if (same(value, latest.metadata[field])) continue
    const bothEdited = !same(base.metadata[field], latest.metadata[field])
    if (bothEdited) conflicts.push({ field, latest: latest.metadata[field], draft: value })
    if (!bothEdited || useDraftForConflicts) metadata[field] = value
  }
  const changes = { metadata }
  if (draft.note !== undefined && draft.note !== latest.personal_note) {
    const bothEdited = base.personal_note !== latest.personal_note
    if (bothEdited) conflicts.push({ field: "Cloud note", latest: latest.personal_note, draft: draft.note })
    if (!bothEdited || useDraftForConflicts) changes.note = draft.note
  }
  return { changes, conflicts }
}
