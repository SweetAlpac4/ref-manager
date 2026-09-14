const stripHtml = (str) => {
  if (!str) return str
  return str.replace(/<[^>]*>/g, '')
}

const normalizeText = (text) => {
  if (!text) return text
  const ligatures = {
    '\ufb00': 'ff', '\ufb01': 'fi', '\ufb02': 'fl',
    '\ufb03': 'ffi', '\ufb04': 'ffl', '\ufb05': 'st',
    '\u2013': '-', '\u2014': '-', '\u201c': '"', '\u201d': '"',
  }
  for (const [char, replacement] of Object.entries(ligatures)) {
    text = text.replaceAll(char, replacement)
  }
  return stripHtml(text)
}

const BOOK_TYPES = ['book', 'edited-book', 'monograph', 'reference-book']

const stripJats = (str) => {
  if (!str) return null
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

const parseCrossRef = (data) => {
  const isBook = BOOK_TYPES.includes(data.type)
  const authorList = data.author || []
  const editorList = data.editor || []
  const people = authorList.length ? authorList : editorList
  const isEditor = !authorList.length && editorList.length > 0

  const rawNames = people.map(a => `${a.given || ''} ${a.family || ''}`.trim())
  const displayAuthors = isEditor ? rawNames.map(n => `${n} (Ed.)`) : rawNames

  return {
    title: normalizeText((data.title || [null])[0]),
    authors: displayAuthors,
    citationAuthors: rawNames,
    journal: isBook
      ? (data.publisher || null)
      : normalizeText((data['container-title'] || [null])[0]),
    year: String((data.published?.['date-parts'] || [[null]])[0][0]),
    volume: data.volume || null,
    issue: data.issue || null,
    pages: data.page || null,
    doi: data.DOI || null,
    type: data.type || 'article-journal',
    isbn: data.ISBN ? data.ISBN[0] : null,
    abstract: stripJats(data.abstract),
    tldr: null,
    thumbnail: null,
    pdfUrl: null,
  }
}

const parseDataCite = (data) => {
  const creators = data.creators || []
  const authors = creators.map(c => {
    const given = c.givenName || ''
    const family = c.familyName || ''
    return given && family ? `${given} ${family}` : (c.name || '').trim()
  }).filter(Boolean)
  return {
    title: normalizeText((data.titles || [{}])[0]?.title),
    authors,
    citationAuthors: authors,
    journal: data.publisher || null,
    year: data.publicationYear ? String(data.publicationYear) : null,
    volume: null,
    issue: null,
    pages: null,
    doi: data.doi || null,
    type: 'article-journal',
    isbn: null,
    abstract: null,
    tldr: null,
    thumbnail: null,
  }
}

export const lookupOpenAccessPdf = async (doi) => {
  if (!doi) return null
  try {
    // Ganti email ini ke kontak project kamu sendiri sebelum deploy —
    // Unpaywall mewajibkan parameter email untuk identifikasi klien API.
    const r = await fetch(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=nabiltsad@gmail.com`)
    if (!r.ok) return null
    const data = await r.json()
    if (!data.is_oa) return null
    return data.best_oa_location?.url_for_pdf || data.best_oa_location?.url || null
  } catch {
    return null
  }
}

export const fetchThumbnail = async (meta) => {
  if (!meta.isbn) return null
  try {
    const isbn = meta.isbn.replace(/-/g, '')
    const r = await fetch(`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`)
    if (!r.ok) return null
    // cek apakah bukan placeholder (Open Library return 1x1 gif kalau ga ada)
    const blob = await r.blob()
    if (blob.size < 1000) return null
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

export const lookupDOI = async (doi) => {
  let clean = doi.replace('https://doi.org/', '').replace('http://doi.org/', '').trim()
  const slashIdx = clean.indexOf('/')
  if (slashIdx === -1) return null
  const prefix = clean.substring(0, slashIdx)
  const suffix = clean.substring(slashIdx + 1)
  const encoded = prefix + '/' + suffix.split('/').map(part => encodeURIComponent(part)).join('/')

  try {
    const r = await fetch(`https://api.crossref.org/works/${encoded}`)
    if (r.ok) {
      const data = (await r.json()).message
      return { source: 'crossref', data: parseCrossRef(data) }
    }
  } catch { /* fallback ke DataCite di bawah */ }

  try {
    const r = await fetch(`https://api.datacite.org/dois/${encoded}`)
    if (r.ok) {
      const data = (await r.json()).data.attributes
      return { source: 'datacite', data: parseDataCite(data) }
    }
  } catch { /* DOI tidak ditemukan di kedua sumber */ }

  return null
}

export const searchByTitle = async (title) => {
  title = normalizeText(title)
  try {
    const r = await fetch(
      `https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=1`
    )
    if (!r.ok) return null
    const items = (await r.json()).message.items
    if (!items?.length) return null
    const data = items[0]
    const resultTitle = (data.title || [null])[0]
    if (!resultTitle) return null
    const titleWords = new Set(title.toLowerCase().split(' '))
    const resultWords = new Set(resultTitle.toLowerCase().split(' '))
    const overlap = [...titleWords].filter(w => resultWords.has(w)).length / titleWords.size
    if (overlap < 0.5) return null
    return { source: 'crossref', data: parseCrossRef(data) }
  } catch {
    return null
  }
}
