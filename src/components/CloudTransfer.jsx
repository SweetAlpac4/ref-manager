import { useState } from "react"

export default function CloudTransfer({ title, candidates, legend, description, empty, action, busy, onTransfer }) {
  const [ids, setIds] = useState(() => new Set())
  const selected = candidates.filter(item => ids.has(item.id))

  return <details className="library-backup cloud-copy">
    <summary>{title} ({candidates.length} available)</summary>
    <p>{description}</p>
    {candidates.length === 0 ? <p>{empty}</p> : <form onSubmit={async event => {
      event.preventDefault()
      if (!busy && selected.length && await onTransfer(selected)) setIds(new Set())
    }}>
      <div className="library-filters">
        <button type="button" className="link-pill" disabled={busy || selected.length === candidates.length}
          onClick={() => setIds(new Set(candidates.map(item => item.id)))}>Select all available</button>
        <button type="button" className="link-pill" disabled={busy || !selected.length}
          onClick={() => setIds(new Set())}>Clear selection</button>
      </div>
      <fieldset className="cloud-copy-list" disabled={busy}>
        <legend>{legend}</legend>
        {candidates.map(item => <label className="checkbox-label" key={item.id}>
          <input type="checkbox" checked={ids.has(item.id)} onChange={event => {
            const checked = event.target.checked
            setIds(previous => {
              const next = new Set(previous)
              if (checked) next.add(item.id)
              else next.delete(item.id)
              return next
            })
          }} />
          <span>{item.title}{item.year ? ` (${item.year})` : ""}</span>
        </label>)}
      </fieldset>
      <button className="link-pill button-primary" disabled={busy || !selected.length}>
        {action} ({selected.length})
      </button>
    </form>}
  </details>
}
