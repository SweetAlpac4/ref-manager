import { useState, useEffect } from "react"
import { saveToLibrary, getSavedDois } from "../lib/storage"
import ReferenceDetail from "./ReferenceDetail"

export default function BatchResults({ results, onSavedChange }) {
  const [savedDois, setSavedDois] = useState(() => new Set())
  const [openItem, setOpenItem] = useState(null)

  useEffect(() => {
    getSavedDois().then(setSavedDois)
  }, [])

  const handleSave = async (data, e) => {
    e.stopPropagation()
    const res = await saveToLibrary(data)
    if (res.ok || res.reason === "duplicate") {
      if (data.doi) setSavedDois(prev => new Set(prev).add(data.doi))
      onSavedChange?.()
    }
  }

  const handleSaveAll = async () => {
    const successes = results.filter(r => r.status === "success")
    for (const r of successes) {
      if (!r.data.doi || !savedDois.has(r.data.doi)) {
        await saveToLibrary(r.data)
      }
    }
    setSavedDois(await getSavedDois())
    onSavedChange?.()
  }

  if (openItem) {
    return (
      <ReferenceDetail
        key={openItem.doi || openItem.title}
        metadata={openItem}
        onBack={() => setOpenItem(null)}
        onSaveChange={onSavedChange}
      />
    )
  }

  const successCount = results.filter(r => r.status === "success").length

  return (
    <div className="batch-results">
      <div className="batch-summary">
        <p>{successCount} dari {results.length} ditemukan</p>
        {successCount > 0 && (
          <button className="search-btn batch-save-all" onClick={handleSaveAll}>Simpan Semua ke Library</button>
        )}
      </div>
      <ul className="batch-list">
        {results.map((r, idx) => {
          const isSaved = r.status === "success" && r.data.doi && savedDois.has(r.data.doi)
          return (
            <li
              key={idx}
              className={`batch-item batch-item-${r.status} ${r.status === "success" ? "clickable" : ""}`}
              onClick={() => r.status === "success" && setOpenItem(r.data)}
            >
              <div className="batch-item-main">
                <p className="batch-item-input">{r.input}</p>
                {r.status === "success" && (
                  <p className="batch-item-title">{r.data.title}</p>
                )}
                {r.status === "not_found" && (
                  <p className="batch-item-note">Tidak ditemukan</p>
                )}
                {r.status === "error" && (
                  <p className="batch-item-note">Gagal mengambil data</p>
                )}
              </div>
              {r.status === "success" && (
                <button
                  className="link-pill"
                  disabled={isSaved}
                  onClick={(e) => handleSave(r.data, e)}
                >
                  {isSaved ? "Tersimpan" : "Simpan"}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
