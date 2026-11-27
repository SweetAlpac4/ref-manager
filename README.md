# Ref Manager

Ref Manager helps you organize research references, read PDFs, and prepare citations. It runs in your browser and stores your library in IndexedDB. Run it locally or deploy the static build.

## Manage your library

1. Open **Search** and look up a DOI or title. **Batch** accepts several searches at once. Metadata comes from Crossref and DataCite.
2. Choose **Save to library**. To enter a source manually, open **Library → Add reference**. Open a reference to edit its metadata, abstract, collections, tags, and reading status.
3. Use search and filters to find saved references. A reference can belong to multiple collections. **Find duplicates** checks DOI, book ISBN, and similarities in title, author, and year. Merging keeps the selected record's existing values, fills missing metadata, and carries over collections, tags, notes, and attachments.

## Read PDFs and take notes

- Open a reference and choose **Attach PDF → Read PDF**. Highlight selected text, add a comment or sticky note, or use **Copy to notes** to turn an annotation into a research note.
- Search within the reader or choose **Library → Search PDF contents** to search all attachments and jump to matching pages. Search and highlighting require a text layer. Scanned pages can still be read as images.
- **Read PDF metadata** shows the embedded title, author, and DOI when available. Review the suggestions and apply the fields you want to use.
- **Research notes** supports personal notes, insights, and excerpts. A note can stand alone or link to several references. Annotations are stored in Ref Manager. Downloading an attachment returns the original PDF.

## Cite sources

A reference's detail page formats bibliography entries in APA 7, IEEE, Harvard (Cite Them Right), and Chicago Author–Date. In **Library → Citation workspace**, arrange your citations in document order. Add several sources to a citation, set a locator, or add a prefix or suffix. Choose Chicago Notes–Bibliography for footnotes.

The bibliography updates from the sources in your draft. Copy the results into Word, LibreOffice, or Google Docs. Formatting such as italics is preserved when your browser supports HTML clipboard data. For more styles, import a `.csl` file or enter an ID from the [CSL style catalog](https://www.zotero.org/styles). Imported styles are available for the current workspace session. The library also exports BibTeX and RIS.

Use **Download Word document (.docx)** to export an editable draft with its citations and bibliography. You can add text before each citation under **Document text for export**. Note-based styles create native Word footnotes. The file is generated in your browser.

### Insert citations in Google Docs

Use **Download citation file** in an in-text style. Install the [document-bound Ref Manager sidebar](integrations/google-docs/README.md) in an editable Google Doc, load the exported JSON, and insert a citation at the cursor or append the bibliography. The sidebar uses plain text. For native footnotes, export a Word document.

### Insert citations in Word

On the HTTPS deployment, download the **Word add-in manifest** from the citation workspace. [Sideload the add-in](integrations/word/README.md), load a citation file, and insert citations at the cursor or append the bibliography from the task pane.

### Insert citations in LibreOffice Writer

Install the [Writer Python macros](integrations/libreoffice/README.md) in your LibreOffice user profile. Run a macro to load a citation file and insert a chosen citation or append its bibliography.

## Back up and move your library

Open **Library → Library backup** to download a JSON file containing references, collections, tags, notes, PDFs, and annotations. Restore it in another browser to move your library. When a reference already exists in the destination, the restore keeps its data and adds collection and tag memberships. The regular JSON export contains references only.

The personal library runs without an account or a VPS. Backups can be transferred manually. Online metadata search and fetching styles from the CSL catalog require internet access.

## Personal cloud library

Ref Manager works without an account. **Library → Cloud library** offers an optional private account for storing references, collections, tags, reading status, and a note per reference across devices. Copy references explicitly between the browser library and the cloud library. PDFs, annotations, and existing local notes stay in the browser.

The cloud view refreshes while open and checks the revision before saving an edit. Self-service accounts require a configured Supabase project. See the [cloud setup guide](supabase/README.md).

## Develop locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Run these checks before pushing.

```sh
npm run lint
npm run test:citation
npm run test:metadata
npm run build
```

The static build is written to `dist/`. Citation tests cover a journal article across the built-in styles, an APA edited book and missing year, APA year disambiguation, IEEE numbering, and Chicago footnotes.

### Release on Vercel

Commit each feature separately and push it to `dev`. The `vercel.json` configuration skips automatic deployments for that branch. When ready to release, merge `dev` into the `master` production branch without squashing and push once. Vercel builds the combined changes from `master`. Use `git revert` to roll back a feature commit while preserving history.
