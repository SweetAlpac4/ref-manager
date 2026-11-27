import { useEffect, useState } from "react"
import { getCloudReference } from "../lib/cloudLibrary"
import { rebaseCloudDraft } from "../lib/cloudChanges"

const fieldLabels = {
  readingStatus: "Reading status", pdfUrl: "PDF URL", url: "Source URL",
}

const displayValue = value => (Array.isArray(value) ? value.join(", ") : value) || "(empty)"

export default function CloudConflict({ base, draft, onSave, onContinue, busy }) {
  const [attempt, setAttempt] = useState(0)
  const [latest, setLatest] = useState(undefined)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    getCloudReference(base.id).then(record => { if (active) setLatest(record) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [base.id, attempt])

  const comparison = latest && rebaseCloudDraft(base, latest, draft)
  return <section className="note-item">
    <h4>Review cloud changes</h4>
    <p role="status">Your draft is still open.</p>
    {failed && <p role="alert">Could not load the latest version.</p>}
    {failed && <button type="button" className="link-pill" onClick={() => {
      setFailed(false)
      setAttempt(value => value + 1)
    }}>Retry comparison</button>}
    {!failed && latest === undefined && <p>Loading the latest reference…</p>}
    {latest === null && <p role="alert">The cloud reference was deleted. You can go back to your fields and copy your edits.</p>}
    {comparison && <>
      {comparison.conflicts.length ? <dl>
        {comparison.conflicts.map(({ field, latest: saved, draft: edited }) => <div key={field}>
          <dt>{fieldLabels[field] ?? field}</dt>
          <dd className="note-body">Latest cloud version · {displayValue(saved)}</dd>
          <dd className="note-body">Your draft · {displayValue(edited)}</dd>
        </div>)}
      </dl> : <p>Your edits can be applied to the latest version.</p>}
      <div className="link-row">
        <button type="button" className="link-pill" disabled={busy}
          onClick={() => onSave(latest, rebaseCloudDraft(base, latest, draft, true).changes)}>
          {comparison.conflicts.length ? "Use my values for conflicts" : "Apply my edits"}
        </button>
        {comparison.conflicts.length > 0 && <button type="button" className="link-pill" disabled={busy}
          onClick={() => onSave(latest, comparison.changes)}>Keep latest values for conflicts</button>}
      </div>
    </>}
    <button type="button" className="link-pill" disabled={busy} onClick={onContinue}>Continue editing draft</button>
  </section>
}
