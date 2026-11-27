import { useState } from "react"
import { exportWorkspaceBackup, importWorkspaceBackup } from "../lib/workspaceBackup"

export default function LibraryBackup({ onImport, download }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  const exportBackup = async () => {
    setBusy(true)
    setMessage("")
    try {
      const filename = `ref-manager-backup-${new Date().toISOString().slice(0, 10)}.json`
      download(filename, await exportWorkspaceBackup(), "application/json")
      setMessage("Backup ready to download.")
    } catch {
      setMessage("Could not create a backup.")
    } finally {
      setBusy(false)
    }
  }

  const importBackup = async event => {
    const file = event.target.files[0]
    event.target.value = ""
    if (!file) return
    setBusy(true)
    setMessage("")
    try {
      const result = await importWorkspaceBackup(await file.text())
      await onImport()
      setMessage(`Added ${result.references} references, ${result.notes} notes, and ${result.attachments} PDF attachments.`)
    } catch (error) {
      setMessage(error.name === "QuotaExceededError" ? "There is not enough browser storage for this backup." : error.message)
    } finally {
      setBusy(false)
    }
  }

  return <details className="library-backup">
    <summary>Library backup</summary>
    <p>Backups include references, notes, PDFs, and annotations. Restoring a backup preserves existing library data.</p>
    <div className="library-filters">
      <button className="link-pill" disabled={busy} onClick={exportBackup}>Download backup</button>
      <label>Restore backup <input type="file" accept=".json,application/json" disabled={busy} onChange={importBackup} /></label>
    </div>
    {message && <p role="status">{message}</p>}
  </details>
}
