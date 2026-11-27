import { useEffect, useMemo, useState } from "react"
import { formatCitationWorkspace, initCitationStyles, registerCitationStyle, WORKSPACE_STYLES } from "../lib/citation"
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
      setMessage("Gaya CSL ditambahkan untuk sesi ini.")
    } catch (error) {
      setMessage(error.message || "Gagal mengimpor gaya CSL.")
    } finally {
      setImporting(false)
    }
  }

  const copy = async (text, html, notice) => {
    try {
      await copyCitation(text, html)
      setMessage(notice)
    } catch {
      setMessage("Gagal menyalin. Pilih teks hasil untuk menyalin secara manual.")
    }
  }

  return <section className="card citation-workspace">
    <button className="back-btn" onClick={onBack}>Kembali ke Library</button>
    <h2>Ruang sitasi</h2>
    <div className="library-filters">
      <label>Gaya sitasi <select value={style} onChange={event => setStyle(event.target.value)}>
        {styles.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <button className="link-pill" onClick={() => setShowStyles(value => !value)}>Tambah gaya CSL</button>
    </div>
    {showStyles && <div className="note-item">
      <p><a href="https://www.zotero.org/styles" target="_blank" rel="noreferrer">Buka katalog gaya CSL</a></p>
      <form className="library-filters" onSubmit={event => {
        event.preventDefault()
        const slug = new FormData(event.currentTarget).get("slug")
        importStyle(() => fetchCatalogStyle(slug))
      }}>
        <input name="slug" aria-label="ID gaya CSL" placeholder="ID gaya, misalnya nature" required />
        <button className="link-pill" disabled={importing}>Ambil gaya</button>
      </form>
      <label>Impor file CSL <input type="file" accept=".csl" disabled={importing} onChange={event => {
        const file = event.target.files[0]
        event.target.value = ""
        if (file) importStyle(() => file.text())
      }} /></label>
    </div>}
    {message && <p role="status">{message}</p>}
    {status === "error" && <p role="alert">Gaya bawaan gagal dimuat. Buka ulang ruang sitasi untuk mencoba lagi.</p>}
    {missing && <p role="alert">Ada sumber yang sudah dihapus. Ganti sumber atau hapus sitasinya.</p>}
    {output?.error && <p role="alert">Gaya ini gagal memformat draf. Pilih gaya lain atau periksa file CSL.</p>}
    {sorted.length === 0 ? <p>Simpan referensi ke Library untuk mulai membuat sitasi.</p> : <form className="library-filters" onSubmit={addGroup}>
      <select aria-label="Referensi untuk sitasi baru" value={pick || sorted[0].id} onChange={event => setPick(event.target.value)}>
        {sorted.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
      <button className="link-pill">Tambah sitasi</button>
    </form>}
    {groups.map((group, index) => {
      const result = output?.citations?.find(item => item.id === group.id)
      const markup = output?.htmlCitations?.get(group.id)
      const label = output?.noteStyle ? "Catatan kaki" : "Sitasi"
      const nextReference = sorted.find(item => !group.items.some(source => source.id === item.id))
      return <article className="note-item" key={group.id}>
        <h3>{label} {index + 1}</h3>
        {group.items.map((item, itemIndex) => <div className="reference-fields" key={itemIndex}>
          <label>Sumber {itemIndex + 1}<select value={item.id} onChange={event => updateItem(group.id, itemIndex, { id: event.target.value })}>
            {!referencesById.has(item.id) && <option value={item.id}>Referensi dihapus</option>}
            {sorted.filter(ref => ref.id === item.id || !group.items.some(source => source.id === ref.id))
              .map(ref => <option key={ref.id} value={ref.id}>{ref.title}</option>)}
          </select></label>
          <div className="citation-item-fields">
            <label>Jenis penunjuk<select value={item.label || "page"} onChange={event => updateItem(group.id, itemIndex, { label: event.target.value })}>
              <option value="page">Halaman</option>
              <option value="chapter">Bab</option>
              <option value="section">Bagian</option>
              <option value="paragraph">Paragraf</option>
            </select></label>
            <label>Nomor penunjuk<input value={item.locator || ""} onChange={event => updateItem(group.id, itemIndex, { locator: event.target.value })} /></label>
            <label>Teks sebelum<input value={item.prefix || ""} onChange={event => updateItem(group.id, itemIndex, { prefix: event.target.value })} /></label>
            <label>Teks sesudah<input value={item.suffix || ""} onChange={event => updateItem(group.id, itemIndex, { suffix: event.target.value })} /></label>
          </div>
          <label className="checkbox-label"><input type="checkbox" checked={Boolean(item.suppressAuthor)}
            onChange={event => updateItem(group.id, itemIndex, { suppressAuthor: event.target.checked })} /> Sembunyikan nama penulis</label>
          {group.items.length > 1 && <button className="link-pill" onClick={() => updateGroup(group.id, current => ({
            ...current, items: current.items.filter((_, position) => position !== itemIndex),
          }))}>Hapus sumber</button>}
        </div>)}
        {result && <p className="citation-text" dangerouslySetInnerHTML={{ __html: markup }} />}
        <div className="link-row">
          <button className="link-pill" disabled={!nextReference} onClick={() => updateGroup(group.id, current => ({
            ...current, items: [...current.items, { id: nextReference.id }],
          }))}>Tambah sumber</button>
          <button className="link-pill" disabled={index === 0} onClick={() => moveGroup(index, -1)}>Geser ke atas</button>
          <button className="link-pill" disabled={index === groups.length - 1} onClick={() => moveGroup(index, 1)}>Geser ke bawah</button>
          <button className="link-pill" disabled={!result} onClick={() => copy(result.value, markup, `${label} disalin.`)}>Salin {label.toLowerCase()}</button>
          <button className="link-pill link-pill-danger" onClick={() => setGroups(values => values.filter(item => item.id !== group.id))}>Hapus sitasi</button>
        </div>
      </article>
    })}
    {output && !output.error && <section className="note-item">
      <h3>Daftar pustaka</h3>
      {output.bibliography ? <>
        <div className="citation-text bibliography-output" dangerouslySetInnerHTML={{ __html: output.htmlBibliography }} />
        <button className="link-pill" onClick={() => copy(output.bibliography, output.htmlBibliography, "Daftar pustaka disalin.")}>Salin daftar pustaka</button>
      </> : <p>Gaya ini hanya menghasilkan sitasi.</p>}
    </section>}
  </section>
}
