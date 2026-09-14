import { useState } from "react"
import { lookupDOI, searchByTitle } from "./lib/crossref"
import { parseBatchInput, runBatchSearch, MAX_BATCH_ITEMS } from "./lib/batch"
import BatchResults from "./components/BatchResults"
import LibraryPanel from "./components/LibraryPanel"
import ReferenceDetail from "./components/ReferenceDetail"
import { SearchIcon } from "./components/icons"
import "./App.css"

export default function App() {
  const [tab, setTab] = useState("search") // "search" | "library"
  const [mode, setMode] = useState("doi") // "doi" | "title" | "batch"
  const [input, setInput] = useState("")
  const [batchInput, setBatchInput] = useState("")
  const [status, setStatus] = useState("idle")
  const [metadata, setMetadata] = useState(null)
  const [errorMsg, setErrorMsg] = useState("")

  const [batchProgress, setBatchProgress] = useState(null) // {done, total, current}
  const [batchResults, setBatchResults] = useState(null)

  const handleSearch = async () => {
    if (!input.trim()) return
    setStatus("loading")
    setMetadata(null)
    setErrorMsg("")

    try {
      const result = mode === "doi"
        ? await lookupDOI(input.trim())
        : await searchByTitle(input.trim())

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

  const switchMode = (m) => {
    setMode(m)
    setInput(""); setBatchInput("")
    setStatus("idle"); setMetadata(null)
    setBatchResults(null); setBatchProgress(null)
  }

  const hasResult = status === "success" && metadata
  const batchLineCount = parseBatchInput(batchInput).length

  return (
    <div className="app">
      <div className="container">

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
              <ReferenceDetail key={metadata.doi || metadata.title} metadata={metadata} />
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
