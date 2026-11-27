import { Document, FootnoteReferenceRun, HeadingLevel, Packer, Paragraph, TextRun } from "docx"

function parseMarkup(markup) {
  const template = document.createElement("template")
  template.innerHTML = markup ?? ""
  return template.content
}

function runs(node, formatting = {}) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ? [new TextRun({ text: node.textContent, ...formatting })] : []
  }
  const properties = {
    I: { italics: true },
    EM: { italics: true },
    B: { bold: true },
    STRONG: { bold: true },
    U: { underline: {} },
    SUP: { superScript: true },
    SUB: { subScript: true },
  }[node.tagName]

  return [...node.childNodes].flatMap(child => runs(child, { ...formatting, ...properties }))
}

export function exportCitationDocx(output, groups, styleLabel) {
  const groupsById = new Map(groups.map(group => [group.id, group]))
  const body = [
    new Paragraph({ text: "Citation draft", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: styleLabel, style: "Subtitle" }),
  ]

  for (const [index, citation] of output.citations.entries()) {
    const citationRuns = runs(parseMarkup(output.htmlCitations.get(citation.id)))
    if (!citationRuns.length) citationRuns.push(new TextRun(citation.value))
    const paragraph = groupsById.get(citation.id)?.paragraph?.trim()
    const text = paragraph ? paragraph.split(/\r?\n/).map((line, lineIndex) =>
      new TextRun({ text: line, ...(lineIndex ? { break: 1 } : {}) })) : []

    if (output.noteStyle) {
      if (!text.length) text.push(new TextRun(`Citation ${index + 1}`))
      text.push(new FootnoteReferenceRun({ children: [new Paragraph({ children: citationRuns })] }))
    } else {
      if (text.length) text.push(new TextRun(" "))
      text.push(...citationRuns)
    }
    body.push(new Paragraph({ children: text, spacing: { after: 160 } }))
  }

  if (output.bibliography) {
    body.push(new Paragraph({ text: "Bibliography", heading: HeadingLevel.HEADING_1 }))
    const entries = [...parseMarkup(output.htmlBibliography).querySelectorAll("p")]
    const paragraphs = entries.length
      ? entries.map(entry => runs(entry))
      : output.bibliography.trim().split(/\r?\n/).map(line => [new TextRun(line)])
    for (const children of paragraphs) {
      body.push(new Paragraph({ children, indent: { left: 360, hanging: 360 }, spacing: { after: 120 } }))
    }
  }

  const doc = new Document({ title: "Citation draft", sections: [{ children: body }] })
  return Packer.toBlob(doc)
}
