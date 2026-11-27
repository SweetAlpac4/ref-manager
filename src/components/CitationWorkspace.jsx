import { useEffect, useMemo, useState } from "react"
import { formatCitationWorkspace, initCitationStyles, registerCitationStyle, WORKSPACE_STYLES } from "../lib/citation"
import { createWordManifest } from "../lib/wordAddIn"
import { createCitationBundle } from "../lib/wordCitations"
import { downloadFile } from "../lib/download"
import { cleanCitationMarkup, copyCitation } from "../lib/citationClipboard"
import { fetchCatalogStyle, prepareCustomStyle } from "../lib/cslImport"

const DRAFT_KEY = "ref-manager-citation-draft"

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY))
    if (Array.isArray(draft) && draft.every(group => typeof group?.id === "string"
      && Array.isArray(group.items) && group.items.every(item => typeof item?.id === "string"))) return draft
  } catch {
    // A missing or invalid draft starts with an empty workspace.
  }
  return []
}

export default function CitationWorkspace({ references, onBack }) {
  const [groups, setGroups] = useState(loadDraft)
  const [styles, setStyles] = useState(WORKSPACE_STYLES)
  const [style, setStyle] = useState("apa")
  const [status, setStatus] = useState("loading")
  const [message, setMessage] = useState("")
  const [pick, setPick] = useState("")
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showStyles, setShowStyles] = useState(false)

  useEffect(() => {
    let active = true
    initCitationStyles().then(() => { if (active) setStatus("ready") })
      .catch(() => { if (active) setStatus("error") })
    return () => { active = false }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(groups))
    } catch {
      // Editing remains available when browser storage is unavailable.
    }
  }, [groups])

  const sorted = useMemo(() => [...references].sort((a, b) => a.title.localeCompare(b.title)), [references])
  const referencesById = useMemo(() => new Map(references.map(item => [item.id, item])), [references])
  const missing = groups.some(group => group.items.some(item => !referencesById.has(item.id)))
  const output = useMemo(() => {
    if (status !== "ready" || groups.length === 0 || missing) return null
    try {
      const text = formatCitationWorkspace(references, groups, style)
      const html = formatCitationWorkspace(references, groups, style, "html")
      return {
        ...text,
        htmlBibliography: cleanCitationMarkup(html.bibliography),
        htmlCitations: new Map(html.citations.map(citation => [citation.id, cleanCitationMarkup(citation.value)])),
      }
    } catch {
      return { error: true }
    }
  }, [groups, references, status, style, missing])

  const addGroup = event => {
    event.preventDefault()
    const id = pick || sorted[0]?.id
    if (id) setGroups(values => [...values, { id: crypto.randomUUID(), items: [{ id }] }])
  }

  const updateGroup = (id, edit) => setGroups(values => values.map(group => group.id === id ? edit(group) : group))
  const updateItem = (id, index, patch) => updateGroup(id, group => ({
    ...group, items: group.items.map((item, position) => index === position ? { ...item, ...patch } : item),
  }))

  const moveGroup = (index, direction) => setGroups(values => {
    const next = [...values]
    const to = index + direction
    if (index < 0 || to < 0 || to >= next.length) return values
    const [group] = next.splice(index, 1)
    next.splice(to, 0, group)
    return next
  })

  const importStyle = async read => {
    setImporting(true)
    setMessage("")
    try {
      const custom = await prepareCustomStyle(await read())
      const id = `custom-${crypto.randomUUID()}`
      registerCitationStyle(id, custom.xml)
      setStyles(items => [...items, { id, label: custom.label }])
      setStyle(id)
      setMessage("CSL style added for this session.")
    } catch (error) {
      setMessage(error.message || "Could not import the CSL style.")
    } finally {
      setImporting(false)
    }
  }

  const copy = async (text, html, notice) => {
    try {
      await copyCitation(text, html)
      setMessage(notice)
    } catch {
      setMessage("Could not copy. Select the result to copy it manually.")
    }
  }

  const downloadWord = async () => {
    setExporting(true)
    setMessage("")
    try {
      const { exportCitationDocx } = await import("../lib/citationDocx")
      const label = styles.find(item => item.id === style)?.label
      downloadFile("citation-draft.docx", await exportCitationDocx(output, groups, label))
      setMessage("Word document ready.")
    } catch {
      setMessage("Could not create the Word document.")
    } finally {
      setExporting(false)
    }
  }

  const downloadCitationFile = () => {
    const bundle = createCitationBundle(output, style, styles.find(item => item.id === style)?.label, groups, references)
    downloadFile("ref-manager-citations.json", JSON.stringify(bundle, null, 2), "application/json")
  }

  return <section className="card citation-workspace">
    <button className="back-btn" onClick={onBack}>Back to library</button>
    <h2>Citation workspace</h2>
    <div className="library-filters">
      <label>Citation style <select aria-label="Citation style" value={style} onChange={event => setStyle(event.target.value)}>
        {styles.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <button className="link-pill" onClick={() => setShowStyles(value => !value)}>Add a CSL style</button>
    </div>
    {showStyles && <div className="note-item">
      <p><a href="https://www.zotero.org/styles" target="_blank" rel="noreferrer">Browse the CSL style catalog</a></p>
      <form className="library-filters" onSubmit={event => {
        event.preventDefault()
        const slug = new FormData(event.currentTarget).get("slug")
        importStyle(() => fetchCatalogStyle(slug))
      }}>
        <input name="slug" aria-label="CSL style ID" placeholder="Style ID, for example nature" required />
        <button className="link-pill" disabled={importing}>Get style</button>
      </form>
      <label>Import CSL file <input type="file" accept=".csl" disabled={importing} onChange={event => {
        const file = event.target.files[0]
        event.target.value = ""
        if (file) importStyle(() => file.text())
      }} /></label>
    </div>}
    {message && <p role="status">{message}</p>}
    {status === "error" && <p role="alert">Could not load the built-in styles. Reopen the citation workspace to try again.</p>}
    {missing && <p role="alert">A source was deleted. Replace the source or remove its citation.</p>}
    {output?.error && <p role="alert">Could not format this draft. Choose another style or check the CSL file.</p>}
    {sorted.length === 0 ? <p>Save a reference to your library to start building citations.</p> : <form className="library-filters" onSubmit={addGroup}>
      <select aria-label="Reference for new citation" value={pick || sorted[0].id} onChange={event => setPick(event.target.value)}>
        {sorted.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
      <button className="link-pill">Add citation</button>
    </form>}
    {groups.map((group, index) => {
      const result = output?.citations?.find(item => item.id === group.id)
      const markup = output?.htmlCitations?.get(group.id)
      const label = output?.noteStyle ? "Footnote" : "Citation"
      const nextReference = sorted.find(item => !group.items.some(source => source.id === item.id))
      return <article className="note-item" key={group.id}>
        <h3>{label} {index + 1}</h3>
        {group.items.map((item, itemIndex) => <div className="reference-fields" key={itemIndex}>
          <label>Source {itemIndex + 1}<select value={item.id} onChange={event => updateItem(group.id, itemIndex, { id: event.target.value })}>
            {!referencesById.has(item.id) && <option value={item.id}>Reference deleted</option>}
            {sorted.filter(ref => ref.id === item.id || !group.items.some(source => source.id === ref.id))
              .map(ref => <option key={ref.id} value={ref.id}>{ref.title}</option>)}
          </select></label>
          <div className="citation-item-fields">
            <label>Locator type<select value={item.label || "page"} onChange={event => updateItem(group.id, itemIndex, { label: event.target.value })}>
              <option value="page">Page</option>
              <option value="chapter">Chapter</option>
              <option value="section">Section</option>
              <option value="paragraph">Paragraph</option>
            </select></label>
            <label>Locator<input value={item.locator || ""} onChange={event => updateItem(group.id, itemIndex, { locator: event.target.value })} /></label>
            <label>Prefix<input value={item.prefix || ""} onChange={event => updateItem(group.id, itemIndex, { prefix: event.target.value })} /></label>
            <label>Suffix<input value={item.suffix || ""} onChange={event => updateItem(group.id, itemIndex, { suffix: event.target.value })} /></label>
          </div>
          <label className="checkbox-label"><input type="checkbox" checked={Boolean(item.suppressAuthor)}
            onChange={event => updateItem(group.id, itemIndex, { suppressAuthor: event.target.checked })} /> Suppress author name</label>
          {group.items.length > 1 && <button className="link-pill" onClick={() => updateGroup(group.id, current => ({
            ...current, items: current.items.filter((_, position) => position !== itemIndex),
          }))}>Remove source</button>}
        </div>)}
        <details>
          <summary>Document text for export</summary>
          <div className="reference-fields">
            <label>Text before this citation<textarea rows={3} value={group.paragraph ?? ""}
              onChange={event => updateGroup(group.id, current => ({ ...current, paragraph: event.target.value }))} /></label>
          </div>
        </details>
        {result && <p className="citation-text" dangerouslySetInnerHTML={{ __html: markup }} />}
        <div className="link-row">
          <button className="link-pill" disabled={!nextReference} onClick={() => updateGroup(group.id, current => ({
            ...current, items: [...current.items, { id: nextReference.id }],
          }))}>Add source</button>
          <button className="link-pill" disabled={index === 0} onClick={() => moveGroup(index, -1)}>Move up</button>
          <button className="link-pill" disabled={index === groups.length - 1} onClick={() => moveGroup(index, 1)}>Move down</button>
          <button className="link-pill" disabled={!result} onClick={() => copy(result.value, markup, `${label} copied.`)}>Copy {label.toLowerCase()}</button>
          <button className="link-pill link-pill-danger" onClick={() => setGroups(values => values.filter(item => item.id !== group.id))}>Remove citation</button>
        </div>
      </article>
    })}
    {output && !output.error && <section className="note-item">
      <div className="link-row citation-downloads">
      <button className="link-pill" disabled={exporting} onClick={downloadWord}>
        {exporting ? "Creating Word document…" : "Download Word document (.docx)"}
      </button>
      {!output.noteStyle && <button className="link-pill" onClick={downloadCitationFile}>
        Download citation file
      </button>}
      {window.location.protocol === "https:" && <button className="link-pill" onClick={() => {
        downloadFile("ref-manager-word.xml", createWordManifest(window.location.origin), "application/xml")
      }}>Download Word add-in manifest</button>}
      </div>
      <h3>Bibliography</h3>
      {output.bibliography ? <>
        <div className="citation-text bibliography-output" dangerouslySetInnerHTML={{ __html: output.htmlBibliography }} />
        <button className="link-pill" onClick={() => copy(output.bibliography, output.htmlBibliography, "Bibliography copied.")}>Copy bibliography</button>
      </> : <p>This style produces citations only.</p>}
    </section>}
  </section>
}
