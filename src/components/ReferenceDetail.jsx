import { useState, useEffect, useMemo } from "react"
import { lookupOpenAccessPdf, fetchThumbnail } from "../lib/crossref"
import { initCitationStyles, formatCitation, STYLES } from "../lib/citation"
import { saveToLibrary, isInLibrary, updateReference, READING_STATUSES } from "../lib/storage"
import PdfAttachments from "./PdfAttachments"
import NotesPanel from "./NotesPanel"
import MetadataEditor from "./MetadataEditor"
import { CopyIcon, CheckIcon, BookIcon, ArrowLeftIcon } from "./icons"

// PENTING: kalau dipakai untuk menampilkan item yang berbeda-beda (mis. dari list
// batch/library), render komponen ini dengan `key` unik per item (mis. key={doi}),
// supaya React remount komponen dan effect fetch pdf/thumbnail jalan ulang untuk
// item yang baru, bukan nyangkut ke data item sebelumnya.
export default function ReferenceDetail({ metadata: initialMetadata, onBack, onSaveChange, onDelete, onUpdate }) {
  const [metadata, setMetadata] = useState(initialMetadata)
  const [editing, setEditing] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [thumbnail, setThumbnail] = useState(null)
  const [selectedStyle, setSelectedStyle] = useState("ieee")
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(Boolean(onUpdate))
  const [stylesReady, setStylesReady] = useState(false)
  const [stylesError, setStylesError] = useState(false)

  useEffect(() => {
    initCitationStyles()
      .then(() => setStylesReady(true))
      .catch(() => setStylesError(true))
  }, [])

  useEffect(() => {
    if (!onUpdate) isInLibrary(initialMetadata?.doi).then(setSaved)

    if (initialMetadata?.doi && !initialMetadata.pdfUrl) {
      lookupOpenAccessPdf(initialMetadata.doi).then(url => {
        if (url) setMetadata(prev => prev?.doi === initialMetadata.doi ? { ...prev, pdfUrl: url } : prev)
      })
    }
    if (initialMetadata?.isbn) {
      fetchThumbnail(initialMetadata).then(url => { if (url) setThumbnail(url) })
    }
    // sengaja hanya jalan sekali per mount (lihat catatan `key` di atas)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const citation = useMemo(() => {
    if (!metadata) return ""
    if (stylesError) return "Gagal memuat gaya sitasi (periksa koneksi internet)."
    if (!stylesReady) return "Memuat gaya sitasi..."
    try { return formatCitation(metadata, selectedStyle) }
    catch { return "Gagal memformat sitasi." }
  }, [metadata, selectedStyle, stylesReady, stylesError])

  const handleRetryStyles = () => {
    setStylesError(false)
    initCitationStyles()
      .then(() => setStylesReady(true))
      .catch(() => setStylesError(true))
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(citation)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = async () => {
    if (!metadata) return
    const res = await saveToLibrary(metadata)
    if (res.ok || res.reason === "duplicate") {
      setSaved(true)
      onSaveChange?.()
    } else {
      setSaveMessage("Gagal menyimpan referensi.")
    }
  }

  const saveChanges = async changes => {
    const updated = await updateReference(metadata.id, changes)
    setMetadata(previous => ({ ...previous, ...updated,
      pdfUrl: updated.doi === previous.doi ? updated.pdfUrl ?? previous.pdfUrl : updated.pdfUrl }))
    await onUpdate()
  }

  if (!metadata) return null

  return (
    <div className="detail-view">
      {onBack && (
        <button className="back-btn" onClick={onBack}>
          <ArrowLeftIcon /><span>Kembali</span>
        </button>
      )}

      <div className="result-grid">

        <div className="card col-left">
          <div className="cover-box">
            {thumbnail
              ? <img src={thumbnail} alt="cover" className="cover-img" />
              : <div className="cover-placeholder"><BookIcon /></div>
            }
          </div>
          <p className="result-title">{metadata.title}</p>
          <p className="result-authors">{metadata.authors?.join(", ")}</p>
          <p className="result-venue">
            {[metadata.journal, metadata.volume && `Vol. ${metadata.volume}`, metadata.issue && `No. ${metadata.issue}`, metadata.pages && `pp. ${metadata.pages}`, metadata.year].filter(Boolean).join(" · ")}
          </p>

          <div className="link-row">
            {metadata.doi && (
              <a className="link-pill" href={`https://doi.org/${metadata.doi}`} target="_blank" rel="noreferrer">
                Lihat Sumber
              </a>
            )}
            {metadata.pdfUrl && (
              <a className="link-pill link-pill-pdf" href={metadata.pdfUrl} target="_blank" rel="noreferrer">
                Unduh PDF
              </a>
            )}
            <button className="link-pill link-pill-save" onClick={handleSave} disabled={saved}>
              {saved ? "Tersimpan di Library" : "Simpan ke Library"}
            </button>
            {onDelete && (
              <button className="link-pill link-pill-danger" onClick={onDelete}>
                Hapus dari Library
              </button>
            )}
          </div>

          {saveMessage && <p role="alert">{saveMessage}</p>}
          {onUpdate && <>
            <button className="link-pill" onClick={() => setEditing(!editing)}>Edit metadata</button>
            {editing && <MetadataEditor metadata={metadata} onCancel={() => setEditing(false)} onSave={async changes => {
              await saveChanges(changes.doi !== metadata.doi ? { ...changes, pdfUrl: null } : changes)
              setEditing(false)
            }} />}
            <ReferenceOrganization metadata={metadata} onSave={saveChanges} />
            <PdfAttachments referenceId={metadata.id} />
            <NotesPanel referenceId={metadata.id} />
          </>}

          {metadata.abstract && (
            <div className="abstract-section">
              <p className="abstract-text">{metadata.abstract}</p>
            </div>
          )}
        </div>

        <div className="card col-right">
          <div className="metadata-grid">
            <MetaRow label="Judul" value={metadata.title} />
            <MetaRow label="Penulis" value={metadata.authors?.join(", ")} />
            <MetaRow label="Jurnal" value={metadata.journal} />
            <MetaRow label="Tahun" value={metadata.year} />
            <MetaRow label="Volume" value={metadata.volume} />
            <MetaRow label="Issue" value={metadata.issue} />
            <MetaRow label="Halaman" value={metadata.pages} />
            <MetaRow label="DOI" value={metadata.doi} />
            {metadata.isbn && <MetaRow label="ISBN" value={metadata.isbn} />}
          </div>

          <div className="divider" />

          <div className="format-section">
            <p className="section-label">Format Sitasi</p>
            <div className="style-pills">
              {STYLES.map(s => (
                <button key={s.id} className={`style-pill ${selectedStyle === s.id ? "active" : ""}`} onClick={() => setSelectedStyle(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="citation-box">
            <div className="citation-header">
              <span className="citation-label">{STYLES.find(s => s.id === selectedStyle)?.label}</span>
              <button className="copy-btn" onClick={handleCopy}>
                {copied ? <CheckIcon /> : <CopyIcon />}
                <span>{copied ? "Tersalin!" : "Salin"}</span>
              </button>
            </div>
            <p className="citation-text">{citation}</p>
            {stylesError && (
              <button className="link-pill" onClick={handleRetryStyles}>Coba Lagi</button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

function MetaRow({ label, value }) {
  if (!value) return null
  return (
    <div className="meta-row">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{value}</span>
    </div>
  )
}


function ReferenceOrganization({ metadata, onSave }) {
  const [message, setMessage] = useState("")
  return <form className="reference-fields" onSubmit={async event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    try {
      await onSave({
        collections: fields.get("collections").split(","),
        tags: fields.get("tags").split(","),
        readingStatus: fields.get("readingStatus"),
      })
      setMessage("Pengaturan referensi disimpan.")
    } catch (error) {
      setMessage(error.message)
    }
  }}>
    <label>Koleksi, pisahkan dengan koma<input name="collections" defaultValue={metadata.collections?.join(", ")} /></label>
    <label>Tag, pisahkan dengan koma<input name="tags" defaultValue={metadata.tags?.join(", ")} /></label>
    <label>Status baca<select name="readingStatus" defaultValue={metadata.readingStatus ?? "unread"}>
      {READING_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <button className="link-pill">Simpan pengaturan</button>
    <p role="status">{message}</p>
  </form>
}
