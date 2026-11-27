import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { formatCitationWorkspace, initCitationStyles } from "./src/lib/citation.js"
import { createCitationBundle, parseCitationBundle, renderWordCitations } from "./src/lib/wordCitations.js"

await initCitationStyles(url => readFile(url, "utf8"))

const references = [
  { id: "alpha", title: "Alpha article", authors: ["Jane Doe"], year: "2022", type: "journal-article", tags: ["Private"] },
  { id: "beta", title: "Beta article", authors: ["Ari Chan"], year: "2024", type: "journal-article" },
]
const groups = [
  { id: "one", items: [{ id: "alpha" }] },
  { id: "two", items: [{ id: "beta" }], paragraph: "Unrelated text" },
]
const bundle = (...args) => createCitationBundle(formatCitationWorkspace(args[1], groups, args[0]), args[0], args[0], groups, args[1])

test("Word refresh reorders IEEE numbering and bibliography by document occurrence", () => {
  const exported = parseCitationBundle(JSON.stringify(bundle("ieee", references)))
  assert.equal(exported.word.references[0].tags, undefined)
  assert.equal(exported.word.groups[1].paragraph, undefined)
  const result = renderWordCitations(exported.word, ["two", "one", "two"])
  assert.deepEqual(result.citations, ["[1]", "[2]", "[1]"])
  assert.match(result.bibliography[0], /Beta article/)
  assert.match(result.bibliography[1], /Alpha article/)
  assert.deepEqual(result.groups.map(group => group.items[0].id), ["beta", "alpha", "beta"])
  assert.equal(renderWordCitations(exported.word, ["two"]).bibliography.length, 1)
})

test("Word refresh uses edited metadata and the current style and rejects missing groups", () => {
  const editedReferences = [{ ...references[0], year: "2026", title: "Revised title" }, references[1]]
  const current = bundle("apa", editedReferences)
  const updated = renderWordCitations(current.word, ["one"])
  assert.match(updated.citations[0], /2026/)
  assert.match(updated.bibliography[0], /Revised title/)
  assert.throws(() => renderWordCitations(current.word, ["missing"]), /missing a citation/)
  assert.throws(() => parseCitationBundle(JSON.stringify({
    ...current, word: { ...current.word, references: [] },
  })), /valid Ref Manager/)
  const { word, ...legacy } = current
  assert.ok(word)
  assert.deepEqual(parseCitationBundle(JSON.stringify(legacy)), legacy)
})
