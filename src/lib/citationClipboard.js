const formattingTags = new Set(["em", "i", "b", "strong", "sub", "sup", "u"])

export function cleanCitationMarkup(markup) {
  const input = document.createElement("template")
  input.innerHTML = markup
  const output = document.createElement("div")

  function append(parent, node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.append(node.textContent)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE || ["SCRIPT", "STYLE"].includes(node.tagName)) return
    const tag = node.tagName.toLowerCase()
    const isEntry = tag === "div" && node.classList.contains("csl-entry")
    const wrapper = isEntry ? document.createElement("p")
      : formattingTags.has(tag) ? document.createElement(tag) : parent
    if (wrapper !== parent) parent.append(wrapper)
    for (const child of node.childNodes) append(wrapper, child)
    if (node.classList.contains("csl-left-margin")) parent.append(" ")
  }

  for (const node of input.content.childNodes) append(output, node)
  return output.innerHTML
}

export async function copyCitation(text, cleanMarkup) {
  if (cleanMarkup && navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([cleanMarkup], { type: "text/html" }),
      })])
      return
    } catch {
      // Some platforms only grant clipboard access for plain text.
    }
  }
  await navigator.clipboard.writeText(text)
}
