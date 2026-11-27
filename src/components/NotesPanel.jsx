import { useEffect, useState } from "react"
import { deleteNote, getLibrary, getNotes, NOTE_KINDS, saveNote } from "../lib/storage"
import { normalizeText } from "../lib/duplicates"

export default function NotesPanel({ referenceId, onBack }) {
  const [notes, setNotes] = useState(null)
  const [references, setReferences] = useState([])
  const [editing, setEditing] = useState(null)
  const [query, setQuery] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([getNotes(referenceId), getLibrary()]).then(([next, library]) => {
      if (!active) return
      setNotes(next)
      setReferences(library)
    }).catch(() => { if (active) setMessage("Could not load notes.") })
    return () => { active = false }
  }, [referenceId])

  const save = async event => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      await saveNote({
        id: editing.id, title: form.get("title"), body: form.get("body"), kind: form.get("kind"),
        referenceIds: form.getAll("references"),
      })
      setNotes(await getNotes(referenceId))
      setEditing(null)
      setMessage("Note saved.")
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async note => {
    if (!window.confirm(`Delete “${note.title}”?`)) return
    try {
      await deleteNote(note.id)
      setNotes(await getNotes(referenceId))
      setMessage("Note deleted.")
    } catch {
      setMessage("Could not delete the note.")
    }
  }

  const titles = new Map(references.map(item => [item.id, item.title]))
  const visibleNotes = notes?.filter(note => normalizeText([note.title, note.body,
    ...note.referenceIds.map(id => titles.get(id))].join(" ")).includes(normalizeText(query)))

  return <section className={onBack ? "card" : "notes-panel"}>
    {onBack && <button className="back-btn" onClick={onBack}>Back to library</button>}
    <h2>{referenceId ? "Reference notes" : "Research notes"}</h2>
    {!editing && notes && <div className="library-filters">
      <input type="search" aria-label="Search notes" placeholder="Search notes" value={query} onChange={event => setQuery(event.target.value)} />
      <button className="link-pill" onClick={() => setEditing({ referenceIds: referenceId ? [referenceId] : [] })}>Add note</button>
    </div>}
    {editing && <form className="reference-fields" onSubmit={save}>
      <label>Type<select name="kind" defaultValue={editing.kind}>
        {NOTE_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Title<input name="title" required defaultValue={editing.title} /></label>
      <label>Content<textarea name="body" rows={5} required defaultValue={editing.body} /></label>
      <label>Related references
        <select name="references" multiple defaultValue={editing.referenceIds}>
          {references.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      <div className="link-row">
        <button className="link-pill" disabled={busy}>Save note</button>
        <button className="link-pill" type="button" onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </form>}
    {message && <p role="status">{message}</p>}
    {!editing && visibleNotes?.length === 0 && <p>No matching notes.</p>}
    {!editing && visibleNotes?.map(note => <article className="note-item" key={note.id}>
      <h3>{note.title}</h3>
      <p>{NOTE_KINDS.find(([value]) => value === note.kind)?.[1]}
        {note.referenceIds.length > 0 && ` · ${note.referenceIds.map(id => titles.get(id)).filter(Boolean).join(" · ")}`}
      </p>
      <p className="note-body">{note.body}</p>
      <div className="link-row">
        <button className="link-pill" onClick={() => setEditing(note)}>Edit note</button>
        <button className="link-pill link-pill-danger" onClick={() => remove(note)}>Delete note</button>
      </div>
    </article>)}
  </section>
}
