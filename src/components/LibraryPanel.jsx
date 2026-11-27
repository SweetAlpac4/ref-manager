import { lazy, Suspense, useRef, useState, useEffect, useMemo } from "react"
import {
  READING_STATUSES, mergeReferences, getLibrary, saveToLibrary, removeFromLibrary, removeManyFromLibrary, exportLibraryAsBibtex,
  exportLibraryAsRis, exportLibraryAsJson, importLibraryFromJson,
} from "../lib/storage"
import { duplicateScore, normalizeText } from "../lib/duplicates"
import LibraryBackup from "./LibraryBackup"
import CitationWorkspace from "./CitationWorkspace"
import NotesPanel from "./NotesPanel"
import MetadataEditor from "./MetadataEditor"
import ReferenceDetail from "./ReferenceDetail"

const PdfLibrarySearch = lazy(() => import("./PdfLibrarySearch"))

const downloadFile = (filename, content, mime = "text/plain") => {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const dateKey = (isoString) => (isoString || "").slice(0, 10) // "2026-09-14"

const dateLabel = (key) => {
  if (!key) return "Tanggal tidak diketahui"
  const d = new Date(`${key}T00:00:00`)
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
}

export default function LibraryPanel() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [openItem, setOpenItem] = useState(null)
  const [importMsg, setImportMsg] = useState("")
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [showPdfSearch, setShowPdfSearch] = useState(false)
  const [pdfTarget, setPdfTarget] = useState(null)
  const [showCitations, setShowCitations] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [readingStatus, setReadingStatus] = useState("")
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState("")
  const [collection, setCollection] = useState("")
  const [tag, setTag] = useState("")
  const fileInputRef = useRef(null)

  const refresh = async () => {
    setItems(await getLibrary())
  }

  useEffect(() => {
    let cancelled = false
    getLibrary().then(data => {
      if (!cancelled) {
        setItems(data)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  const collections = [...new Set(items.flatMap(item => item.collections ?? []))].sort()
  const tags = [...new Set(items.flatMap(item => item.tags ?? []))].sort()
  const visible = useMemo(() => items.filter(item => {
    const terms = normalizeText(query).split(" ")
    const text = normalizeText([item.title, ...item.authors, item.journal, item.year, item.doi,
      item.isbn, item.abstract, ...(item.collections ?? []), ...(item.tags ?? [])].join(" "))
    return (!readingStatus || (item.readingStatus ?? "unread") === readingStatus) && (!collection || item.collections?.includes(collection))
      && (!tag || item.tags?.includes(tag)) && terms.every(term => text.includes(term))
  }), [items, query, collection, tag, readingStatus])

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
    if (!window.confirm(`Pertahankan “${keep.title}” dan isi metadata yang kosong dari “${other.title}”?`)) return
    try {
      if (!await mergeReferences(keep.id, other.id)) throw new Error()
      setSelectedIds(new Set())
      await refresh()
      setImportMsg("Referensi digabung.")
    } catch {
      setImportMsg("Gagal menggabungkan referensi.")
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
    if (!window.confirm(`Hapus “${item?.title}” beserta lampiran PDF-nya?`)) return
    if (!await removeFromLibrary(id)) {
      setImportMsg("Gagal menghapus referensi.")
      return
    }
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    await refresh()
    return true
  }

  const handleRemoveSelected = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Hapus ${selectedIds.size} referensi terpilih dari Library? Tindakan ini tidak bisa dibatalkan.`)) return
    if (!await removeManyFromLibrary([...selectedIds])) {
      setImportMsg("Gagal menghapus referensi.")
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
      setImportMsg(result.error || "Gagal mengimpor file.")
    } else {
      setImportMsg(`Berhasil: ${result.added} ditambahkan, ${result.duplicates} duplikat dilewati, ${result.skipped} tidak valid.`)
      await refresh()
    }
    e.target.value = ""
  }

  const exportIds = selectedIds.size > 0 ? [...selectedIds] : null
  const exportCountLabel = selectedIds.size > 0 ? `${selectedIds.size} terpilih` : "semua"

  if (showPdfSearch && !openItem) return <Suspense fallback={<p>Memuat pencarian PDF…</p>}>
    <PdfLibrarySearch references={items} onBack={() => setShowPdfSearch(false)}
      onOpen={(item, target) => { setPdfTarget(target); setOpenItem(item) }} />
  </Suspense>

  if (showCitations) return <CitationWorkspace references={items} onBack={() => setShowCitations(false)} />

  if (showNotes) return <NotesPanel onBack={() => setShowNotes(false)} />

  if (adding) {
    return <div className="card">
      <h2>Tambah referensi</h2>
      <MetadataEditor onCancel={() => setAdding(false)} onSave={async changes => {
        const result = await saveToLibrary(changes)
        if (!result.ok) throw new Error(result.reason === "duplicate"
          ? "Referensi ini sudah ada di library." : "Gagal menyimpan referensi.")
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
    return <div className="card library-empty"><p>Memuat library...</p></div>
  }

  return (
    <div className="library-panel">
      {items.length === 0 && <p>Belum ada referensi tersimpan. Cari atau tambahkan referensi untuk mulai.</p>}
      <LibraryBackup onImport={refresh} download={downloadFile} />
      <div className="library-filters">
        <input type="search" aria-label="Cari library" placeholder="Cari judul, penulis, DOI, atau abstrak" value={query} onChange={event => setQuery(event.target.value)} />
        <select aria-label="Filter koleksi" value={collection} onChange={event => setCollection(event.target.value)}>
          <option value="">Semua koleksi</option>
          {collections.map(value => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Filter tag" value={tag} onChange={event => setTag(event.target.value)}>
          <option value="">Semua tag</option>
          {tags.map(value => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Filter status baca" value={readingStatus} onChange={event => setReadingStatus(event.target.value)}>
          <option value="">Semua status baca</option>
          {READING_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {items.length > 0 && visible.length === 0 && <p>Tidak ada referensi yang cocok.</p>}
      <div className="library-toolbar">
        <div className="library-toolbar-left">
          <label className="checkbox-label">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={allIds.length === 0} />
            <span>Pilih yang terlihat ({visible.length})</span>
          </label>
          <p className="library-count">Ekspor: {exportCountLabel}</p>
        </div>
        <div className="library-actions">
          {selectedIds.size > 0 && (
            <button className="link-pill link-pill-danger" onClick={handleRemoveSelected}>
              Hapus yang Dipilih ({selectedIds.size})
            </button>
          )}
          <button className="link-pill" onClick={async () => downloadFile("library.bib", await exportLibraryAsBibtex(exportIds))}>Ekspor .bib</button>
          <button className="link-pill" onClick={async () => downloadFile("library.ris", await exportLibraryAsRis(exportIds))}>Ekspor .ris</button>
          <button className="link-pill" onClick={async () => downloadFile("library.json", await exportLibraryAsJson(exportIds), "application/json")}>Ekspor .json</button>
          <button className="link-pill" disabled={!items.length} onClick={() => setShowPdfSearch(true)}>Cari isi PDF</button>
          <button className="link-pill" onClick={() => setShowCitations(true)}>Ruang sitasi</button>
          <button className="link-pill" onClick={() => setShowNotes(true)}>Catatan riset</button>
          <button className="link-pill" onClick={() => setAdding(true)}>Tambah referensi</button>
          <button className="link-pill" onClick={handleImportClick}>Impor .json</button>
          <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileChange} />
        </div>
      </div>
      {importMsg && <p className="import-msg">{importMsg}</p>}

      <button className="link-pill" disabled={items.length < 2} onClick={() => setShowDuplicates(value => !value)}>
        {showDuplicates ? "Tutup pemeriksaan" : "Cari duplikat"}
      </button>
      {showDuplicates && <div className="card">
        {duplicatePairs.length === 0 && <p>Tidak ada kandidat duplikat.</p>}
        {duplicatePairs.map(([first, second]) => <div key={first.id + second.id}>
          {[first, second].map((item, index) => <div key={item.id}>
            <button className="link-pill" onClick={() => setOpenItem(item)}>
              {item.title} · {item.authors.join(", ")} · {item.year} {item.doi}
            </button>
            <button className="link-pill" onClick={() => mergePair(item, [second, first][index])}>
              Pertahankan referensi ini
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
              <span className="date-group-count">{groupItems.length} referensi</span>
            </div>
            <ul className="library-list">
              {groupItems.map(item => (
                <li
                  key={item.id}
                  className={`library-item ${selectedIds.has(item.id) ? "selected" : ""}`}
                  onClick={() => setOpenItem(item)}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onClick={e => e.stopPropagation()}
                    onChange={() => toggleOne(item.id)}
                  />
                  <div className="library-item-main">
                    <p className="library-item-title">{item.title}</p>
                    <p className="library-item-meta">
                      {(item.authors || []).join(", ")}
                      {item.year ? ` · ${item.year}` : ""}
                      {item.journal ? ` · ${item.journal}` : ""}
                    </p>
                  </div>
                  <button className="remove-btn" onClick={(e) => handleRemove(item.id, e)} aria-label="Hapus">✕</button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
