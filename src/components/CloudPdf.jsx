import { useEffect, useState } from "react"
import { downloadCloudPdf, hasCloudPdf, openCloudPdfUrl, removeCloudPdf, uploadCloudPdf } from "../lib/cloudLibrary"
import { downloadFile } from "../lib/download"

export default function CloudPdf({ record }) {
  const [status, setStatus] = useState("loading")
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    hasCloudPdf(record).then(exists => { if (active) setStatus(exists ? "attached" : "empty") })
      .catch(() => { if (active) setStatus("error") })
    return () => { active = false }
  }, [record, attempt])

  const refresh = () => {
    setStatus("loading")
    setAttempt(value => value + 1)
  }

  const run = async (action, success, failure) => {
    setBusy(true)
    setMessage("")
    setError("")
    try {
      await action()
      setMessage(success)
    } catch (error) {
      setError(error instanceof Error ? error.message : failure)
    } finally {
      setBusy(false)
      refresh()
    }
  }

  return <section className="note-item">
    <h4>Cloud PDF</h4>
    {status === "loading" && <p>Checking for an attachment…</p>}
    {status === "error" && <>
      <p role="alert">Could not load the cloud attachment.</p>
      <button type="button" className="link-pill" onClick={refresh}>Retry PDF check</button>
    </>}
    {status === "empty" && <label>
      Upload a private PDF (up to 20 MB)
      <input type="file" accept=".pdf,application/pdf" disabled={busy} onChange={event => {
        const [file] = event.target.files
        event.target.value = ""
        if (file) run(() => uploadCloudPdf(record, file), "PDF uploaded.", "Could not upload the PDF. Try again.")
      }} />
    </label>}
    {status === "attached" && <div className="link-row">
      <button type="button" className="link-pill" disabled={busy} onClick={() => {
        const tab = window.open("about:blank", "_blank")
        if (!tab) {
          setError("Allow pop-ups to open the PDF, or choose Download PDF.")
          return
        }
        tab.opener = null
        run(async () => {
          try {
            tab.location.replace(await openCloudPdfUrl(record))
          } catch (error) {
            tab.close()
            throw error
          }
        }, "PDF opened in a new tab.", "Could not open the PDF. Try again.")
      }}>Open PDF</button>
      <button type="button" className="link-pill" disabled={busy} onClick={() => run(async () => {
        const file = await downloadCloudPdf(record)
        downloadFile(`${record.title.slice(0, 120)}.pdf`, file)
      }, "PDF downloaded.", "Could not download the PDF. Try again.")}>Download PDF</button>
      <button type="button" className="link-pill link-pill-danger" disabled={busy} onClick={() => {
        if (window.confirm("Delete this PDF from the cloud library?")) {
          run(() => removeCloudPdf(record), "Cloud PDF deleted.", "Could not delete the PDF. Try again.")
        }
      }}>Delete cloud PDF</button>
    </div>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
