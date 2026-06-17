import Cite from 'citation-js'
import { plugins } from '@citation-js/core'

const styles = {
  ieee: 'https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl',
  harvard: 'https://raw.githubusercontent.com/citation-style-language/styles/master/harvard-cite-them-right.csl',
  chicago: 'https://raw.githubusercontent.com/citation-style-language/styles/master/chicago-author-date.csl',
}

for (const [name, url] of Object.entries(styles)) {
  const csl = await fetch(url).then(r => r.text())
  plugins.config.get('@csl').templates.add(name, csl)
}

const metadata = {
  title: "Software-Defined Networking: A Comprehensive Survey",
  author: [
    { given: "Diego", family: "Kreutz" },
    { given: "Fernando M. V.", family: "Ramos" },
    { given: "Paulo Esteves", family: "Verissimo" },
    { given: "Christian Esteve", family: "Rothenberg" },
  ],
  "container-title": "Proceedings of the IEEE",
  issued: { "date-parts": [[2015]] },
  volume: "103",
  issue: "1",
  page: "14-76",
  DOI: "10.1109/JPROC.2014.2371999",
  type: "article-journal"
}

const cite = new Cite(metadata)

console.log("=== IEEE ===")
console.log(cite.format('bibliography', { format: 'text', template: 'ieee' }))

console.log("=== APA ===")
console.log(cite.format('bibliography', { format: 'text', template: 'apa' }))

console.log("=== Harvard ===")
console.log(cite.format('bibliography', { format: 'text', template: 'harvard' }))

console.log("=== Chicago ===")
console.log(cite.format('bibliography', { format: 'text', template: 'chicago' }))
