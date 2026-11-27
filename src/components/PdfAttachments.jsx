import { lazy, Suspense, useEffect, useState } from "react"
import { downloadFile } from "../lib/download"
import { attachPdf, deleteAttachment, getAttachments } from "../lib/storage"

const PdfReader = lazy(() => import("./PdfReader"))

export default function PdfAttachments({ referenceId, target, onNoteCreated, onMetadata }) {
  const [opened, setOpened] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    getAttachments(referenceId).then(items => {
      if (!active) return
      setAttachments(items)
      if (target) {
        const attachment = items.find(item => item.id === target.id)
        if (attachment) setOpened({ attachment, page: target.page })
        else setMessage("Attachment not found.")
      }
    })
      .catch(() => { if (active) setMessage("Could not load attachments.") })
    return () => { active = false }
  }, [referenceId, target])

  const add = async event => {
    const file = event.target.files[0]
    event.target.value = ""
    if (!file) return
    setBusy(true)
    try {
      await attachPdf(referenceId, file)
      setAttachments(await getAttachments(referenceId))
      setMessage("PDF attached.")
    } catch (error) {
      setMessage(error.name === "QuotaExceededError" ? "Browser storage is full." : error.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async item => {
    if (!window.confirm(`Delete “${item.name}”?`)) return
    try {
      await deleteAttachment(item.id)
      setAttachments(await getAttachments(referenceId))
      setMessage("Attachment deleted.")
    } catch {
      setMessage("Could not delete the attachment.")
    }
  }

  return <section className="notes-panel">
    <h2>PDF attachments</h2>
    <label>
      Attach PDF
      <input type="file" accept=".pdf,application/pdf" disabled={busy} onChange={add} />
    </label>
    {attachments.map(item => <article key={item.id} className="note-item">
      <p>{item.name}</p>
      <div className="link-row">
        <button className="link-pill" onClick={() => setOpened({ attachment: item, page: 1 })}>Read PDF</button>
        <button className="link-pill" onClick={() => downloadFile(item.name, item.file)}>Download</button>
        <button className="link-pill link-pill-danger" onClick={() => remove(item)}>Delete attachment</button>
      </div>
    </article>)}
    {opened && <Suspense fallback={<p>Loading PDF reader…</p>}>
      <PdfReader key={opened.attachment.id} attachment={opened.attachment} initialPage={opened.page} onClose={() => setOpened(null)}
        onNoteCreated={onNoteCreated} onMetadata={onMetadata}
        onAnnotations={annotations => setAttachments(items => items.map(item => item.id === opened.attachment.id ? { ...item, annotations } : item))} />
    </Suspense>}
    {message && <p role="status">{message}</p>}
  </section>
}
