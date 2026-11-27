import { lazy, Suspense, useEffect, useState } from "react"
import { attachPdf, deleteAttachment, getAttachments } from "../lib/storage"

const PdfReader = lazy(() => import("./PdfReader"))

export default function PdfAttachments({ referenceId, onNoteCreated, onMetadata }) {
  const [opened, setOpened] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    getAttachments(referenceId).then(items => { if (active) setAttachments(items) })
      .catch(() => { if (active) setMessage("Gagal memuat lampiran.") })
    return () => { active = false }
  }, [referenceId])

  const add = async event => {
    const file = event.target.files[0]
    event.target.value = ""
    if (!file) return
    setBusy(true)
    try {
      await attachPdf(referenceId, file)
      setAttachments(await getAttachments(referenceId))
      setMessage("PDF dilampirkan.")
    } catch (error) {
      setMessage(error.name === "QuotaExceededError" ? "Penyimpanan browser penuh." : error.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async item => {
    if (!window.confirm(`Hapus lampiran “${item.name}”?`)) return
    try {
      await deleteAttachment(item.id)
      setAttachments(await getAttachments(referenceId))
      setMessage("Lampiran dihapus.")
    } catch {
      setMessage("Gagal menghapus lampiran.")
    }
  }

  const download = item => {
    const url = URL.createObjectURL(item.file)
    const link = document.createElement("a")
    link.href = url
    link.download = item.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="notes-panel">
    <h2>Lampiran PDF</h2>
    <label>
      Tambah PDF
      <input type="file" accept=".pdf,application/pdf" disabled={busy} onChange={add} />
    </label>
    {attachments.map(item => <article key={item.id} className="note-item">
      <p>{item.name}</p>
      <div className="link-row">
        <button className="link-pill" onClick={() => setOpened(item)}>Baca PDF</button>
        <button className="link-pill" onClick={() => download(item)}>Unduh</button>
        <button className="link-pill link-pill-danger" onClick={() => remove(item)}>Hapus lampiran</button>
      </div>
    </article>)}
    {opened && <Suspense fallback={<p>Memuat pembaca PDF…</p>}>
      <PdfReader key={opened.id} attachment={opened} onClose={() => setOpened(null)}
        onNoteCreated={onNoteCreated} onMetadata={onMetadata}
        onAnnotations={annotations => setAttachments(items => items.map(item => item.id === opened.id ? { ...item, annotations } : item))} />
    </Suspense>}
    {message && <p role="status">{message}</p>}
  </section>
}
