import { useState, useRef } from "react"
import { lookupDOI, searchByTitle } from "./lib/crossref"
import { parseBatchInput, runBatchSearch, MAX_BATCH_ITEMS } from "./lib/batch"
import BatchResults from "./components/BatchResults"
import LibraryPanel from "./components/LibraryPanel"
import ReferenceDetail from "./components/ReferenceDetail"
import { SearchIcon, BookIcon } from "./components/icons"
import { getInitialTheme, saveTheme } from "./lib/theme"
import "./App.css"

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme)
  const [tab, setTab] = useState("search") // "search" | "library"
  const [mode, setMode] = useState("doi") // "doi" | "title" | "batch"
  const [input, setInput] = useState("")
  const [batchInput, setBatchInput] = useState("")
  const [status, setStatus] = useState("idle")
  const [metadata, setMetadata] = useState(null)
  const [errorMsg, setErrorMsg] = useState("")

  const [batchProgress, setBatchProgress] = useState(null) // {done, total, current}
  const [batchResults, setBatchResults] = useState(null)

  // Token untuk menolak hasil dari request lama yang baru resolve belakangan
  // (mis. user ganti mode/input sebelum request sebelumnya selesai).
  const requestToken = useRef(0)

  const handleSearch = async () => {
    if (!input.trim()) return
    const token = ++requestToken.current
    setStatus("loading")
    setMetadata(null)
    setErrorMsg("")

    try {
      const result = mode === "doi"
        ? await lookupDOI(input.trim())
        : await searchByTitle(input.trim())

      if (token !== requestToken.current) return // request lama, ada request/mode baru menyusul

      if (!result) {
        setErrorMsg(mode === "doi"
          ? "No matching DOI was found in Crossref or DataCite. Check the DOI and try again."
          : "No matching title was found. Try a more specific title."
        )
        setStatus("error")
        return
      }

      setMetadata(result.data)
      setStatus("success")
    } catch {
      if (token !== requestToken.current) return
      setErrorMsg("Something went wrong. Check your internet connection and try again.")
      setStatus("error")
    }
  }

  const handleBatchSearch = async () => {
    const lines = parseBatchInput(batchInput)
    if (lines.length === 0) return
    const token = ++requestToken.current

    setStatus("loading")
    setBatchResults(null)
    setBatchProgress({ done: 0, total: lines.length, current: lines[0] })

    const results = await runBatchSearch(lines, (p) => {
      if (token === requestToken.current) setBatchProgress(p)
    })

    if (token !== requestToken.current) return // user sudah pindah mode/tab, buang hasilnya

    setBatchResults(results)
    setBatchProgress(null)
    setStatus("idle")
  }

  const handleKeyDown = (e) => { if (e.key === "Enter" && mode !== "batch") handleSearch() }

  const switchMode = (m) => {
    requestToken.current++ // batalkan request yang masih jalan dari mode sebelumnya
    setMode(m)
    setInput(""); setBatchInput("")
    setStatus("idle"); setMetadata(null)
    setBatchResults(null); setBatchProgress(null)
  }

  const switchTab = (t) => {
    requestToken.current++ // batalkan request yang masih jalan sebelum pindah tab
    setTab(t)
    setStatus("idle")
    setBatchProgress(null)
  }

  const hasResult = status === "success" && metadata
  const batchLineCount = parseBatchInput(batchInput).length

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="header">
          <svg className="brand-mark" viewBox="0 0 28 32" fill="none" aria-hidden="true">
            <path d="M7 3h17v25H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M4 25a3 3 0 0 1 3-3h17" stroke="currentColor" strokeWidth="1.7" />
            <path d="M15 3h5v10l-2.5-2L15 13V3Z" fill="currentColor" />
            <path d="M9 17h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <div><div className="logo"><span>ref</span><span className="logo-rest">-manager</span></div><p className="brand-caption">Research library</p></div>
        </header>
        <span className="nav-caption">Workspace</span>
        <nav className="top-tabs" aria-label="Main navigation">
          <button className={`top-tab ${tab === "search" ? "active" : ""}`} aria-current={tab === "search" ? "page" : undefined} onClick={() => switchTab("search")}><SearchIcon />Search</button>
          <button className={`top-tab ${tab === "library" ? "active" : ""}`} aria-current={tab === "library" ? "page" : undefined} onClick={() => switchTab("library")}><BookIcon />Library</button>
        </nav>
        <div className="sidebar-note">References are saved in this browser.</div>
      </aside>
      <div className="container">
        <div className="workspace-bar">
          <span>Workspace <span className="breadcrumb-divider">/</span> <strong>{tab === "search" ? "Search" : "Library"}</strong></span>
          <div className="theme-switch" role="group" aria-label="Color theme">
            {["light", "dark"].map(value => <button key={value} aria-pressed={theme === value} onClick={() => {
              setTheme(value)
              saveTheme(value)
            }}><span aria-hidden="true" className={`theme-swatch theme-swatch-${value}`} />{value === "light" ? "Light" : "Dark"}</button>)}
          </div>
        </div>
        <main>
        {tab === "search" && (
          <>
            <div className="page-heading search-heading">
              <div><h1>Search references</h1><p>Enter a DOI or paper title. Use Batch to search multiple references.</p></div>
            </div>
            <div className="card search-card">
              <div className="mode-toggle">
                <button className={`mode-btn ${mode === "doi" ? "active" : ""}`} onClick={() => switchMode("doi")}>DOI</button>
                <button className={`mode-btn ${mode === "title" ? "active" : ""}`} onClick={() => switchMode("title")}>Title</button>
                <button className={`mode-btn ${mode === "batch" ? "active" : ""}`} onClick={() => switchMode("batch")}>Batch</button>
              </div>

              {mode !== "batch" ? (
                <div className="input-wrapper">
                  <input
                    aria-label={mode === "doi" ? "Search by DOI" : "Search by title"}
                    className="input"
                    type="text"
                    placeholder={mode === "doi" ? "Example: 10.1109/JPROC.2014.2371999" : "Example: Software-Defined Networking: A Comprehensive Survey"}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button className="search-btn" onClick={handleSearch} disabled={status === "loading" || !input.trim()}>
                    {status === "loading" ? <span className="spinner" /> : <SearchIcon />}
                    <span>{status === "loading" ? "Searching…" : "Search"}</span>
                  </button>
                </div>
              ) : (
                <div className="batch-input-wrapper">
                  <textarea
                    aria-label="DOIs or titles to search"
                    className="batch-textarea"
                    rows={6}
                    placeholder={"Paste one DOI or title per line. For example:\n10.1109/JPROC.2014.2371999\nAttention Is All You Need\n10.1145/3292500.3330919"}
                    value={batchInput}
                    onChange={e => setBatchInput(e.target.value)}
                  />
                  <div className="batch-toolbar">
                    <span className="batch-count">
                      {batchLineCount} lines {batchLineCount >= MAX_BATCH_ITEMS && `(max. ${MAX_BATCH_ITEMS})`}
                    </span>
                    <button className="search-btn" onClick={handleBatchSearch} disabled={status === "loading" || batchLineCount === 0}>
                      {status === "loading" ? <span className="spinner" /> : <SearchIcon />}
                      <span>{status === "loading" ? "Searching…" : "Search all"}</span>
                    </button>
                  </div>
                  {batchProgress && (
                    <div className="batch-progress">
                      <div className="batch-progress-bar">
                        <div className="batch-progress-fill" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
                      </div>
                      <p className="batch-progress-label">
                        {batchProgress.done}/{batchProgress.total}
                        {batchProgress.current ? ` · Searching for ${batchProgress.current}` : " · Done"}
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
        </main>

        <footer className="footer">
          <p>Data from <a href="https://crossref.org" target="_blank" rel="noreferrer">CrossRef</a>, <a href="https://datacite.org" target="_blank" rel="noreferrer">DataCite</a> & <a href="https://unpaywall.org" target="_blank" rel="noreferrer">Unpaywall</a></p>
        </footer>

      </div>
    </div>
  )
}
