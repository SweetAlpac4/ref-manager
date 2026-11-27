import { Cite, plugins, util } from "@citation-js/core"
import "@citation-js/plugin-csl"
import CSL from "citeproc"
import { normalizeDoi } from "./duplicates.js"

const bundledStyles = {
  apa: new URL("./styles/apa.csl", import.meta.url),
  ieee: new URL("./styles/ieee.csl", import.meta.url),
  harvard: new URL("./styles/harvard-cite-them-right.csl", import.meta.url),
  chicago: new URL("./styles/chicago-author-date.csl", import.meta.url),
  "chicago-note": new URL("./styles/chicago-notes-bibliography.csl", import.meta.url),
}

const loadStyle = async url => {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Gagal memuat gaya sitasi.")
  return response.text()
}

let initialization
export const initCitationStyles = (load = loadStyle) => {
  initialization ??= Promise.all(Object.entries(bundledStyles).map(async ([id, url]) => {
    plugins.config.get("@csl").templates.add(id, await load(url))
  })).catch(error => {
    initialization = undefined
    throw error
  })
  return initialization
}

const typeMap = {
  "journal-article": "article-journal",
  "proceedings-article": "paper-conference",
  "book-chapter": "chapter",
  "edited-book": "book",
  "reference-book": "book",
  monograph: "book",
  dissertation: "thesis",
  "posted-content": "article",
  preprint: "article",
  "reference-entry": "entry",
  "peer-review": "review",
  other: "document",
}

const cslTypes = new Set([
  "article", "article-journal", "article-magazine", "article-newspaper", "book", "chapter",
  "dataset", "document", "entry", "entry-dictionary", "entry-encyclopedia", "manuscript",
  "paper-conference", "report", "review", "software", "thesis", "webpage",
])

export const toCSLInput = meta => {
  const mappedType = typeMap[meta.type] ?? meta.type
  const type = cslTypes.has(mappedType) ? mappedType : "article-journal"
  const names = meta.authorsStructured?.length ? meta.authorsStructured : (meta.citationAuthors || meta.authors || [])
    .filter(name => typeof name === "string" && name.trim())
    .map(name => {
      const [first, ...rest] = name.trim().split(",")
      if (rest.length) return { family: first.trim(), given: rest.join(",").trim() }
      const parts = first.split(/\s+/)
      const family = parts.pop()
      return { family, given: parts.join(" ") }
    })
  const year = Number(meta.year)
  const isPublisher = ["book", "report", "thesis", "dataset", "software"].includes(type)
  return {
    id: meta.id ?? "reference",
    type,
    title: meta.title,
    [meta.contributorRole === "editor" ? "editor" : "author"]: names,
    "container-title": isPublisher ? undefined : meta.journal || undefined,
    publisher: meta.publisher || (isPublisher ? meta.journal || undefined : undefined),
    issued: Number.isInteger(year) && year > 0 ? { "date-parts": [[year]] } : undefined,
    volume: meta.volume || undefined,
    issue: meta.issue || undefined,
    page: meta.pages || undefined,
    DOI: normalizeDoi(meta.doi) || undefined,
    ISBN: meta.isbn || undefined,
    URL: meta.url || undefined,
  }
}

export const formatCitation = (meta, style = "ieee", format = "text") => {
  if (!plugins.config.get("@csl").templates.has(style)) throw new Error("Gaya sitasi belum tersedia.")
  return new Cite(toCSLInput(meta)).format("bibliography", { format, template: style }).trim()
}

export const STYLES = [
  { id: "ieee", label: "IEEE" },
  { id: "apa", label: "APA 7" },
  { id: "harvard", label: "Harvard (Cite Them Right)" },
  { id: "chicago", label: "Chicago (Author–Date)" },
]


export const WORKSPACE_STYLES = [
  ...STYLES, { id: "chicago-note", label: "Chicago (Notes–Bibliography)" },
]

export function formatCitationWorkspace(references, groups, style, format = "text") {
  const { templates, locales } = plugins.config.get("@csl")
  const template = templates.get(style)
  if (!template) throw new Error("Gaya sitasi belum tersedia.")
  const noteStyle = /<style\b[^>]*\bclass=["']note["']/.test(template)
  const items = new Map(util.downgradeCsl(references.map(toCSLInput)).map(item => [item.id, item]))
  const citeproc = new CSL.Engine({
    retrieveLocale: language => locales.has(language) ? locales.get(language) : false,
    retrieveItem: id => items.get(id),
  }, template)
  citeproc.setOutputFormat(format)
  citeproc.opt.development_extensions.wrap_url_and_doi = false
  const clusters = groups.map((group, index) => ({
    citationID: group.id,
    properties: { noteIndex: noteStyle ? index + 1 : 0 },
    citationItems: group.items.map(({ id, locator, label, prefix, suffix, suppressAuthor }) => ({
      id,
      locator: locator?.trim() || undefined,
      label: locator?.trim() ? label || "page" : undefined,
      prefix: prefix?.trim() || undefined,
      suffix: suffix?.trim() || undefined,
      "suppress-author": suppressAuthor || undefined,
    })),
  }))
  const citations = citeproc.rebuildProcessorState(clusters, format, []).map(([id, , value]) => ({ id, value }))
  // Some CSL styles define citations only.
  const bibliography = citeproc.makeBibliography()
  return {
    citations, noteStyle,
    bibliography: bibliography ? bibliography[0].bibstart + bibliography[1].join("") + bibliography[0].bibend : "",
  }
}

export function registerCitationStyle(id, xml) {
  plugins.config.get("@csl").templates.add(id, xml)
}
