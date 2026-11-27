import { useEffect, useState } from "react"
import MetadataEditor from "./MetadataEditor"
import { normalizeText } from "../lib/duplicates"
import { READING_STATUSES, saveToLibrary } from "../lib/storage"
import {
  getCloudReference, getCloudReferences, addCloudReference,
  removeCloudReference, cloudClient, updateCloudReference,
} from "../lib/cloudLibrary"

export default function CloudLibrary({ personalReferences, onPersonalChange, onBack }) {
  const [session, setSession] = useState(undefined)
  const [authMessage, setAuthMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [registering, setRegistering] = useState(false)

  useEffect(() => {
    if (!cloudClient) return
    const { data: { subscription } } = cloudClient.auth.onAuthStateChange((_, next) => setSession(next))
    return () => subscription.unsubscribe()
  }, [])

  const authenticate = async event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setAuthMessage("")
    try {
      const credentials = { email: fields.get("email").trim(), password: fields.get("password") }
      const { data, error } = registering
        ? await cloudClient.auth.signUp({ ...credentials, options: { emailRedirectTo: window.location.origin } })
        : await cloudClient.auth.signInWithPassword(credentials)
      if (error) throw error
      if (registering && !data.session) setAuthMessage("Check your email for a confirmation link.")
    } catch {
      setAuthMessage(registering
        ? "Could not create an account. Check your email and password, or try again later."
        : "Could not sign in. Check your email and password.")
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    setAuthMessage("")
    try {
      const { error } = await cloudClient.auth.signOut({ scope: "local" })
      if (error) throw error
    } catch {
      setAuthMessage("Could not sign out. Try again.")
    }
  }

  return <section className="card citation-workspace">
    <button className="back-btn" onClick={onBack}>Back to library</button>
    <h2>Cloud library</h2>
    {!cloudClient && <p>Cloud sync is unavailable on this deployment.</p>}
    {cloudClient && session === undefined && <p>Checking sign-in…</p>}
    {cloudClient && session === null && <form className="reference-fields" onSubmit={authenticate}>
      <label>Email<input name="email" type="email" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete={registering ? "new-password" : "current-password"}
        minLength={registering ? 8 : undefined} required /></label>
      <div className="link-row">
        <button className="link-pill" disabled={busy}>{registering ? "Create account" : "Sign in"}</button>
        <button className="link-pill" type="button" disabled={busy} onClick={() => {
          setRegistering(value => !value)
          setAuthMessage("")
        }}>{registering ? "Use an existing account" : "Create a free account"}</button>
      </div>
    </form>}
    {authMessage && <p role="status">{authMessage}</p>}
    {session && <>
      <button className="link-pill" onClick={signOut}>Sign out</button>
      <CloudReferences key={session.user.id}
        personalReferences={personalReferences} onPersonalChange={onPersonalChange} />
    </>}
  </section>
}

function CloudReferences({ personalReferences, onPersonalChange }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshMessage, setRefreshMessage] = useState("")
  const [message, setMessage] = useState("")
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [view, setView] = useState(null)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)

  const refresh = () => setRefreshVersion(value => value + 1)

  useEffect(() => {
    let active = true
    let pending = false
    async function update() {
      if (pending) return
      pending = true
      try {
        const items = await getCloudReferences()
        if (!active) return
        setRows(items)
        setLoading(false)
        setRefreshMessage("")
      } catch {
        if (active) setRefreshMessage("Could not refresh the cloud library. Check your connection and try again.")
      } finally {
        pending = false
      }
    }

    const onVisible = () => { if (!document.hidden) update() }
    update()
    const interval = window.setInterval(onVisible, 30000)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refreshVersion])

  const run = async action => {
    setBusy(true)
    setMessage("")
    try {
      await action()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The cloud library request failed. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const open = id => run(async () => {
    const record = await getCloudReference(id)
    if (!record) {
      refresh()
      throw new Error("This reference is no longer available.")
    }
    setView({ record, mode: "detail" })
  })

  const add = async item => {
    await addCloudReference(item)
    setView(null)
    setMessage("Reference saved to the cloud library.")
    refresh()
  }

  const savePersonal = record => run(async () => {
    const result = await saveToLibrary(record.metadata)
    if (!result.ok && result.reason !== "duplicate") throw new Error("Could not save a personal copy.")
    await onPersonalChange()
    setMessage(result.ok ? "Reference saved on this browser." : "This reference is already on this browser.")
  })

  const change = async (record, updates) => {
    const saved = await updateCloudReference(record, updates)
    setView({ record: saved, mode: "detail" })
    setMessage("Cloud reference updated.")
    refresh()
  }

  const deleteRecord = record => {
    if (!window.confirm(`Delete “${record.metadata.title}” from the cloud library?`)) return
    run(async () => {
      await removeCloudReference(record)
      setView(null)
      setMessage("Cloud reference deleted.")
      refresh()
    })
  }

  const selected = view?.record
  const row = selected && rows.find(item => item.id === selected.id)
  const stale = row && row.revision !== selected.revision

  return <>
    {refreshMessage && <p role="alert">{refreshMessage}</p>}
    {loading && !refreshMessage && <p>Loading cloud library…</p>}
    {loading && refreshMessage && <button className="link-pill" onClick={refresh}>Retry</button>}
    {!loading && <>
      {message && <p role="status">{message}</p>}
      {view && <button className="link-pill" disabled={busy} onClick={() => { setView(null); setMessage("") }}>Back to cloud references</button>}
      {view?.mode === "add" && <MetadataEditor onSave={add} onCancel={() => setView(null)} />}
      {selected && <>
        <h3>{selected.metadata.title}</h3>
        {stale && <p role="status">This reference changed on another device. Copy any unsaved edits before reloading it.</p>}
        {stale && <button className="link-pill" disabled={busy} onClick={() => open(selected.id)}>Reload latest version</button>}
        {view.mode === "metadata" && <MetadataEditor key={selected.revision}
          metadata={{ ...selected.metadata, id: selected.id }}
          onCancel={() => setView({ record: selected, mode: "detail" })}
          onSave={metadata => change(selected, { metadata })} />}
        {view.mode === "detail" && <>
          <p>{(selected.metadata.authors ?? []).join(", ")} {selected.metadata.year}</p>
          {selected.metadata.abstract && <p className="note-body">{selected.metadata.abstract}</p>}
          <div className="link-row">
            <button className="link-pill" onClick={() => setView({ record: selected, mode: "metadata" })}>Edit metadata</button>
            <button className="link-pill" disabled={busy} onClick={() => savePersonal(selected)}>Save to this browser</button>
            <button className="link-pill link-pill-danger" disabled={busy}
              onClick={() => deleteRecord(selected)}>Delete cloud reference</button>
          </div>
          <form className="reference-fields" key={`${selected.id}-${selected.revision}`} onSubmit={event => {
            event.preventDefault()
            const fields = new FormData(event.currentTarget)
            run(() => change(selected, {
              note: fields.get("note"),
              metadata: {
                collections: fields.get("collections").split(","),
                tags: fields.get("tags").split(","),
                readingStatus: fields.get("readingStatus"),
              },
            }))
          }}>
            <label>Collections, separated by commas<input name="collections" defaultValue={selected.metadata.collections?.join(", ")} /></label>
            <label>Tags, separated by commas<input name="tags" defaultValue={selected.metadata.tags?.join(", ")} /></label>
            <label>Reading status<select name="readingStatus" defaultValue={selected.metadata.readingStatus ?? "unread"}>
              {READING_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>Cloud note<textarea name="note" rows={6} maxLength={12000} defaultValue={selected.personal_note} /></label>
            <button className="link-pill" disabled={busy}>Save cloud details</button>
          </form>
        </>}
      </>}
      {!view && <>
        <div className="library-filters">
          <input type="search" aria-label="Search cloud library" placeholder="Search titles" value={query}
            onChange={event => setQuery(event.target.value)} />
          <button className="link-pill" onClick={refresh}>Refresh</button>
          <button className="link-pill" onClick={() => setView({ mode: "add" })}>Add cloud reference</button>
        </div>
        {personalReferences.length > 0 && <form className="library-filters" onSubmit={event => {
          event.preventDefault()
          const id = new FormData(event.currentTarget).get("reference")
          const reference = personalReferences.find(item => item.id === id)
          if (reference) run(() => add(reference))
        }}>
          <select name="reference" aria-label="Local reference to copy">
            {personalReferences.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <button className="link-pill" disabled={busy}>Copy reference to cloud</button>
        </form>}
        <p>Cloud references are private to this account. Copy references from this browser to sync their metadata. PDFs, annotations, and existing local notes stay on this device.</p>
        {rows.filter(item => normalizeText(item.title).includes(normalizeText(query))).map(item =>
          <article className="note-item" key={item.id}>
            <button className="link-pill" disabled={busy} onClick={() => open(item.id)}>{item.title}</button>
          </article>)}
        {rows.length === 0 && <p>No cloud references yet.</p>}
      </>}
    </>}
  </>
}
