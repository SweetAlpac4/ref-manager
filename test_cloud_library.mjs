import assert from "node:assert/strict"
import { test } from "node:test"
import { createClient } from "@supabase/supabase-js"

const endpoint = new URL(process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321")
const key = process.env.SUPABASE_TEST_KEY
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname), "Run this test against a local Supabase stack.")
assert.ok(key, "Set SUPABASE_TEST_KEY to the local stack's publishable key.")

const bytes = new Blob(["%PDF-1.7\nPrivate PDF fixture"], { type: "application/pdf" })
const client = () => createClient(endpoint.origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
const table = connection => connection.from("ref_personal_references")
const bucket = connection => connection.storage.from("ref-personal-pdfs")

const data = async request => {
  const result = await request
  assert.equal(result.error, null, result.error?.message)
  return result.data
}

async function account(connection) {
  const credentials = { email: `test-${crypto.randomUUID()}@example.com`, password: `${crypto.randomUUID()}!aA` }
  const signedUp = await data(connection.auth.signUp(credentials))
  assert.ok(signedUp.session, "Disable email confirmation in the temporary local test stack.")
  return { id: signedUp.user.id, credentials }
}

test("private references and PDFs are isolated by account and stale changes are rejected", async () => {
  const author = client()
  const anotherDevice = client()
  const other = client()
  const anonymous = client()
  const { id: authorId, credentials } = await account(author)
  const { id: otherId } = await account(other)
  await data(anotherDevice.auth.signInWithPassword(credentials))
  const reference = await data(table(author).insert({ metadata: { title: "Private title" } }).select().single())
  const ownDirectory = `${authorId}/${reference.id}`
  const ownPath = `${ownDirectory}/document.pdf`
  const otherPath = `${otherId}/${reference.id}/document.pdf`

  assert.deepEqual(await data(table(other).select("id").eq("id", reference.id)), [])
  assert.deepEqual(await data(table(other).update({ metadata: { title: "Other account" } }).eq("id", reference.id).select("id")), [])
  assert.deepEqual(await data(table(other).delete().eq("id", reference.id).select("id")), [])
  assert.ok((await table(other).insert({ owner_id: authorId, metadata: { title: "Assigned owner" } })).error)
  assert.ok((await table(author).update({ owner_id: otherId }).eq("id", reference.id)).error)

  const updated = await data(table(author).update({ personal_note: "Saved" }).eq("id", reference.id)
    .eq("revision", reference.revision).select().single())
  assert.equal(updated.revision, reference.revision + 1)
  assert.deepEqual(await data(table(author).update({ personal_note: "Stale" }).eq("id", reference.id)
    .eq("revision", reference.revision).select("id")), [])
  assert.deepEqual(await data(table(author).delete().eq("id", reference.id).eq("revision", reference.revision)
    .select("id")), [])

  assert.ok((await bucket(other).upload(ownPath, bytes)).error)
  assert.ok((await bucket(other).upload(otherPath, bytes)).error)
  await data(bucket(author).upload(ownPath, bytes))
  assert.ok((await bucket(author).upload(ownPath, bytes)).error)
  assert.equal((await data(bucket(author).list(ownDirectory)))[0].name, "document.pdf")
  assert.equal(await (await data(bucket(anotherDevice).download(ownPath))).text(), await bytes.text())
  assert.deepEqual(await data(bucket(other).list(ownDirectory)), [])
  assert.ok((await bucket(other).download(ownPath)).error)
  assert.ok((await bucket(other).createSignedUrl(ownPath, 60)).error)
  const signed = await data(bucket(author).createSignedUrl(ownPath, 60))
  const opened = await fetch(signed.signedUrl)
  assert.equal(opened.status, 200)
  assert.equal(await opened.text(), await bytes.text())
  assert.ok((await bucket(anonymous).download(ownPath)).error)
  await bucket(other).remove([ownPath])
  assert.equal(await (await data(bucket(author).download(ownPath))).text(), await bytes.text())
  const blocked = await table(author).delete().eq("id", reference.id).eq("revision", updated.revision).select()
  assert.equal(blocked.error?.code, "23514")
  await data(bucket(author).remove([ownPath]))
  assert.equal((await data(table(author).delete().eq("id", reference.id).eq("revision", updated.revision).select()))[0].id, reference.id)
  assert.ok((await bucket(author).upload(ownPath, bytes)).error)

  const concurrent = await data(table(author).insert({ metadata: { title: "Concurrent PDF" } }).select().single())
  const concurrentPath = `${authorId}/${concurrent.id}/document.pdf`
  const [uploaded, deleted] = await Promise.all([
    bucket(anotherDevice).upload(concurrentPath, bytes),
    table(author).delete().eq("id", concurrent.id).eq("revision", concurrent.revision).select("id"),
  ])
  if (uploaded.error) {
    assert.equal(deleted.error, null)
    assert.deepEqual(deleted.data, [{ id: concurrent.id }])
  } else {
    assert.equal(deleted.error?.code, "23514")
    await data(bucket(author).remove([concurrentPath]))
    await data(table(author).delete().eq("id", concurrent.id).select("id"))
  }
})
