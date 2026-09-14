import { lookupDOI, searchByTitle } from "./crossref"

// Batas maksimal item per batch. Ini bukan cuma soal keamanan, tapi juga
// biar tidak kena rate-limit dari CrossRef/DataCite/Unpaywall saat request beruntun.
export const MAX_BATCH_ITEMS = 50

// Jeda antar request (ms). CrossRef minta klien "polite" (tidak spam beruntun).
const REQUEST_DELAY_MS = 350

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Heuristik sederhana: kalau baris mengandung pola DOI (10.xxxx/...), anggap DOI.
// Kalau tidak, perlakukan sebagai judul. Jadi textarea batch bisa campur DOI & judul.
const DOI_PATTERN = /^(https?:\/\/(dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+$/i

export const parseBatchInput = (raw) => {
  return raw
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, MAX_BATCH_ITEMS)
}

/**
 * Jalankan pencarian untuk banyak baris input secara berurutan (bukan paralel),
 * supaya tidak membombardir API pihak ketiga sekaligus.
 */
export const runBatchSearch = async (lines, onProgress) => {
  const results = []
  const total = lines.length

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    onProgress?.({ done: i, total, current: line })

    try {
      const isDoi = DOI_PATTERN.test(line)
      const result = isDoi ? await lookupDOI(line) : await searchByTitle(line)

      if (result?.data) {
        results.push({ input: line, status: "success", data: result.data })
      } else {
        results.push({ input: line, status: "not_found", data: null })
      }
    } catch {
      results.push({ input: line, status: "error", data: null })
    }

    if (i < lines.length - 1) await sleep(REQUEST_DELAY_MS)
  }

  onProgress?.({ done: total, total, current: null })
  return results
}
