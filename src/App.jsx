import { useState, useEffect, useMemo } from "react"
import { lookupDOI, searchByTitle, lookupOpenAccessPdf, fetchThumbnail } from "./lib/crossref"
import { initCitationStyles, formatCitation, STYLES } from "./lib/citation"
import { parseBatchInput, runBatchSearch, MAX_BATCH_ITEMS } from "./lib/batch"
import { saveToLibrary, isInLibrary } from "./lib/storage"
import BatchResults from "./components/BatchResults"
import LibraryPanel from "./components/LibraryPanel"
import "./App.css"

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)

const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
  </svg>
)

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

const BookIcon = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
)

export default function App() {
  const [tab, setTab] = useState("search") // "search" | "library"
  const [mode, setMode] = useState("doi") // "doi" | "title" | "batch"
  const [input, setInput] = useState("")
  const [batchInput, setBatchInput] = useState("")
  const [status, setStatus] = useState("idle")
  const [metadata, setMetadata] = useState(null)
  const [selectedStyle, setSelectedStyle] = useState("ieee")
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [thumbnail, setThumbnail] = useState(null)

  const [batchProgress, setBatchProgress] = useState(null) // {done, total, current}
  const [batchResults, setBatchResults] = useState(null)

  useEffect(() => { initCitationStyles() }, [])

  const citation = useMemo(() => {
    if (!metadata) return ""
    try { return formatCitation(metadata, selectedStyle) }
    catch { return "Gagal memformat sitasi." }
  }, [metadata, selectedStyle])

  const handleSearch = async () => {
    if (!input.trim()) return
    setStatus("loading")
    setMetadata(null)
    setThumbnail(null)
    setErrorMsg("")
    setSaved(false)

    try {
      let result = null
      if (mode === "doi") result = await lookupDOI(input.trim())
      else result = await searchByTitle(input.trim())

      if (!result) {
        setErrorMsg(mode === "doi"
          ? "DOI tidak ditemukan di CrossRef maupun DataCite. Pastikan DOI sudah benar."
          : "Judul tidak ditemukan. Coba gunakan judul yang lebih spesifik."
        )
        setStatus("error")
        return
      }

      setMetadata(result.data)
      setStatus("success")
      setSaved(isInLibrary(result.data.doi))

      // fetch PDF open access link & thumbnail — non-blocking
      lookupOpenAccessPdf(result.data.doi).then(url => {
        if (url) setMetadata(prev => prev ? { ...prev, pdfUrl: url } : prev)
      })
      fetchThumbnail(result.data).then(url => {
        if (url) setThumbnail(url)
      })

    } catch {
      setErrorMsg("Terjadi kesalahan. Periksa koneksi internet dan coba lagi.")
      setStatus("error")
    }
  }

  const handleBatchSearch = async () => {
    const lines = parseBatchInput(batchInput)
    if (lines.length === 0) return

    setStatus("loading")
    setBatchResults(null)
    setBatchProgress({ done: 0, total: lines.length, current: lines[0] })

    const results = await runBatchSearch(lines, setBatchProgress)

    setBatchResults(results)
    setBatchProgress(null)
    setStatus("idle")
  }

  const handleKeyDown = (e) => { if (e.key === "Enter" && mode !== "batch") handleSearch() }

  const handleCopy = () => {
    navigator.clipboard.writeText(citation)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = () => {
    if (!metadata) return
    const res = saveToLibrary(metadata)
    if (res.ok || res.reason === "duplicate") setSaved(true)
  }

  const switchMode = (m) => {
    setMode(m)
    setInput(""); setBatchInput("")
    setStatus("idle"); setMetadata(null); setThumbnail(null)
    setBatchResults(null); setBatchProgress(null)
  }

  const hasResult = status === "success" && metadata
  const batchLineCount = parseBatchInput(batchInput).length

  return (
    <div className="app">
      <div className={`container ${hasResult ? "container-wide" : ""}`}>

        <header className="header">
          <div className="logo"><span className="logo-rose">ref</span><span className="logo-blue">-manager</span></div>
          <p className="tagline">Metadata jurnal lengkap, format daftar pustaka instan.</p>
        </header>

        <div className="top-tabs">
          <button className={`top-tab ${tab === "search" ? "active" : ""}`} onClick={() => setTab("search")}>Cari</button>
          <button className={`top-tab ${tab === "library" ? "active" : ""}`} onClick={() => setTab("library")}>Library</button>
        </div>

        {tab === "search" && (
          <>
            <div className="card search-card">
              <div className="mode-toggle">
                <button className={`mode-btn ${mode === "doi" ? "active" : ""}`} onClick={() => switchMode("doi")}>DOI</button>
                <button className={`mode-btn ${mode === "title" ? "active" : ""}`} onClick={() => switchMode("title")}>Judul</button>
                <button className={`mode-btn ${mode === "batch" ? "active" : ""}`} onClick={() => switchMode("batch")}>Banyak Sekaligus</button>
              </div>

              {mode !== "batch" ? (
                <div className="input-wrapper">
                  <input
                    className="input"
                    type="text"
                    placeholder={mode === "doi" ? "Contoh: 10.1109/JPROC.2014.2371999" : "Contoh: Software-Defined Networking: A Comprehensive Survey"}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button className="search-btn" onClick={handleSearch} disabled={status === "loading" || !input.trim()}>
                    {status === "loading" ? <span className="spinner" /> : <SearchIcon />}
                    <span>{status === "loading" ? "Mencari..." : "Cari"}</span>
                  </button>
                </div>
              ) : (
                <div className="batch-input-wrapper">
                  <textarea
                    className="batch-textarea"
                    rows={6}
                    placeholder={"Tempel DOI atau judul, satu per baris. Contoh:\n10.1109/JPROC.2014.2371999\nAttention Is All You Need\n10.1145/3292500.3330919"}
                    value={batchInput}
                    onChange={e => setBatchInput(e.target.value)}
                  />
                  <div className="batch-toolbar">
                    <span className="batch-count">
                      {batchLineCount} baris {batchLineCount >= MAX_BATCH_ITEMS && `(maks. ${MAX_BATCH_ITEMS})`}
                    </span>
                    <button className="search-btn" onClick={handleBatchSearch} disabled={status === "loading" || batchLineCount === 0}>
                      {status === "loading" ? <span className="spinner" /> : <SearchIcon />}
                      <span>{status === "loading" ? "Mencari..." : "Cari Semua"}</span>
                    </button>
                  </div>
                  {batchProgress && (
                    <div className="batch-progress">
                      <div className="batch-progress-bar">
                        <div className="batch-progress-fill" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
                      </div>
                      <p className="batch-progress-label">
                        {batchProgress.done}/{batchProgress.total}
                        {batchProgress.current ? ` — mencari: ${batchProgress.current}` : " — selesai"}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {status === "error" && mode !== "batch" && <p className="error-msg">{errorMsg}</p>}
            </div>

            {mode === "batch" && batchResults && (
              <BatchResults results={batchResults} />
            )}

            {hasResult && mode !== "batch" && (
              <div className="result-grid">

                {/* Kolom kiri: cover + abstract */}
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
                  </div>

                  {metadata.abstract && (
                    <div className="abstract-section">
                      <p className="abstract-text">{metadata.abstract}</p>
                    </div>
                  )}
                </div>

                {/* Kolom kanan: metadata + sitasi */}
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
                  </div>
                </div>

              </div>
            )}
          </>
        )}

        {tab === "library" && <LibraryPanel />}

        <footer className="footer">
          <p>Data dari <a href="https://crossref.org" target="_blank" rel="noreferrer">CrossRef</a>, <a href="https://datacite.org" target="_blank" rel="noreferrer">DataCite</a> & <a href="https://unpaywall.org" target="_blank" rel="noreferrer">Unpaywall</a></p>
        </footer>

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
