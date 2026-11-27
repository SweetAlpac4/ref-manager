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

  // Simpan given/family terstruktur apa adanya dari CrossRef, jangan cuma
  // gabung jadi satu string lalu ditebak ulang belakangan (rawan salah untuk
  // nama dengan partikel seperti "van der Berg" atau suffix seperti "Jr.").
  const structuredAuthors = people.map(a => ({ given: a.given || '', family: a.family || '' }))
  const rawNames = structuredAuthors.map(({ given, family }) => `${given} ${family}`.trim())
  const displayAuthors = isEditor ? rawNames.map(n => `${n} (Ed.)`) : rawNames

  // PENTING: jangan String(x) langsung kalau x bisa null/undefined —
  // String(null) menghasilkan string literal "null" (truthy!), bukan null beneran.
  const year = data.published?.['date-parts']?.[0]?.[0]

  return {
    title: normalizeText((data.title || [null])[0]),
    authors: displayAuthors,
    citationAuthors: rawNames,
    authorsStructured: structuredAuthors,
    contributorRole: isEditor ? 'editor' : 'author',
    publisher: data.publisher || null,
    journal: isBook
      ? (data.publisher || null)
      : normalizeText((data['container-title'] || [null])[0]),
    year: year ? String(year) : null,
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

// DataCite pakai field types.resourceTypeGeneral untuk kategori resource.
// Sebelumnya field ini dibuang sama sekali dan semua hasil DataCite (termasuk
// tesis, dataset, laporan, prosiding) dianggap 'article-journal' begitu saja.
const DATACITE_TYPE_MAP = {
  JournalArticle: 'journal-article',
  ConferencePaper: 'proceedings-article',
  ConferenceProceeding: 'proceedings-article',
  BookChapter: 'book-chapter',
  Book: 'book',
  Report: 'report',
  Dissertation: 'dissertation',
  Preprint: 'posted-content',
  Dataset: 'dataset',
  Software: 'software',
}

const parseDataCite = (data) => {
  const creators = data.creators || []
  const structuredAuthors = creators.map(c => {
    if (c.givenName || c.familyName) {
      return { given: c.givenName || '', family: c.familyName || '' }
    }
    // DataCite kadang cuma kasih "name" polos tanpa given/family terpisah;
    // ini satu-satunya kasus kita terpaksa nebak, tapi minimal jelas fallback-nya.
    const parts = (c.name || '').trim().split(' ')
    const family = parts.pop() || ''
    return { given: parts.join(' '), family }
  })
  const authors = structuredAuthors
    .map(({ given, family }) => `${given} ${family}`.trim())
    .filter(Boolean)
  const resourceType = data.types?.resourceTypeGeneral
  // Kalau resourceType ADA tapi ga ada di map (mis. Image, Workflow, Sound),
  // jangan diam-diam disebut 'article-journal' — pakai 'other' yang jujur.
  // 'article-journal' cuma dipakai kalau memang DataCite ga kasih info tipe sama sekali.
  const type = resourceType
    ? (DATACITE_TYPE_MAP[resourceType] || 'other')
    : 'article-journal'
  return {
    title: normalizeText((data.titles || [{}])[0]?.title),
    authors,
    citationAuthors: authors,
    authorsStructured: structuredAuthors,
    journal: data.publisher || null,
    year: data.publicationYear ? String(data.publicationYear) : null,
    volume: null,
    issue: null,
    pages: null,
    doi: data.doi || null,
    type,
    isbn: null,
    abstract: null,
    tldr: null,
    thumbnail: null,
  }
}

// Unpaywall API mewajibkan parameter email untuk identifikasi klien.
// PENTING: karena app ini frontend-only (ga ada backend buat nyembunyiin request),
// alamat ini akan SELALU terlihat oleh siapa pun yang buka tab Network di DevTools,
// terlepas dari bagaimana pun cara menulis kodenya. Jangan pakai email pribadi asli
// di sini — pakai alias yang aman dipublikasikan, misalnya email noreply GitHub
// (aktifkan di GitHub Settings > Emails, formatnya <username>@users.noreply.github.com).
const UNPAYWALL_CONTACT_EMAIL = "nabiltsad@gmail.com"

export const lookupOpenAccessPdf = async (doi) => {
  if (!doi) return null
  try {
    const r = await fetch(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(UNPAYWALL_CONTACT_EMAIL)}`)
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
