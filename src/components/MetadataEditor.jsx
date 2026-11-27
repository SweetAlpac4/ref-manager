import { useState } from "react"

const fields = [
  ["title", "Title"], ["journal", "Journal or publication"], ["publisher", "Publisher or institution"],
  ["year", "Year"], ["volume", "Volume"], ["issue", "Issue"],
  ["pages", "Pages"], ["doi", "DOI"], ["isbn", "ISBN"],
]

const types = [
  ["journal-article", "Journal article"], ["book", "Book"], ["book-chapter", "Book chapter"],
  ["proceedings-article", "Conference paper"], ["report", "Report"],
  ["dissertation", "Thesis or dissertation"], ["posted-content", "Preprint"],
  ["dataset", "Dataset"], ["software", "Software"], ["other", "Other"],
]

export default function MetadataEditor({ metadata = {}, onSave, onCancel }) {
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const type = metadata.type || "journal-article"
  const initialAuthors = metadata.authorsStructured?.length
    ? metadata.authorsStructured.map(({ family, given, literal }) => literal ?? [family, given].filter(Boolean).join(", ")).join("\n")
    : metadata.authors?.join("\n") ?? ""

  const submit = async event => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const changes = Object.fromEntries(fields.map(([key]) => [key, form.get(key).trim() || null]))
    if (!changes.title) {
      setMessage("Title is required.")
      return
    }
    changes.abstract = form.get("abstract").trim() || null
    changes.type = form.get("type")
    const authorText = form.get("authors").trim()
    if (!metadata.id || authorText !== initialAuthors.trim()) {
      changes.authorsStructured = authorText.split("\n").map(value => value.trim()).filter(Boolean).map(value => {
        const [family, ...given] = value.split(",")
        return given.length ? { family: family.trim(), given: given.join(",").trim() } : { literal: value }
      })
      changes.authors = changes.authorsStructured.map(({ literal, given, family }) => literal ?? [given, family].filter(Boolean).join(" "))
      changes.citationAuthors = changes.authors
      changes.contributorRole = "author"
    }

    setBusy(true)
    try {
      await onSave(changes)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <form className="reference-fields" onSubmit={submit}>
    <label>Reference type
      <select name="type" defaultValue={type}>
        {!types.some(([id]) => id === type) && <option value={type}>{type}</option>}
        {types.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </label>
    {fields.map(([key, label]) => <label key={key}>{label}
      <input name={key} required={key === "title"} defaultValue={metadata[key] ?? ""}
        pattern={key === "year" ? "[0-9]{1,4}" : undefined} />
    </label>)}
    <label>Authors, one per line in Last name, First name format
      <textarea name="authors" rows={4} defaultValue={initialAuthors} />
    </label>
    <label>Abstract<textarea name="abstract" rows={5} defaultValue={metadata.abstract ?? ""} /></label>
    <div className="link-row">
      <button className="link-pill" disabled={busy}>Save metadata</button>
      <button className="link-pill" type="button" onClick={onCancel}>Cancel</button>
    </div>
    {message && <p role="alert">{message}</p>}
  </form>
}
