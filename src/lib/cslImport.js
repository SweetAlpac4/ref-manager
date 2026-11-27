const namespace = "http://purl.org/net/xbiblio/csl"
const catalog = "https://raw.githubusercontent.com/citation-style-language/styles/master/"
const validSlug = /^[a-z0-9][a-z0-9._-]{0,160}$/

async function download(path) {
  const response = await fetch(new URL(path, catalog))
  if (!response.ok) return null
  return response.text()
}

export async function fetchCatalogStyle(value) {
  const slug = value.trim().replace(/\.csl$/i, "").toLowerCase()
  if (!validSlug.test(slug)) throw new Error("Enter a CSL style ID, such as nature.")
  const file = `${slug}.csl`
  const xml = await download(file) ?? await download(`dependent/${file}`)
  if (!xml) throw new Error("Could not find this style in the CSL catalog.")
  return xml
}

export async function prepareCustomStyle(xml, depth = 0) {
  if (depth > 2 || xml.length > 1024 * 1024 || /<!DOCTYPE/i.test(xml)) {
    throw new Error("This CSL style definition is unsupported.")
  }
  const root = new DOMParser().parseFromString(xml, "application/xml").documentElement
  if (root.localName !== "style" || root.namespaceURI !== namespace) throw new Error("Invalid CSL file.")
  const info = root.getElementsByTagNameNS(namespace, "info")[0]
  const title = info?.getElementsByTagNameNS(namespace, "title")[0]?.textContent.trim() || "CSL style"
  const parent = [...(info?.getElementsByTagNameNS(namespace, "link") ?? [])]
    .find(link => link.getAttribute("rel") === "independent-parent")
  if (!parent) {
    if (!root.getElementsByTagNameNS(namespace, "citation").length) throw new Error("The CSL file must define a citation.")
    return { label: title, xml }
  }
  const href = parent.getAttribute("href") || ""
  const match = href.match(/^https?:\/\/(?:www\.)?zotero\.org\/styles\/([a-z0-9][a-z0-9._-]{0,160})$/i)
  if (!match) throw new Error("Import the parent CSL style as a separate file.")
  const resolved = await prepareCustomStyle(await fetchCatalogStyle(match[1]), depth + 1)
  const locale = root.getAttribute("default-locale")
  if (!locale) return { ...resolved, label: title }
  const independent = new DOMParser().parseFromString(resolved.xml, "application/xml")
  independent.documentElement.setAttribute("default-locale", locale)
  return { label: title, xml: new XMLSerializer().serializeToString(independent) }
}
