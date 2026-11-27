import { useRef, useState, useEffect, useMemo } from "react"
import {
  mergeReferences, getLibrary, saveToLibrary, removeFromLibrary, removeManyFromLibrary, exportLibraryAsBibtex,
  exportLibraryAsRis, exportLibraryAsJson, importLibraryFromJson,
} from "../lib/storage"
import { duplicateScore, normalizeText } from "../lib/duplicates"
import MetadataEditor from "./MetadataEditor"
import ReferenceDetail from "./ReferenceDetail"

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
    return (!collection || item.collections?.includes(collection))
      && (!tag || item.tags?.includes(tag)) && terms.every(term => text.includes(term))
  }), [items, query, collection, tag])

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
    setSelectedIds(allSelected ? new Set() : new Set(allIds))
  }

  const handleRemove = async (id, e) => {
    e.stopPropagation()
    await removeFromLibrary(id)
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    await refresh()
  }

  const handleRemoveSelected = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Hapus ${selectedIds.size} referensi terpilih dari Library? Tindakan ini tidak bisa dibatalkan.`)) return
    await removeManyFromLibrary([...selectedIds])
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
        onBack={() => setOpenItem(null)}
        onUpdate={async () => { await refresh() }}
        onDelete={async () => {
          await removeFromLibrary(openItem.id)
          setSelectedIds(prev => { const next = new Set(prev); next.delete(openItem.id); return next })
          await refresh()
          setOpenItem(null)
        }}
      />
    )
  }

  if (loading) {
    return <div className="card library-empty"><p>Memuat library...</p></div>
  }

  if (items.length === 0) {
    return (
      <div className="card library-empty">
        <p>Belum ada referensi tersimpan. Cari referensi lalu klik &quot;Simpan ke Library&quot;.</p>
        <div className="library-actions">
          <button className="link-pill" onClick={() => setAdding(true)}>Tambah referensi</button>
          <button className="link-pill" onClick={handleImportClick}>Impor dari JSON</button>
          <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileChange} />
        </div>
        {importMsg && <p className="import-msg">{importMsg}</p>}
      </div>
    )
  }

  return (
    <div className="library-panel">
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
      </div>
      {visible.length === 0 && <p>Tidak ada referensi yang cocok.</p>}
      <div className="library-toolbar">
        <div className="library-toolbar-left">
          <label className="checkbox-label">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
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
          <button className="link-pill" onClick={() => setAdding(true)}>Tambah referensi</button>
          <button className="link-pill" onClick={handleImportClick}>Impor .json</button>
          <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileChange} />
        </div>
      </div>
      {importMsg && <p className="import-msg">{importMsg}</p>}

      <button className="link-pill" onClick={() => setShowDuplicates(value => !value)}>
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
