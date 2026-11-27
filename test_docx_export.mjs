import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { strFromU8, unzipSync } from "fflate"
import { chromium } from "playwright"
import { preview } from "vite"

test("citation workspace downloads editable DOCX with inline citations and native footnotes", async () => {
  const server = await preview({ preview: { host: "127.0.0.1", port: 0 } })
  let browser
  try {
    browser = await chromium.launch()
    const page = await browser.newPage()
    const port = server.httpServer.address().port
    const origin = `http://127.0.0.1:${port}`
    await page.route("**/*", route =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    await page.goto(origin)
    const button = name => page.getByRole("button", { name, exact: true })

    await button("Library").click()
    const samples = [
      { title: "Reading across collections", author: "Doe, Jane", year: "2020", journal: "Journal of Library Research" },
      { title: "Organizing research notes", author: "Singh, Ravi", year: "2022", journal: "Research Methods Quarterly" },
    ]
    for (const { title, author, year, journal } of samples) {
      await button("Add reference").click()
      await page.getByLabel("Title", { exact: true }).fill(title)
      await page.getByLabel(/Authors, one per line/).fill(author)
      await page.getByLabel("Year", { exact: true }).fill(year)
      await page.getByLabel("Journal or publication", { exact: true }).fill(journal)
      await button("Save metadata").click()
      await page.getByText(title, { exact: true }).waitFor()
    }

    await button("Citation workspace").click()
    for (const { title } of samples) {
      await page.getByLabel("Reference for new citation").selectOption({ label: title })
      await button("Add citation").click()
    }
    await page.getByLabel("Locator", { exact: true }).first().fill("8")
    await page.getByText("Document text for export", { exact: true }).first().click()
    await page.getByRole("textbox", { name: "Text before this citation" }).fill("Reading notes from the first source.")

    const downloadDocx = async () => {
      const pendingDownload = page.waitForEvent("download")
      await button("Download Word document (.docx)").click()
      const download = await pendingDownload
      assert.match(download.suggestedFilename(), /\.docx$/)
      const parts = unzipSync(await readFile(await download.path()))
      const xml = part => parts[part] ? strFromU8(parts[part]) : ""
      return page.evaluate(({ body, footnotes, relations }) => {
        const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        const parse = xml => xml ? new DOMParser().parseFromString(xml, "application/xml") : null
        const elements = (node, name) => [...(node?.getElementsByTagNameNS(word, name) ?? [])]
        const text = node => elements(node, "t").map(element => element.textContent).join("")
        const documentXml = parse(body)
        return {
          paragraphs: elements(documentXml, "p").map(text),
          italicRuns: elements(documentXml, "r").filter(run => elements(run, "i").length).map(text),
          references: elements(documentXml, "footnoteReference").map(node => node.getAttributeNS(word, "id")),
          notes: Object.fromEntries(elements(parse(footnotes), "footnote")
            .map(node => [node.getAttributeNS(word, "id"), text(node)])),
          hasFootnotesRelationship: [...(parse(relations)?.getElementsByTagName("Relationship") ?? [])]
            .some(node => node.getAttribute("Type")?.endsWith("/footnotes") && /(?:^|\/)footnotes\.xml$/.test(node.getAttribute("Target"))),
        }
      }, { body: xml("word/document.xml"), footnotes: xml("word/footnotes.xml"), relations: xml("word/_rels/document.xml.rels") })
    }

    const inline = await downloadDocx()
    assert.deepEqual(inline.references, [])
    assert.ok(inline.paragraphs.includes("Reading notes from the first source. (Doe, 2020, p. 8)"))
    assert.ok(inline.paragraphs.includes("(Singh, 2022)"))
    assert.ok(inline.paragraphs.includes("Bibliography"))
    const bibliography = inline.paragraphs.slice(inline.paragraphs.indexOf("Bibliography") + 1)
    assert.equal(bibliography.length, 2)
    assert.match(bibliography[0], /Doe, J\. \(2020\)\. Reading across collections\./)
    assert.match(bibliography[1], /Singh, R\. \(2022\)\. Organizing research notes\./)
    assert.ok(inline.italicRuns.includes("Journal of Library Research"))

    await page.getByLabel("Citation style", { exact: true }).selectOption("chicago-note")
    const chicago = await downloadDocx()
    assert.equal(chicago.references.length, 2)
    assert.equal(new Set(chicago.references).size, 2)
    assert.ok(chicago.hasFootnotesRelationship)
    assert.ok(chicago.paragraphs.includes("Reading notes from the first source."))
    assert.ok(chicago.paragraphs.includes("Bibliography"))
    assert.match(chicago.notes[chicago.references[0]], /Jane Doe.*Reading across Collections.*8\./)
    assert.match(chicago.notes[chicago.references[1]], /Ravi Singh.*Organizing Research Notes/)
    assert.ok(!chicago.paragraphs.some(paragraph => paragraph.startsWith("Reading notes from the first source.") && paragraph.includes("Jane Doe")))
  } finally {
    try {
      await browser?.close()
    } finally {
      await server.close()
    }
  }
})
