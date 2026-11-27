import { getWorkspace, NOTE_KINDS, restoreWorkspace } from "./storage.js"

const format = "ref-manager-workspace"
const isId = value => typeof value === "string" && value.length > 0 && value.length <= 128
const isText = value => typeof value === "string"
const invalid = () => new Error("Data backup tidak valid atau tidak lengkap.")

const toBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(",") + 1))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

export async function exportWorkspaceBackup() {
  const { references, notes, attachments } = await getWorkspace()
  const encoded = []
  for (const { file, ...attachment } of attachments) {
    encoded.push({ ...attachment, data: await toBase64(file) })
  }
  return JSON.stringify({ format, version: 1, references, notes, attachments: encoded })
}

function validateAnnotations(raw = []) {
  if (!Array.isArray(raw)) throw invalid()
  return raw.map(({ id, page, quote, comment, rects }) => {
    if (!isId(id) || !Number.isSafeInteger(page) || page < 1 || !isText(quote) || !isText(comment)
      || !Array.isArray(rects)) throw invalid()
    const coordinates = rects.map(rect => Object.fromEntries(["left", "top", "width", "height"].map(key => {
      if (!Number.isFinite(rect?.[key])) throw invalid()
      return [key, rect[key]]
    })))
    return { id, page, quote, comment, rects: coordinates }
  })
}

function validateIds(items) {
  if (!Array.isArray(items)) throw invalid()
  const ids = new Set()
  for (const item of items) {
    if (!isId(item?.id) || ids.has(item.id)) throw invalid()
    ids.add(item.id)
  }
  return ids
}

function decodePdf(value) {
  if (!isText(value)) throw invalid()
  const header = atob(value.slice(0, 1368))
  if (!header.includes("%PDF-")) throw invalid()
  const chunks = []
  for (let start = 0; start < value.length; start += 65536) {
    const data = atob(value.slice(start, start + 65536))
    chunks.push(Uint8Array.from(data, char => char.charCodeAt(0)))
  }
  return new Blob(chunks, { type: "application/pdf" })
}

export async function importWorkspaceBackup(content) {
  let workspace
  try {
    const data = JSON.parse(content)
    if (data?.format !== format || data.version !== 1) throw invalid()
    const ids = validateIds(data.references)
    validateIds(data.notes)
    validateIds(data.attachments)

    const notes = data.notes.map(({ id, title, body, kind, referenceIds, updatedAt }) => {
      if (!isText(title) || !isText(body) || !NOTE_KINDS.some(([value]) => value === kind)
        || !Array.isArray(referenceIds) || !referenceIds.every(ref => ids.has(ref))
        || !isText(updatedAt) || Number.isNaN(Date.parse(updatedAt))) throw invalid()
      return { id, title, body, kind, updatedAt, referenceIds }
    })

    const attachments = data.attachments.map(({ id, name, referenceId, annotations, data: encoded }) => {
      if (!isText(name) || !name.trim() || !ids.has(referenceId)) throw invalid()
      return { id, name, referenceId, annotations: validateAnnotations(annotations), file: decodePdf(encoded) }
    })
    workspace = { references: data.references, notes, attachments }
  } catch {
    throw invalid()
  }
  return restoreWorkspace(workspace)
}
