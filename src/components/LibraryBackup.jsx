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
      setMessage("Backup siap diunduh.")
    } catch {
      setMessage("Gagal membuat backup.")
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
      setMessage(`${result.references} referensi, ${result.notes} catatan, dan ${result.attachments} PDF ditambahkan.`)
    } catch (error) {
      setMessage(error.name === "QuotaExceededError" ? "Penyimpanan browser tidak cukup untuk backup ini." : error.message)
    } finally {
      setBusy(false)
    }
  }

  return <details className="library-backup">
    <summary>Backup library</summary>
    <p>Backup mencakup referensi, catatan, PDF, dan anotasi. Impor mempertahankan data yang sudah ada di browser ini.</p>
    <div className="library-filters">
      <button className="link-pill" disabled={busy} onClick={exportBackup}>Unduh backup</button>
      <label>Pulihkan backup <input type="file" accept=".json,application/json" disabled={busy} onChange={importBackup} /></label>
    </div>
    {message && <p role="status">{message}</p>}
  </details>
}
