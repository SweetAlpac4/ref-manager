import { lazy, Suspense, useRef, useState, useEffect, useMemo } from "react"
import {
  READING_STATUSES, mergeReferences, getLibrary, saveToLibrary, removeFromLibrary, removeManyFromLibrary, exportLibraryAsBibtex,
  exportLibraryAsRis, exportLibraryAsJson, importLibraryFromJson,
  getAttachmentReferenceIds,
} from "../lib/storage"
import { duplicateScore } from "../lib/duplicates"
import { filterLibrary, SMART_COLLECTIONS } from "../lib/libraryFilters"
import { downloadFile } from "../lib/download"
import LibraryBackup from "./LibraryBackup"
import CitationWorkspace from "./CitationWorkspace"
import NotesPanel from "./NotesPanel"
import MetadataEditor from "./MetadataEditor"
import ReferenceDetail from "./ReferenceDetail"

const CloudLibrary = lazy(() => import("./CloudLibrary"))
const PdfLibrarySearch = lazy(() => import("./PdfLibrarySearch"))

const dateKey = (isoString) => (isoString || "").slice(0, 10) // "2026-09-14"

const dateLabel = (key) => {
  if (!key) return "Unknown date"
  const d = new Date(`${key}T00:00:00`)
  return d.toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })
}

export default function LibraryPanel() {
  const [items, setItems] = useState([])
  const [attachmentIds, setAttachmentIds] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [openItem, setOpenItem] = useState(null)
  const [importMsg, setImportMsg] = useState("")
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [showCloud, setShowCloud] = useState(false)
  const [showPdfSearch, setShowPdfSearch] = useState(false)
  const [pdfTarget, setPdfTarget] = useState(null)
  const [showCitations, setShowCitations] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [readingStatus, setReadingStatus] = useState("")
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState("")
  const [collection, setCollection] = useState("")
  const [tag, setTag] = useState("")
  const [year, setYear] = useState("")
  const [smart, setSmart] = useState("")
  const fileInputRef = useRef(null)

  const refresh = async () => {
    const [references, ids] = await Promise.all([getLibrary(), getAttachmentReferenceIds()])
    setItems(references)
    setAttachmentIds(new Set(ids))
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([getLibrary(), getAttachmentReferenceIds()]).then(([data, ids]) => {
      if (!cancelled) {
        setItems(data)
        setAttachmentIds(new Set(ids))
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setImportMsg("Could not load the local library. Reopen the library to try again.")
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  const collections = [...new Set(items.flatMap(item => item.collections ?? []))].sort()
  const tags = [...new Set(items.flatMap(item => item.tags ?? []))].sort()
  const years = [...new Set(items.map(item => item.year).filter(Boolean).map(String))].sort((a, b) => Number(b) - Number(a))
  const visible = useMemo(() => filterLibrary(items, { query, collection, tag, readingStatus, year, smart }, attachmentIds),
    [items, query, collection, tag, readingStatus, year, smart, attachmentIds])

  // kelompokkan item berdasarkan tanggal disimpan, urutan terbaru dulu
  const groups = useMemo(() => {
    const map = new Map()
    for (const item of visible) {
      const key = dateKey(item.savedAt)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(item)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [visible])

  const duplicatePairs = useMemo(() => showDuplicates
    ? items.flatMap((item, index) => items.slice(index + 1)
      .filter(other => duplicateScore(item, other) > 0).map(other => [item, other]))
    : [], [items, showDuplicates])

  const mergePair = async (keep, other) => {
    if (!window.confirm(`Keep “${keep.title}” and fill missing metadata from “${other.title}”?`)) return
    try {
      if (!await mergeReferences(keep.id, other.id)) throw new Error()
      setSelectedIds(new Set())
      await refresh()
      setImportMsg("References merged.")
    } catch {
      setImportMsg("Could not merge the references.")
    }
  }

  const allIds = useMemo(() => visible.map(i => i.id), [visible])
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id))

  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGroup = (groupIds) => {
    const groupAllSelected = groupIds.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const id of groupIds) {
        if (groupAllSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const toggleAll = () => {
    toggleGroup(allIds)
  }

  const handleRemove = async (id, e) => {
    e?.stopPropagation()
    const item = items.find(reference => reference.id === id)
    if (!window.confirm(`Delete “${item?.title}” and its PDF attachments?`)) return
    if (!await removeFromLibrary(id)) {
      setImportMsg("Could not delete the reference.")
      return
    }
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    await refresh()
    return true
  }

  const handleRemoveSelected = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete the selected references (${selectedIds.size}) and their PDF attachments from the library? This cannot be undone.`)) return
    if (!await removeManyFromLibrary([...selectedIds])) {
      setImportMsg("Could not delete the reference.")
      return
    }
    setSelectedIds(new Set())
    await refresh()
  }

  const handleImportClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const result = await importLibraryFromJson(text)
    if (!result.ok) {
      setImportMsg(result.error || "Could not import the file.")
    } else {
      setImportMsg(`Added: ${result.added}. Duplicates skipped: ${result.duplicates}. Invalid entries: ${result.skipped}.`)
      await refresh()
    }
    e.target.value = ""
  }

  const exportIds = selectedIds.size > 0 ? [...selectedIds] : null
  const exportCountLabel = selectedIds.size > 0 ? `${selectedIds.size} selected` : "all"

  if (showCloud) return <Suspense fallback={<p>Loading cloud library…</p>}>
    <CloudLibrary personalReferences={items} onPersonalChange={refresh} onBack={() => setShowCloud(false)} />
  </Suspense>

  if (showPdfSearch && !openItem) return <Suspense fallback={<p>Loading PDF search…</p>}>
    <PdfLibrarySearch references={items} onBack={() => setShowPdfSearch(false)}
      onOpen={(item, target) => { setPdfTarget(target); setOpenItem(item) }} />
  </Suspense>

  if (showCitations) return <CitationWorkspace references={items} onBack={() => setShowCitations(false)} />

  if (showNotes) return <NotesPanel onBack={() => setShowNotes(false)} />

  if (adding) {
    return <div className="card">
      <h2>Add reference</h2>
      <MetadataEditor onCancel={() => setAdding(false)} onSave={async changes => {
        const result = await saveToLibrary(changes)
        if (!result.ok) throw new Error(result.reason === "duplicate"
          ? "This reference is already in the library." : "Could not save the reference.")
        await refresh()
        setAdding(false)
      }} />
    </div>
  }

  if (openItem) {
    return (
      <ReferenceDetail
        key={openItem.id}
        metadata={openItem}
        pdfTarget={pdfTarget}
        onBack={() => { setPdfTarget(null); setOpenItem(null) }}
        onAttachmentsChange={async () => setAttachmentIds(new Set(await getAttachmentReferenceIds()))}
        onUpdate={async () => { await refresh() }}
        onDelete={async () => {
          if (!await handleRemove(openItem.id)) return
          setPdfTarget(null)
          setOpenItem(null)
        }}
      />
    )
  }

  if (loading) {
    return <div className="card library-empty"><p>Loading library…</p></div>
  }

  return (
    <div className="library-panel">
      <div className="page-heading">
        <div><h1>Your library</h1><p>{items.length} {items.length === 1 ? "reference" : "references"} saved in this browser</p></div>
        <div className="link-row">
          <button className="link-pill" onClick={handleImportClick}>Import .json</button>
          <button className="link-pill button-primary" onClick={() => setAdding(true)}>Add reference</button>
        </div>
      </div>
      {items.length === 0 && <p>Search for a reference or add one manually to start your library.</p>}
      <nav className="library-navigation" aria-label="Library tools">
        <button className="link-pill" onClick={() => setShowCloud(true)}>Cloud library</button>
        <button className="link-pill" disabled={!items.length} onClick={() => setShowPdfSearch(true)}>Search PDF contents</button>
        <button className="link-pill" onClick={() => setShowCitations(true)}>Citation workspace</button>
        <button className="link-pill" onClick={() => setShowNotes(true)}>Research notes</button>
      </nav>
      <div className="library-filters">
        <input type="search" aria-label="Search library" placeholder="Search title, author, DOI, or abstract" value={query} onChange={event => setQuery(event.target.value)} />
        <select aria-label="Smart collection" value={smart} onChange={event => setSmart(event.target.value)}>
          <option value="">All references</option>
          {SMART_COLLECTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Filter by collection" value={collection} onChange={event => setCollection(event.target.value)}>
          <option value="">All collections</option>
          {collections.map(value => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Filter by tag" value={tag} onChange={event => setTag(event.target.value)}>
          <option value="">All tags</option>
          {tags.map(value => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Filter by reading status" value={readingStatus} onChange={event => setReadingStatus(event.target.value)}>
          <option value="">All statuses</option>
          {READING_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Filter by publication year" value={year} onChange={event => setYear(event.target.value)}>
          <option value="">All publication years</option>
          {years.map(value => <option key={value}>{value}</option>)}
        </select>
      </div>
      {items.length > 0 && visible.length === 0 && <p>No matching references.</p>}
      <div className="library-toolbar">
        <div className="library-toolbar-left">
          <label className="checkbox-label">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={allIds.length === 0} />
            <span>Select visible references ({visible.length})</span>
          </label>
          <p className="library-count">Export: {exportCountLabel}</p>
        </div>
        <div className="library-actions">
          {selectedIds.size > 0 && (
            <button className="link-pill link-pill-danger" onClick={handleRemoveSelected}>
              Delete selected ({selectedIds.size})
            </button>
          )}
          <details className="action-menu">
            <summary className="menu-trigger">Export references</summary>
            <div className="menu-options" onClick={event => {
              if (event.target.closest("button")) event.currentTarget.closest("details").open = false
            }}>
              <button className="link-pill" onClick={async () => downloadFile("library.bib", await exportLibraryAsBibtex(exportIds))}>Export .bib</button>
              <button className="link-pill" onClick={async () => downloadFile("library.ris", await exportLibraryAsRis(exportIds))}>Export .ris</button>
              <button className="link-pill" onClick={async () => downloadFile("library.json", await exportLibraryAsJson(exportIds), "application/json")}>Export .json</button>
            </div>
          </details>
          <button className="link-pill" disabled={items.length < 2} onClick={() => setShowDuplicates(value => !value)}>
            {showDuplicates ? "Close duplicate review" : "Find duplicates"}
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileChange} />
        </div>
      </div>
      {importMsg && <p className="import-msg">{importMsg}</p>}
      {showDuplicates && <div className="card">
        {duplicatePairs.length === 0 && <p>No potential duplicates found.</p>}
        {duplicatePairs.map(([first, second]) => <div key={first.id + second.id}>
          {[first, second].map((item, index) => <div key={item.id}>
            <button className="link-pill" onClick={() => setOpenItem(item)}>
              {item.title} · {item.authors.join(", ")} · {item.year} {item.doi}
            </button>
            <button className="link-pill" onClick={() => mergePair(item, [second, first][index])}>
              Keep this reference
            </button>
          </div>)}
        </div>)}
      </div>}

      {groups.map(([key, groupItems]) => {
        const groupIds = groupItems.map(i => i.id)
        const groupAllSelected = groupIds.every(id => selectedIds.has(id))
        return (
          <div key={key} className="date-group">
            <div className="date-group-header">
              <label className="checkbox-label">
                <input type="checkbox" checked={groupAllSelected} onChange={() => toggleGroup(groupIds)} />
                <span>{dateLabel(key)}</span>
              </label>
              <span className="date-group-count">{groupItems.length} {groupItems.length === 1 ? "reference" : "references"}</span>
            </div>
            <ul className="library-list">
              {groupItems.map(item => (
                <li
                  key={item.id}
                  className={`library-item ${selectedIds.has(item.id) ? "selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.title}`}
                    checked={selectedIds.has(item.id)}
                    onClick={e => e.stopPropagation()}
                    onChange={() => toggleOne(item.id)}
                  />
                  <button className="library-item-main" onClick={() => setOpenItem(item)}>
                    <span className="library-item-title">{item.title}</span>
                    <span className="library-item-meta">
                      {(item.authors || []).join(", ")}
                      {item.year ? ` · ${item.year}` : ""}
                      {item.journal ? ` · ${item.journal}` : ""}
                    </span>
                    <span className="reference-tags">
                      <span className={`reference-tag status-${item.readingStatus ?? "unread"}`}>{READING_STATUSES.find(([value]) => value === (item.readingStatus ?? "unread"))?.[1]}</span>
                      {(item.tags ?? []).slice(0, 3).map(value => <span className="reference-tag" key={value}>{value}</span>)}
                      {(item.tags?.length ?? 0) > 3 && <span className="reference-tag">+{item.tags.length - 3}</span>}
                    </span>
                  </button>
                  <button className="remove-btn" onClick={(e) => handleRemove(item.id, e)} aria-label="Delete">✕</button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      <LibraryBackup onImport={refresh} download={downloadFile} />
    </div>
  )
}
