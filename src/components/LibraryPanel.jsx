import { useRef, useState } from "react"
import {
  getLibrary, removeFromLibrary, exportLibraryAsBibtex,
  exportLibraryAsRis, exportLibraryAsJson, importLibraryFromJson,
} from "../lib/storage"

const downloadFile = (filename, content, mime = "text/plain") => {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function LibraryPanel() {
  const [items, setItems] = useState(() => getLibrary())
  const [importMsg, setImportMsg] = useState("")
  const fileInputRef = useRef(null)

  const refresh = () => setItems(getLibrary())

  const handleRemove = (id) => {
    removeFromLibrary(id)
    refresh()
  }

  const handleImportClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const result = importLibraryFromJson(text)
    if (!result.ok) {
      setImportMsg(result.error || "Gagal mengimpor file.")
    } else {
      setImportMsg(`Berhasil: ${result.added} ditambahkan, ${result.duplicates} duplikat dilewati, ${result.skipped} tidak valid.`)
      refresh()
    }
    e.target.value = ""
  }

  if (items.length === 0) {
    return (
      <div className="card library-empty">
        <p>Belum ada referensi tersimpan. Cari referensi lalu klik &quot;Simpan ke Library&quot;.</p>
        <div className="library-actions">
          <button className="link-pill" onClick={handleImportClick}>Impor dari JSON</button>
          <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileChange} />
        </div>
        {importMsg && <p className="import-msg">{importMsg}</p>}
      </div>
    )
  }

  return (
    <div className="library-panel">
      <div className="library-toolbar">
        <p className="library-count">{items.length} referensi tersimpan</p>
        <div className="library-actions">
          <button className="link-pill" onClick={() => downloadFile("library.bib", exportLibraryAsBibtex())}>Ekspor .bib</button>
          <button className="link-pill" onClick={() => downloadFile("library.ris", exportLibraryAsRis())}>Ekspor .ris</button>
          <button className="link-pill" onClick={() => downloadFile("library.json", exportLibraryAsJson(), "application/json")}>Ekspor .json</button>
          <button className="link-pill" onClick={handleImportClick}>Impor .json</button>
          <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileChange} />
        </div>
      </div>
      {importMsg && <p className="import-msg">{importMsg}</p>}
      <ul className="library-list">
        {items.map(item => (
          <li key={item.id} className="library-item">
            <div>
              <p className="library-item-title">{item.title}</p>
              <p className="library-item-meta">
                {(item.authors || []).join(", ")}
                {item.year ? ` · ${item.year}` : ""}
                {item.journal ? ` · ${item.journal}` : ""}
              </p>
            </div>
            <button className="remove-btn" onClick={() => handleRemove(item.id)} aria-label="Hapus">✕</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
