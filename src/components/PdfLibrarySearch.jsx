import { useEffect, useRef, useState } from "react"
import { normalizeText } from "../lib/duplicates"
import { getPageText, openPdf, findTextInPage } from "../lib/pdfDocument"
import { getAllAttachments } from "../lib/storage"

const initial = { matches: [], unreadable: 0, total: 0, scanned: 0, pending: true }

export default function PdfLibrarySearch({ references, onBack, onOpen }) {
  const activeSearch = useRef({ controller: null })
  const cache = useRef(new Map())
  const [result, setResult] = useState(null)

  useEffect(() => {
    const active = activeSearch.current
    return () => active.controller?.abort()
  }, [])

  const search = async event => {
    event.preventDefault()
    const term = normalizeText(new FormData(event.currentTarget).get("query"))
    if (!term) return
    activeSearch.current.controller?.abort()
    const controller = new AbortController()
    activeSearch.current.controller = controller
    const { signal } = controller
    setResult(initial)
    try {
      const attachments = await getAllAttachments()
      signal.throwIfAborted()
      const matches = []
      let scanned = 0
      let unreadable = 0
      let withoutText = 0
      for (const attachment of attachments) {
        signal.throwIfAborted()
        try {
          if (!cache.current.has(attachment.id)) {
            cache.current.set(attachment.id, await readPages(attachment.file, signal))
          }
          const pages = cache.current.get(attachment.id)
          if (!pages.some(text => text.trim())) withoutText++
          pages.forEach((text, index) => {
            const snippet = findTextInPage(text, term)
            if (snippet) matches.push({ attachment, page: index + 1, snippet })
          })
        } catch {
          signal.throwIfAborted()
          unreadable++
        }
        scanned++
        setResult({ pending: true, matches: [], unreadable, scanned, total: attachments.length })
      }
      setResult({ matches, unreadable, withoutText, scanned, total: attachments.length })
    } catch {
      if (!signal.aborted) setResult({ error: true })
    }
  }

  const byId = new Map(references.map(item => [item.id, item]))

  return <section className="card citation-workspace">
    <button className="back-btn" onClick={onBack}>Kembali ke Library</button>
    <h2>Cari di semua PDF</h2>
    <form className="library-filters" onSubmit={search}>
      <input name="query" type="search" aria-label="Cari isi semua PDF" placeholder="Masukkan kata atau frasa" required />
      <button className="link-pill">Cari dalam PDF</button>
      {result?.pending && <button type="button" className="link-pill" onClick={() => {
        activeSearch.current.controller?.abort()
        setResult(null)
      }}>Batalkan pencarian</button>}
    </form>
    {result?.pending && <p role="status">Memindai PDF ({result.scanned}/{result.total})…</p>}
    {result?.error && <p role="alert">Gagal memuat lampiran PDF.</p>}
    {result && !result.pending && !result.error && <>
      <p role="status">{result.total ? `${result.matches.length} halaman cocok dari ${result.total} PDF.` : "Belum ada lampiran PDF."}</p>
      {result.unreadable > 0 && <p>{result.unreadable} PDF gagal dibaca.</p>}
      {result.withoutText > 0 && <p>{result.withoutText} PDF tidak memiliki lapisan teks.</p>}
      {result.matches.map(({ attachment, page, snippet }) => {
        const reference = byId.get(attachment.referenceId)
        if (!reference) return null
        return <article key={`${attachment.id}-${page}`} className="note-item">
          <h3>{reference.title}</h3>
          <p>{attachment.name} · hlm. {page}</p>
          <p>{snippet}</p>
          <button className="link-pill" onClick={() => onOpen(reference, { id: attachment.id, page })}>Buka halaman</button>
        </article>
      })}
    </>}
  </section>
}

async function readPages(file, signal) {
  const data = await file.arrayBuffer()
  signal.throwIfAborted()
  const task = openPdf(data)
  const close = () => task.destroy().catch(() => {})
  signal.addEventListener("abort", close, { once: true })
  try {
    const pdf = await task.promise
    const pages = []
    for (let page = 1; page <= pdf.numPages; page++) {
      signal.throwIfAborted()
      pages.push(await getPageText(pdf, page))
    }
    return pages
  } finally {
    signal.removeEventListener("abort", close)
    if (!signal.aborted) await close()
  }
}
