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
    }).catch(() => { if (active) setMessage("Gagal memuat catatan.") })
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
      setMessage("Catatan disimpan.")
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async note => {
    if (!window.confirm(`Hapus catatan “${note.title}”?`)) return
    try {
      await deleteNote(note.id)
      setNotes(await getNotes(referenceId))
      setMessage("Catatan dihapus.")
    } catch {
      setMessage("Gagal menghapus catatan.")
    }
  }

  const titles = new Map(references.map(item => [item.id, item.title]))
  const visibleNotes = notes?.filter(note => normalizeText([note.title, note.body,
    ...note.referenceIds.map(id => titles.get(id))].join(" ")).includes(normalizeText(query)))

  return <section className={onBack ? "card" : "notes-panel"}>
    {onBack && <button className="back-btn" onClick={onBack}>Kembali ke Library</button>}
    <h2>{referenceId ? "Catatan referensi" : "Catatan riset"}</h2>
    {!editing && notes && <div className="library-filters">
      <input type="search" aria-label="Cari catatan" placeholder="Cari catatan" value={query} onChange={event => setQuery(event.target.value)} />
      <button className="link-pill" onClick={() => setEditing({ referenceIds: referenceId ? [referenceId] : [] })}>Tambah catatan</button>
    </div>}
    {editing && <form className="reference-fields" onSubmit={save}>
      <label>Jenis<select name="kind" defaultValue={editing.kind}>
        {NOTE_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Judul<input name="title" required defaultValue={editing.title} /></label>
      <label>Isi<textarea name="body" rows={5} required defaultValue={editing.body} /></label>
      <label>Referensi terkait
        <select name="references" multiple defaultValue={editing.referenceIds}>
          {references.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      <div className="link-row">
        <button className="link-pill" disabled={busy}>Simpan catatan</button>
        <button className="link-pill" type="button" onClick={() => setEditing(null)}>Batal</button>
      </div>
    </form>}
    {message && <p role="status">{message}</p>}
    {!editing && visibleNotes?.length === 0 && <p>Belum ada catatan yang cocok.</p>}
    {!editing && visibleNotes?.map(note => <article className="note-item" key={note.id}>
      <h3>{note.title}</h3>
      <p>{NOTE_KINDS.find(([value]) => value === note.kind)?.[1]}
        {note.referenceIds.length > 0 && ` · ${note.referenceIds.map(id => titles.get(id)).filter(Boolean).join(" · ")}`}
      </p>
      <p className="note-body">{note.body}</p>
      <div className="link-row">
        <button className="link-pill" onClick={() => setEditing(note)}>Edit catatan</button>
        <button className="link-pill link-pill-danger" onClick={() => remove(note)}>Hapus catatan</button>
      </div>
    </article>)}
  </section>
}
