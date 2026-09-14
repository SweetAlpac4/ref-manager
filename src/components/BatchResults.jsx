import { useState } from "react"
import { saveToLibrary, isInLibrary } from "../lib/storage"

export default function BatchResults({ results, onSavedChange }) {
  const [savedInputs, setSavedInputs] = useState(() => new Set())

  const handleSave = (data, input) => {
    const res = saveToLibrary(data)
    if (res.ok || res.reason === "duplicate") {
      setSavedInputs(prev => new Set(prev).add(input))
      onSavedChange?.()
    }
  }

  const handleSaveAll = () => {
    for (const r of results) {
      if (r.status === "success" && !savedInputs.has(r.input)) {
        saveToLibrary(r.data)
      }
    }
    setSavedInputs(new Set(results.map(r => r.input)))
    onSavedChange?.()
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
        {results.map((r, idx) => (
          <li key={idx} className={`batch-item batch-item-${r.status}`}>
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
                disabled={savedInputs.has(r.input) || isInLibrary(r.data.doi)}
                onClick={() => handleSave(r.data, r.input)}
              >
                {savedInputs.has(r.input) || isInLibrary(r.data.doi) ? "Tersimpan" : "Simpan"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
