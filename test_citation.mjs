import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { formatCitation, initCitationStyles, toCSLInput } from "./src/lib/citation.js"

await initCitationStyles(url => readFile(url, "utf8"))

const article = {
  title: "Reading across collections",
  type: "journal-article",
  authorsStructured: [{ given: "Jane Marie", family: "Doe" }, { given: "Ravi", family: "Singh" }],
  year: "2020",
  journal: "Journal of Library Research",
  volume: "12",
  issue: "2",
  pages: "41-49",
  doi: "https://doi.org/10.1234/paper",
}

const expected = {
  apa: "Doe, J. M., & Singh, R. (2020). Reading across collections. Journal of Library Research, 12(2), 41–49. https://doi.org/10.1234/paper",
  ieee: "[1] J. M. Doe and R. Singh, “Reading across collections,” Journal of Library Research, vol. 12, no. 2, pp. 41–49, 2020, doi: 10.1234/paper.",
  harvard: "Doe, J.M. and Singh, R. (2020) “Reading across collections,” Journal of Library Research, 12(2), pp. 41–49. Available at: https://doi.org/10.1234/paper.",
  chicago: "Doe, Jane Marie, and Ravi Singh. 2020. “Reading across Collections.” Journal of Library Research 12 (2): 41–49. https://doi.org/10.1234/paper.",
}

for (const [style, citation] of Object.entries(expected)) assert.equal(formatCitation(article, style), citation)

assert.match(formatCitation(article, "apa", "html"), /<i>Journal of Library Research<\/i>, <i>12<\/i>\(2\)/)
assert.equal(formatCitation({
  title: "Research handbook",
  type: "edited-book",
  authorsStructured: [{ given: "Jane", family: "Doe" }],
  contributorRole: "editor",
  journal: "Sample Press",
}, "apa"), "Doe, J. (Ed.). (n.d.). Research handbook. Sample Press.")
assert.equal(toCSLInput({ type: "book-chapter", journal: "Handbook", publisher: "Sample Press" }).type, "chapter")
assert.equal(toCSLInput({ type: "dissertation" }).type, "thesis")
assert.equal(toCSLInput({ type: "proceedings-article" }).type, "paper-conference")
assert.deepEqual(toCSLInput({ authors: ["van der Berg, Ann"] }).author, [{ family: "van der Berg", given: "Ann" }])
console.log("Citation checks passed for APA 7, IEEE, Harvard, and Chicago author-date.")

const { formatCitationWorkspace } = await import("./src/lib/citation.js")
const references = [
  { id: "a", title: "Beta book", type: "book", authors: ["Jane Doe"], year: "2020", publisher: "Publisher" },
  { id: "b", title: "Alpha book", type: "book", authors: ["Jane Doe"], year: "2020", publisher: "Publisher" },
]
const groups = [
  { id: "one", items: [{ id: "a", locator: "8" }] },
  { id: "two", items: [{ id: "b" }] },
  { id: "three", items: [{ id: "a", locator: "10" }] },
]
const apa = formatCitationWorkspace(references, groups, "apa")
assert.deepEqual(apa.citations.map(item => item.value), ["(Doe, 2020b, p. 8)", "(Doe, 2020a)", "(Doe, 2020b, p. 10)"])
assert.ok(apa.bibliography.indexOf("Alpha book") < apa.bibliography.indexOf("Beta book"))
const ieee = formatCitationWorkspace(references, groups, "ieee")
assert.deepEqual(ieee.citations.map(item => item.value), ["[1, p. 8]", "[2]", "[1, p. 10]"])
assert.ok(ieee.bibliography.indexOf("Beta book") < ieee.bibliography.indexOf("Alpha book"))
const footnotes = formatCitationWorkspace(references, groups, "chicago-note")
assert.ok(footnotes.noteStyle)
assert.deepEqual(footnotes.citations.map(item => item.value), [
  "Jane Doe, Beta Book (Publisher, 2020), 8.", "Jane Doe, Alpha Book (Publisher, 2020).", "Doe, Beta Book, 10.",
])
console.log("Workspace checks passed for APA disambiguation, IEEE numbering, and Chicago footnotes.")
