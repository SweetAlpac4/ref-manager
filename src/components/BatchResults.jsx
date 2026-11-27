import { useState, useEffect, useMemo } from "react"
import { saveToLibrary, getSavedMatches } from "../lib/storage"
import ReferenceDetail from "./ReferenceDetail"

export default function BatchResults({ results, onSavedChange }) {
  const [savedItems, setSavedItems] = useState(() => new Set())
  const [openItem, setOpenItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const candidates = useMemo(() => results.filter(result => result.status === "success").map(result => result.data), [results])

  useEffect(() => {
    let active = true
    getSavedMatches(candidates).then(matches => { if (active) setSavedItems(matches) })
      .catch(() => { if (active) setMessage("Could not check saved references.") })
    return () => { active = false }
  }, [candidates])

  const markSaved = async () => {
    try {
      setSavedItems(await getSavedMatches(candidates))
      onSavedChange?.()
    } catch {
      setMessage("Could not check saved references.")
    }
  }

  const handleSave = async (data, event) => {
    event.stopPropagation()
    setMessage("")
    const result = await saveToLibrary(data)
    if (result.ok || result.reason === "duplicate") {
      await markSaved()
    } else {
      setMessage("Could not save the reference.")
    }
  }

  const handleSaveAll = async () => {
    setSaving(true)
    setMessage("")
    try {
      let failed = 0
      for (const data of candidates) {
        if (!savedItems.has(data)) {
          const result = await saveToLibrary(data)
          if (!result.ok && result.reason !== "duplicate") failed++
        }
      }
      await markSaved()
      if (failed) setMessage(`References that could not be saved: ${failed}.`)
    } finally {
      setSaving(false)
    }
  }

  if (openItem) {
    return (
      <ReferenceDetail
        key={openItem.doi || openItem.title}
        metadata={openItem}
        onBack={() => setOpenItem(null)}
        onSaveChange={markSaved}
      />
    )
  }

  const successCount = candidates.length

  return (
    <div className="batch-results">
      <div className="batch-summary">
        <p>Found {successCount} of {results.length}</p>
        {successCount > 0 && (
          <button className="search-btn batch-save-all" onClick={handleSaveAll} disabled={saving}>Save all to library</button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      <ul className="batch-list">
        {results.map((r, idx) => {
          const isSaved = r.status === "success" && savedItems.has(r.data)
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
                  <p className="batch-item-note">Not found</p>
                )}
                {r.status === "error" && (
                  <p className="batch-item-note">Could not retrieve data</p>
                )}
              </div>
              {r.status === "success" && (
                <button
                  className="link-pill"
                  disabled={isSaved || saving}
                  onClick={(e) => handleSave(r.data, e)}
                >
                  {isSaved ? "Saved" : "Save"}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
