import { useEffect, useState } from "react"
import MetadataEditor from "./MetadataEditor"
import { normalizeText } from "../lib/duplicates"
import { saveToLibrary } from "../lib/storage"
import {
  getMembership, getTeamReference, getTeamReferences, publishTeamReference,
  removeTeamReference, teamClient, updateTeamReference,
} from "../lib/teamLibrary"

export default function TeamLibrary({ personalReferences, onPersonalChange, onBack }) {
  const [session, setSession] = useState(undefined)
  const [authMessage, setAuthMessage] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!teamClient) return
    const { data: { subscription } } = teamClient.auth.onAuthStateChange((_, next) => setSession(next))
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setAuthMessage("")
    try {
      const { error } = await teamClient.auth.signInWithPassword({
        email: fields.get("email").trim(), password: fields.get("password"),
      })
      if (error) throw error
    } catch {
      setAuthMessage("Could not sign in. Check your credentials or contact the team administrator.")
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    setAuthMessage("")
    try {
      const { error } = await teamClient.auth.signOut({ scope: "local" })
      if (error) throw error
    } catch {
      setAuthMessage("Could not sign out. Try again.")
    }
  }

  return <section className="card citation-workspace">
    <button className="back-btn" onClick={onBack}>Back to library</button>
    <h2>Team library</h2>
    {!teamClient && <p>Team sync needs a dedicated Supabase project. See the team library setup guide.</p>}
    {teamClient && session === undefined && <p>Checking sign-in…</p>}
    {teamClient && session === null && <form className="reference-fields" onSubmit={signIn}>
      <label>Email<input name="email" type="email" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button className="link-pill" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>}
    {authMessage && <p role="status">{authMessage}</p>}
    {session && <>
      <button className="link-pill" onClick={signOut}>Sign out</button>
      <SharedReferences key={session.user.id} userId={session.user.id}
        personalReferences={personalReferences} onPersonalChange={onPersonalChange} />
    </>}
  </section>
}

function SharedReferences({ userId, personalReferences, onPersonalChange }) {
  const [rows, setRows] = useState([])
  const [access, setAccess] = useState("loading")
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
        const member = await getMembership()
        if (!active) return
        if (!member) {
          setRows([])
          setView(null)
          setAccess("denied")
          setRefreshMessage("")
          return
        }
        const items = await getTeamReferences()
        if (!active) return
        setRows(items)
        setAccess("allowed")
        setRefreshMessage("")
      } catch {
        if (active) setRefreshMessage("Could not refresh the team library. Check your connection and try again.")
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
      setMessage(error instanceof Error ? error.message : "The team library request failed. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const open = id => run(async () => {
    const record = await getTeamReference(id)
    if (!record) {
      refresh()
      throw new Error("This reference is no longer available.")
    }
    setView({ record, mode: "detail" })
  })

  const publish = async item => {
    await publishTeamReference(item)
    setView(null)
    setMessage("Reference published to the team library.")
    refresh()
  }

  const savePersonal = record => run(async () => {
    const result = await saveToLibrary(record.metadata)
    if (!result.ok && result.reason !== "duplicate") throw new Error("Could not save a personal copy.")
    await onPersonalChange()
    setMessage(result.ok ? "Reference saved to your personal library." : "This reference is already in your personal library.")
  })

  const change = async (record, updates) => {
    const saved = await updateTeamReference(record, updates)
    setView({ record: saved, mode: "detail" })
    setMessage("Team reference updated.")
    refresh()
  }

  const deleteRecord = record => {
    if (!window.confirm(`Delete “${record.metadata.title}” from the team library?`)) return
    run(async () => {
      await removeTeamReference(record)
      setView(null)
      setMessage("Team reference deleted.")
      refresh()
    })
  }

  const selected = view?.record
  const row = selected && rows.find(item => item.id === selected.id)
  const stale = row && row.revision !== selected.revision

  return <>
    {refreshMessage && <p role="alert">{refreshMessage}</p>}
    {access === "loading" && !refreshMessage && <p>Loading team library…</p>}
    {access === "denied" && <p>Your account needs an invitation from the team administrator.</p>}
    {access !== "allowed" && <button className="link-pill" onClick={refresh}>Check access</button>}
    {access === "allowed" && <>
      {message && <p role="status">{message}</p>}
      {view && <button className="link-pill" disabled={busy} onClick={() => { setView(null); setMessage("") }}>Back to team references</button>}
      {view?.mode === "add" && <MetadataEditor onSave={publish} onCancel={() => setView(null)} />}
      {selected && <>
        <h3>{selected.metadata.title}</h3>
        {stale && <p role="status">A teammate changed this reference. Copy any unsaved edits before reloading it.</p>}
        {stale && <button className="link-pill" disabled={busy} onClick={() => open(selected.id)}>Reload latest version</button>}
        {view.mode === "metadata" && <MetadataEditor key={selected.revision}
          metadata={{ ...selected.metadata, id: selected.id }}
          onCancel={() => setView({ record: selected, mode: "detail" })}
          onSave={metadata => change(selected, { metadata: { ...selected.metadata, ...metadata } })} />}
        {view.mode === "detail" && <>
          <p>{(selected.metadata.authors ?? []).join(", ")} {selected.metadata.year}</p>
          {selected.metadata.abstract && <p className="note-body">{selected.metadata.abstract}</p>}
          <div className="link-row">
            <button className="link-pill" onClick={() => setView({ record: selected, mode: "metadata" })}>Edit metadata</button>
            <button className="link-pill" disabled={busy} onClick={() => savePersonal(selected)}>Save personal copy</button>
            {selected.created_by === userId && <button className="link-pill link-pill-danger" disabled={busy}
              onClick={() => deleteRecord(selected)}>Delete team reference</button>}
          </div>
          <form className="reference-fields" key={`${selected.id}-${selected.revision}`} onSubmit={event => {
            event.preventDefault()
            const note = new FormData(event.currentTarget).get("note")
            run(() => change(selected, { note }))
          }}>
            <label>Shared note<textarea name="note" rows={6} maxLength={12000} defaultValue={selected.shared_note} /></label>
            <button className="link-pill" disabled={busy}>Save shared note</button>
          </form>
        </>}
      </>}
      {!view && <>
        <div className="library-filters">
          <input type="search" aria-label="Search team library" placeholder="Search titles" value={query}
            onChange={event => setQuery(event.target.value)} />
          <button className="link-pill" onClick={refresh}>Refresh</button>
          <button className="link-pill" onClick={() => setView({ mode: "add" })}>Add team reference</button>
        </div>
        {personalReferences.length > 0 && <form className="library-filters" onSubmit={event => {
          event.preventDefault()
          const id = new FormData(event.currentTarget).get("reference")
          const reference = personalReferences.find(item => item.id === id)
          if (reference) run(() => publish(reference))
        }}>
          <select name="reference" aria-label="Personal reference to publish">
            {personalReferences.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <button className="link-pill" disabled={busy}>Publish reference metadata</button>
        </form>}
        <p>Team members can edit shared references and notes. Personal notes and PDF attachments stay in your personal library.</p>
        {rows.filter(item => normalizeText(item.title).includes(normalizeText(query))).map(item =>
          <article className="note-item" key={item.id}>
            <button className="link-pill" disabled={busy} onClick={() => open(item.id)}>{item.title}</button>
          </article>)}
        {rows.length === 0 && <p>No team references yet.</p>}
      </>}
    </>}
  </>
}
