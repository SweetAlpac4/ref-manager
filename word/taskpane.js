/* global Office, Word */

import { initCitationStyles } from "../src/lib/citation.js"
import { bibliographyTag, citationTagPrefix, parseCitationBundle, renderWordCitations } from "../src/lib/wordCitations.js"

const fileInput = document.getElementById("file")
const citation = document.getElementById("citation")
const insert = document.getElementById("insert")
const bibliography = document.getElementById("bibliography")
const refresh = document.getElementById("refresh")
const feedback = document.getElementById("feedback")
let bundle
let busy = false
let supportsLinkedCitations = false

const isLinked = () => supportsLinkedCitations && Boolean(bundle?.word)
const isCitation = control => control.tag?.startsWith(citationTagPrefix)
const isBibliography = control => control.tag === bibliographyTag

function updateActions() {
  document.getElementById("actions").hidden = !bundle
  insert.disabled = busy || !bundle?.citations.length
  bibliography.disabled = busy || !bundle?.bibliography.length
  refresh.hidden = !isLinked()
  refresh.disabled = busy
  bibliography.textContent = isLinked() ? "Insert or update bibliography" : "Append bibliography"
  document.getElementById("preview").textContent = bundle?.citations[citation.selectedIndex] ?? ""
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0]
  bundle = undefined
  feedback.textContent = ""
  updateActions()
  if (!file) return
  fileInput.disabled = true
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error()
    bundle = parseCitationBundle(await file.text())
    citation.replaceChildren(...bundle.citations.map((_, index) => new Option(`Citation ${index + 1}`, index)))
    const style = typeof bundle.style === "string" ? bundle.style : "Citations loaded."
    feedback.textContent = isLinked() ? `${style} · Linked citations available` : style
    updateActions()
  } catch {
    feedback.textContent = "Choose a valid Ref Manager citation file."
  } finally {
    fileInput.value = ""
    fileInput.disabled = false
  }
})

citation.addEventListener("change", updateActions)

async function updateDocument(edit, message) {
  busy = true
  fileInput.disabled = true
  updateActions()
  try {
    const result = await Word.run(async context => {
      const result = await edit(context)
      await context.sync()
      return result
    })
    feedback.textContent = result ?? message
  } catch (error) {
    feedback.textContent = error instanceof TaskPaneError ? error.message
      : "Could not edit the document. Check that it is editable and try again."
  } finally {
    busy = false
    fileInput.disabled = false
    updateActions()
  }
}

class TaskPaneError extends Error {}

function saveSources(groups) {
  const settings = Office.context.document.settings
  for (const group of new Set(groups)) settings.set(`${citationTagPrefix}${group.id}`, group.items.map(item => item.id))
  return new Promise((resolve, reject) => settings.saveAsync(result => {
    if (result.status === Office.AsyncResultStatus.Succeeded) resolve()
    else reject(new TaskPaneError("Could not save citation links in this document. Try again."))
  }))
}

const escapeHtml = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
const bibliographyMarkup = lines => `<h1>Bibliography</h1>${lines.map(line => `<p>${escapeHtml(line)}</p>`).join("")}`

async function updateLinkedFields(context, appendBibliography) {
  await initCitationStyles()
  const body = context.document.body
  const controls = body.contentControls.load("items/tag")
  await context.sync()
  const citations = controls.items.filter(isCitation)
  const bibliographies = controls.items.filter(isBibliography)
  if (!appendBibliography && !citations.length && !bibliographies.length) {
    throw new TaskPaneError("This document has no linked Ref Manager citations or bibliography.")
  }
  let formatted
  try {
    formatted = renderWordCitations(bundle.word, citations.map(control => control.tag.slice(citationTagPrefix.length)))
  } catch (error) {
    throw new TaskPaneError(error.message)
  }
  if (formatted.groups.length) await saveSources(formatted.groups)
  for (const [index, control] of citations.entries()) control.insertText(formatted.citations[index], "Replace")

  const lines = citations.length || !appendBibliography ? formatted.bibliography : bundle.bibliography
  if (appendBibliography && !bibliographies.length) {
    const heading = body.insertParagraph("Bibliography", "End")
    const control = heading.insertContentControl()
    control.tag = bibliographyTag
    control.title = "Ref Manager bibliography"
    bibliographies.push(control)
  }
  for (const control of bibliographies) control.insertHtml(bibliographyMarkup(lines), "Replace")
  const count = citations.length
  return `Updated ${count} linked ${count === 1 ? "citation" : "citations"}${bibliographies.length ? " and the bibliography" : ""}.`
}

insert.addEventListener("click", () => updateDocument(async context => {
  const index = citation.selectedIndex
  const doc = context.document
  if (!isLinked()) {
    doc.getSelection().insertText(bundle.citations[index], "End")
    return
  }
  const group = bundle.word.groups[index]
  const end = doc.getSelection().getRange("End")
  const parent = end.parentContentControlOrNullObject.load("tag")
  await context.sync()
  const isManaged = !parent.isNullObject && (isCitation(parent) || isBibliography(parent))
  const location = isManaged ? parent.getRange("After") : end
  await saveSources([group])
  const control = location.insertText(bundle.citations[index], "End").insertContentControl()
  control.tag = `${citationTagPrefix}${group.id}`
  control.title = "Ref Manager citation"
  control.getRange("After").select()
}, "Citation inserted."))

bibliography.addEventListener("click", () => updateDocument(context => {
  if (isLinked()) return updateLinkedFields(context, true)
  const body = context.document.body
  const heading = body.insertParagraph("Bibliography", "End")
  if (supportsLinkedCitations) heading.styleBuiltIn = "Heading1"
  for (const entry of bundle.bibliography) body.insertParagraph(entry, "End")
}, "Bibliography appended."))

refresh.addEventListener("click", () => updateDocument(context => updateLinkedFields(context, false)))

if (typeof Office === "undefined") {
  feedback.textContent = "Could not load Office.js. Reopen the add-in from Word."
} else {
  Office.onReady(({ host }) => {
    if (host !== Office.HostType.Word || !Office.context.requirements.isSetSupported("WordApi", "1.1")) {
      feedback.textContent = "Open this add-in in a supported Word client."
      return
    }
    supportsLinkedCitations = Office.context.requirements.isSetSupported("WordApi", "1.3")
    fileInput.disabled = false
    feedback.textContent = ""
  })
}
