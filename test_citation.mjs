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
