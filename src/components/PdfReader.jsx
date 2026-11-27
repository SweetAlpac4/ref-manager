import { useEffect, useRef, useState } from "react"
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url"
import { editPdfAnnotations, saveNote } from "../lib/storage"
import { normalizeText } from "../lib/duplicates"
import "./PdfReader.css"

GlobalWorkerOptions.workerSrc = workerUrl

export default function PdfReader({ attachment, onClose, onAnnotations, onNoteCreated, onMetadata }) {
  const dialog = useRef(null)
  const pageRef = useRef(null)
  const textCache = useRef(new Map())
  const searchId = useRef({ value: 0 })
  const [pdf, setPdf] = useState(null)
  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1)
  const [annotations, setAnnotations] = useState(attachment.annotations ?? [])
  const [draft, setDraft] = useState(null)
  const [message, setMessage] = useState("")
  const [failure, setFailure] = useState("")
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState(null)
  const [suggestions, setSuggestions] = useState(null)

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])

  useEffect(() => {
    let active = true
    let task
    const searches = searchId.current
    attachment.file.arrayBuffer().then(data => {
      if (!active) return
      task = getDocument({ data, isEvalSupported: false })
      return task.promise
    }).then(document => {
      if (active && document) setPdf(document)
    }).catch(error => {
      if (!active) return
      setFailure(error.name === "PasswordException" ? "PDF ini dilindungi sandi." : "PDF gagal dibuka.")
    })
    return () => {
      active = false
      searches.value++
      task?.destroy().catch(() => {})
    }
  }, [attachment.file])

  const getSelection = () => {
    const element = pageRef.current
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed || !element
      || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return null
    const bounds = element.getBoundingClientRect()
    const rects = [...selection.getRangeAt(0).getClientRects()]
      .filter(rect => rect.width && rect.height)
      .map(rect => ({
        left: (rect.left - bounds.left) / bounds.width,
        top: (rect.top - bounds.top) / bounds.height,
        width: rect.width / bounds.width,
        height: rect.height / bounds.height,
      }))
    if (rects.length === 0) return null
    return { quote: selection.toString().trim(), rects }
  }

  const startHighlight = () => {
    const selection = getSelection()
    if (!selection?.quote) {
      setMessage("Pilih teks pada halaman PDF terlebih dahulu.")
      return
    }
    setMessage("")
    setDraft({ ...selection, page, comment: "" })
  }

  const changeAnnotations = async edit => {
    const next = await editPdfAnnotations(attachment.id, edit)
    setAnnotations(next)
    onAnnotations(next)
  }

  const saveAnnotation = async event => {
    event.preventDefault()
    const comment = new FormData(event.currentTarget).get("comment").trim()
    if (!draft.quote && !comment) return
    const annotation = { ...draft, id: draft.id ?? crypto.randomUUID(), comment }
    try {
      await changeAnnotations(items => [...items.filter(item => item.id !== annotation.id), annotation])
      setDraft(null)
      setMessage("Anotasi disimpan.")
    } catch (error) { setMessage(error.message) }
  }

  const removeAnnotation = async id => {
    if (!window.confirm("Hapus anotasi ini?")) return
    try {
      await changeAnnotations(items => items.filter(item => item.id !== id))
      setMessage("Anotasi dihapus.")
    } catch (error) { setMessage(error.message) }
  }

  const extractNote = async annotation => {
    try {
      await saveNote({
        title: `${attachment.name} · hlm. ${annotation.page}`,
        body: [annotation.quote, annotation.comment].filter(Boolean).join("\n\n"),
        kind: annotation.quote ? "excerpt" : "note",
        referenceIds: [attachment.referenceId],
      })
      onNoteCreated()
      setMessage("Anotasi disalin ke catatan referensi.")
    } catch (error) { setMessage(error.message) }
  }

  const find = async event => {
    event.preventDefault()
    const term = normalizeText(query)
    if (!term) return
    const request = ++searchId.current.value
    setSearch({ pending: true, matches: [] })
    try {
      const matches = []
      for (let number = 1; number <= pdf.numPages; number++) {
        if (request !== searchId.current.value) return
        if (!textCache.current.has(number)) {
          const content = await (await pdf.getPage(number)).getTextContent()
          textCache.current.set(number, content.items.map(item => item.str ?? "").join(" "))
        }
        const text = normalizeText(textCache.current.get(number))
        const index = text.indexOf(term)
        if (index >= 0) matches.push({ number, snippet: text.slice(Math.max(0, index - 35), index + term.length + 45) })
      }
      if (request === searchId.current.value) setSearch({ matches })
    } catch {
      if (request === searchId.current.value) setSearch({ matches: [], failed: true })
    }
  }

  const retrieveMetadata = async () => {
    try {
      const { info, metadata } = await pdf.getMetadata()
      const fields = [
        ["title", "Judul", info.Title || metadata?.get("dc:title")],
        ["author", "Penulis", info.Author || metadata?.get("dc:creator")],
        ["doi", "DOI", metadata?.get("prism:doi")],
      ].flatMap(([key, label, value]) => {
        const text = (Array.isArray(value) ? value.join("; ") : String(value ?? "")).trim()
        return text ? [{ key, label, text }] : []
      })
      setSuggestions(fields)
    } catch { setMessage("Gagal membaca metadata PDF.") }
  }

  const currentAnnotations = annotations.filter(item => item.page === page)
  return <dialog className="pdf-reader" ref={dialog} onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="pdf-toolbar">
      <strong>{attachment.name}</strong>
      <button type="button" className="link-pill" onClick={onClose}>Tutup PDF</button>
    </div>
    {failure && <p role="alert">{failure}</p>}
    {!failure && !pdf && <p>Memuat PDF…</p>}
    {pdf && <>
      <div className="pdf-toolbar">
        <button className="link-pill" disabled={page === 1} onClick={() => setPage(page - 1)}>Sebelumnya</button>
        <span>Halaman {page} dari {pdf.numPages}</span>
        <button className="link-pill" disabled={page === pdf.numPages} onClick={() => setPage(page + 1)}>Berikutnya</button>
        <label>Zoom <select value={scale} onChange={event => setScale(Number(event.target.value))}>
          {[.5, .75, 1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>{value * 100}%</option>)}
        </select></label>
        <button className="link-pill" onClick={retrieveMetadata}>Baca metadata PDF</button>
      </div>
      <form className="library-filters" onSubmit={find}>
        <input type="search" aria-label="Cari teks PDF" placeholder="Cari teks PDF" value={query} onChange={event => setQuery(event.target.value)} required />
        <button className="link-pill">Cari</button>
      </form>
      {search?.pending && <p role="status">Mencari di semua halaman…</p>}
      {search?.failed && <p role="alert">Pencarian PDF gagal.</p>}
      {search && !search.pending && !search.failed && <div className="pdf-search-results">
        <p>{search.matches.length} halaman cocok.</p>
        {search.matches.map(({ number, snippet }) => <button key={number} className="link-pill" onClick={() => setPage(number)}>
          Halaman {number} · {snippet}
        </button>)}
      </div>}
      {suggestions && <form className="reference-fields" onSubmit={async event => {
        event.preventDefault()
        const values = Object.fromEntries(new FormData(event.currentTarget))
        if (!Object.keys(values).length) return
        try {
          await onMetadata(values)
          setSuggestions(null)
          setMessage("Metadata referensi diperbarui.")
        } catch (error) { setMessage(error.message) }
      }}>
        {suggestions.length === 0 && <p>PDF tidak memiliki metadata judul, penulis, atau DOI yang terbaca.</p>}
        {suggestions.map(({ key, label, text }) => <label key={key} className="checkbox-label">
          <input type="checkbox" name={key} value={text} />{label} · {text}
        </label>)}
        {suggestions.length > 0 && <button className="link-pill">Terapkan pilihan</button>}
        <button type="button" className="link-pill" onClick={() => setSuggestions(null)}>Tutup metadata</button>
      </form>}
      <div className="pdf-toolbar">
        <button className="link-pill" disabled={Boolean(draft)} onPointerDown={event => event.preventDefault()} onClick={startHighlight}>Highlight teks terpilih</button>
        <button className="link-pill" disabled={Boolean(draft)} onClick={() => setDraft({ page, quote: "", rects: [], comment: "" })}>Tambah sticky note</button>
      </div>
      {message && <p role="status">{message}</p>}
      {draft && <form className="reference-fields" onSubmit={saveAnnotation}>
        <p>Halaman {draft.page}{draft.quote && ` · “${draft.quote}”`}</p>
        <label>Komentar<textarea name="comment" rows={3} defaultValue={draft.comment} required={!draft.quote} /></label>
        <div className="link-row">
          <button className="link-pill">Simpan anotasi</button>
          <button className="link-pill" type="button" onClick={() => setDraft(null)}>Batal</button>
        </div>
      </form>}
      <div className="pdf-page-scroll">
        <PdfPage key={`${page}-${scale}`} pdf={pdf} page={page} scale={scale} pageRef={pageRef} annotations={currentAnnotations} />
      </div>
      <section>
        <h2>Anotasi halaman {page}</h2>
        {currentAnnotations.length === 0 && <p>Belum ada anotasi di halaman ini.</p>}
        {currentAnnotations.map(item => <article key={item.id} className="note-item">
          {item.quote && <p>“{item.quote}”</p>}
          {item.comment && <p className="note-body">{item.comment}</p>}
          <div className="link-row">
            <button className="link-pill" disabled={Boolean(draft)} onClick={() => setDraft(item)}>Edit komentar</button>
            <button className="link-pill" onClick={() => extractNote(item)}>Salin ke catatan</button>
            <button className="link-pill link-pill-danger" disabled={Boolean(draft)} onClick={() => removeAnnotation(item.id)}>Hapus anotasi</button>
          </div>
        </article>)}
      </section>
      {annotations.some(item => item.page !== page) && <div className="pdf-toolbar">
        <span>Halaman lain dengan anotasi</span>
        {[...new Set(annotations.map(item => item.page))].sort((a, b) => a - b).filter(number => number !== page).map(number =>
          <button className="link-pill" key={number} onClick={() => setPage(number)}>{number}</button>)}
      </div>}
    </>}
  </dialog>
}

function PdfPage({ pdf, page, scale, pageRef, annotations }) {
  const canvas = useRef(null)
  const text = useRef(null)
  const [failure, setFailure] = useState(false)

  useEffect(() => {
    let active = true
    let renderTask
    let textLayer
    const layer = text.current
    pdf.getPage(page).then(result => {
      if (!active) return
      const viewport = result.getViewport({ scale })
      const surface = canvas.current
      const ratio = Math.min(window.devicePixelRatio || 1, 2, 4096 / Math.max(viewport.width, viewport.height))
      surface.width = Math.ceil(viewport.width * ratio)
      surface.height = Math.ceil(viewport.height * ratio)
      surface.style.width = `${viewport.width}px`
      surface.style.height = `${viewport.height}px`
      layer.style.setProperty("--total-scale-factor", viewport.scale * viewport.userUnit)
      renderTask = result.render({ canvas: surface, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      textLayer = new TextLayer({ textContentSource: result.streamTextContent(), container: layer, viewport })
      return Promise.all([renderTask.promise, textLayer.render()])
    }).catch(() => { if (active) setFailure(true) })
    return () => {
      active = false
      renderTask?.cancel()
      textLayer?.cancel()
      layer.replaceChildren()
    }
  }, [pdf, page, scale])

  return <>
    {failure && <p role="alert">Halaman PDF gagal dirender.</p>}
    <div className="pdf-page" ref={pageRef} aria-label={`Halaman PDF ${page}`}>
      <canvas ref={canvas} />
      <div className="pdf-highlights" aria-hidden="true">
        {annotations.flatMap(annotation => annotation.rects.map((rect, index) =>
          <span key={`${annotation.id}-${index}`} style={Object.fromEntries(
            Object.entries(rect).map(([key, value]) => [key, `${value * 100}%`]),
          )} />))}
      </div>
      <div className="textLayer" ref={text} />
    </div>
  </>
}
