/* global Office, Word */

const fileInput = document.getElementById("file")
const citation = document.getElementById("citation")
const insert = document.getElementById("insert")
const bibliography = document.getElementById("bibliography")
const feedback = document.getElementById("feedback")
let bundle
let busy = false

function updateActions() {
  document.getElementById("actions").hidden = !bundle
  insert.disabled = busy || !bundle?.citations.length
  bibliography.disabled = busy || !bundle?.bibliography.length
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
    const data = JSON.parse(await file.text())
    if (data?.format !== "ref-manager-citations" || data.version !== 1 ||
      ![data.citations, data.bibliography].every(items => Array.isArray(items) &&
        items.every(text => typeof text === "string" && text.trim()))) throw new Error()
    bundle = data
    citation.replaceChildren(...bundle.citations.map((_, index) => new Option(`Citation ${index + 1}`, index)))
    feedback.textContent = typeof bundle.style === "string" ? bundle.style : "Citations loaded."
    updateActions()
  } catch {
    feedback.textContent = "Choose a valid Ref Manager citation file."
  } finally {
    fileInput.disabled = false
  }
})

citation.addEventListener("change", updateActions)

async function updateDocument(edit, message) {
  busy = true
  fileInput.disabled = true
  updateActions()
  try {
    await Word.run(async context => {
      edit(context.document)
      await context.sync()
    })
    feedback.textContent = message
  } catch {
    feedback.textContent = "Could not edit the document. Check that it is editable and try again."
  } finally {
    busy = false
    fileInput.disabled = false
    updateActions()
  }
}

insert.addEventListener("click", () => updateDocument(doc => {
  doc.getSelection().insertText(bundle.citations[citation.selectedIndex], Word.InsertLocation.end)
}, "Citation inserted."))

bibliography.addEventListener("click", () => updateDocument(doc => {
  const heading = doc.body.insertParagraph("Bibliography", Word.InsertLocation.end)
  if (Office.context.requirements.isSetSupported("WordApi", "1.3")) heading.styleBuiltIn = "Heading1"
  for (const entry of bundle.bibliography) doc.body.insertParagraph(entry, Word.InsertLocation.end)
}, "Bibliography appended."))

if (typeof Office === "undefined") {
  feedback.textContent = "Could not load Office.js. Reopen the add-in from Word."
} else {
  Office.onReady(({ host }) => {
    if (host !== Office.HostType.Word || !Office.context.requirements.isSetSupported("WordApi", "1.1")) {
      feedback.textContent = "Open this add-in in a supported Word client."
      return
    }
    fileInput.disabled = false
    feedback.textContent = ""
  })
}
