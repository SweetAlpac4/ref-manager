import { formatCitationWorkspace, STYLES } from "./citation.js"

export const citationTagPrefix = "ref-manager-c:"
export const bibliographyTag = "ref-manager-bibliography"

const fields = ["id", "title", "type", "authors", "citationAuthors", "authorsStructured", "contributorRole",
  "journal", "publisher", "year", "volume", "issue", "pages", "doi", "isbn", "url"]
const itemFields = ["id", "locator", "label", "prefix", "suffix", "suppressAuthor"]
const pick = (item, keys) => Object.fromEntries(keys.filter(key => item[key] != null).map(key => [key, item[key]]))
const asLines = value => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
const isGroupId = id => typeof id === "string" && /^[\w-]{1,48}$/.test(id)
const isReferenceId = id => typeof id === "string" && id.length > 0 && id.length <= 128
const supportsStyle = id => STYLES.some(style => style.id === id)
const isText = value => typeof value === "string"
const validTextList = items => Array.isArray(items) && items.every(text => isText(text) && text.trim())

export function createCitationBundle(output, style, label, groups, references) {
  const bundle = {
    format: "ref-manager-citations",
    version: 1,
    style: label,
    citations: output.citations.map(citation => citation.value.trim()),
    bibliography: asLines(output.bibliography),
  }
  if (supportsStyle(style) && groups.every(group => isGroupId(group.id))) {
    const ids = new Set(groups.flatMap(group => group.items.map(item => item.id)))
    const byId = new Map(groups.map(group => [group.id, group]))
    bundle.word = {
      style,
      groups: output.citations.map(({ id }) => ({ id, items: byId.get(id).items.map(item => pick(item, itemFields)) })),
      references: references.filter(reference => ids.has(reference.id)).map(reference =>
        pick({ ...reference, year: reference.year == null ? null : String(reference.year) }, fields)),
    }
  }
  return bundle
}

function validReference(reference) {
  if (!isReferenceId(reference?.id) || !isText(reference.title) || !reference.title.trim()) return false
  for (const field of ["authors", "citationAuthors"]) {
    if (reference[field] !== undefined && (!Array.isArray(reference[field]) || !reference[field].every(isText))) return false
  }
  if (reference.authorsStructured !== undefined && (!Array.isArray(reference.authorsStructured) ||
    !reference.authorsStructured.every(name => name && typeof name === "object" && !Array.isArray(name)
      && Object.values(name).every(isText)))) return false
  return fields.filter(field => !["id", "title", "authors", "citationAuthors", "authorsStructured"].includes(field))
    .every(field => reference[field] === undefined || isText(reference[field]))
}

function validWordData(data, citationCount) {
  if (!data || !supportsStyle(data.style) || !Array.isArray(data.groups) || data.groups.length !== citationCount ||
    !Array.isArray(data.references) || !data.references.every(validReference)) return false
  const ids = new Set(data.references.map(reference => reference.id))
  if (ids.size !== data.references.length) return false
  const groupIds = new Set()
  return data.groups.every(group => {
    if (!isGroupId(group?.id) || groupIds.has(group.id) || !Array.isArray(group.items) || !group.items.length) return false
    groupIds.add(group.id)
    return group.items.every(item => item && ids.has(item.id) &&
      ["locator", "label", "prefix", "suffix"].every(field => item[field] === undefined || isText(item[field])) &&
      (item.suppressAuthor === undefined || typeof item.suppressAuthor === "boolean"))
  })
}

export function parseCitationBundle(value) {
  const data = JSON.parse(value)
  if (data?.format !== "ref-manager-citations" || data.version !== 1 ||
    !validTextList(data.citations) || !validTextList(data.bibliography) ||
    (data.word !== undefined && !validWordData(data.word, data.citations.length))) {
    throw new Error("Choose a valid Ref Manager citation file.")
  }
  return data
}

export function renderWordCitations(data, groupIds) {
  if (!groupIds.length) return { citations: [], bibliography: [], groups: [] }
  const byId = new Map(data.groups.map(group => [group.id, group]))
  const groups = groupIds.map(id => byId.get(id))
  if (groups.some(group => !group)) {
    throw new Error("The file is missing a citation used in this document. Export the original draft again or remove the missing citation from Word.")
  }
  const occurrences = groups.map((group, index) => ({ id: `word-${index}`, items: group.items }))
  const formatted = formatCitationWorkspace(data.references, occurrences, data.style)
  const byOccurrence = new Map(formatted.citations.map(citation => [citation.id, citation.value.trim()]))
  return { citations: occurrences.map(item => byOccurrence.get(item.id)), bibliography: asLines(formatted.bibliography), groups }
}
