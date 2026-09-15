import Cite from 'citation-js'
import { plugins } from '@citation-js/core'

const CSL_URLS = {
  ieee: 'https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl',
  harvard: 'https://raw.githubusercontent.com/citation-style-language/styles/master/harvard-cite-them-right.csl',
  chicago: 'https://raw.githubusercontent.com/citation-style-language/styles/master/chicago-author-date.csl',
}

let initialized = false
let initPromise = null

export const initCitationStyles = () => {
  if (initialized) return Promise.resolve()
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      for (const [name, url] of Object.entries(CSL_URLS)) {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Gagal mengambil gaya sitasi: ${name}`)
        const csl = await response.text()
        plugins.config.get('@csl').templates.add(name, csl)
      }
      initialized = true
    } catch (error) {
      // reset supaya panggilan berikutnya bisa coba ulang, bukan nyangkut
      // di rejected promise yang sama selamanya
      initPromise = null
      throw error
    }
  })()
  return initPromise
}

export const areCitationStylesReady = () => initialized

const toCSLInput = (meta) => ({
  type: meta.type || 'article-journal',
  title: meta.title,
  author: meta.authorsStructured?.length
    ? meta.authorsStructured
    : (meta.citationAuthors || meta.authors).map(name => {
        // fallback untuk data lama (sebelum authorsStructured ada) — tetap rawan
        // salah untuk nama dengan partikel/suffix, tapi hanya jalan sebagai jaring pengaman
        const parts = name.split(' ')
        const family = parts.pop()
        const given = parts.join(' ')
        return { given, family }
      }),
  'container-title': meta.journal,
  issued: { 'date-parts': [[parseInt(meta.year)]] },
  volume: meta.volume,
  issue: meta.issue,
  page: meta.pages,
  DOI: meta.doi,
  ISBN: meta.isbn,
})

export const formatCitation = (meta, style = 'ieee') => {
  const cite = new Cite(toCSLInput(meta))
  return cite.format('bibliography', {
    format: 'text',
    template: style,
  }).trim()
}

export const STYLES = [
  { id: 'ieee', label: 'IEEE' },
  { id: 'apa', label: 'APA 7th' },
  { id: 'harvard', label: 'Harvard' },
  { id: 'chicago', label: 'Chicago' },
]
