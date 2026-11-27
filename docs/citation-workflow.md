# Prepare citations and send them to a document

[Back to README](../README.md)

## Build the citation draft

1. Save the sources you want to cite in your local library. For a single bibliography entry, open the reference, choose a style, and copy the result.
2. For several citations, open **Library → Citation workspace** and choose a style. Use **Add citation** for each place in your document where a citation belongs.
3. Select **Add source** to put multiple references in the same citation. Use a locator such as a page number for a specific passage. Add a prefix or suffix as needed. Use **Suppress author name** when the author is already named in the surrounding sentence and the style supports it.
4. Use **Move up** and **Move down** to match the order in your document. Review numbering and bibliography entries before exporting.

The draft is saved in the current browser. If a source was deleted, replace it in the draft or remove the corresponding citation to resume formatting. For another CSL style, choose **Add a CSL style**, then import a `.csl` file or look up its catalog ID. The imported style is available for the current workspace session.

## Choose an export

| Goal | Action |
| --- | --- |
| Paste a citation or bibliography into an existing document | Use **Copy citation** or **Copy bibliography**. Rich formatting depends on the browser and the destination. |
| Start a Word draft with citations | Choose **Download Word document (.docx)**. Add surrounding text under **Document text for export**. A note style generates native footnotes. |
| Insert or refresh linked citations in a supported Word client | Choose a built-in in-text style and download the citation file. Use the sideloaded add-in on WordApi 1.3 or later. |
| Insert text into Word, Google Docs, or LibreOffice Writer | Choose an in-text style and download the citation file. Load it in the add-in, sidebar, or macro. |

## Update a document after editing

In Word, keep the original citation groups in Ref Manager. After editing their sources or changing to another built-in in-text style, export the same draft again. Load the new file and choose **Refresh citations and bibliography**. The add-in follows the linked citations in document order and uses the sources it finds there. If a linked citation is missing from the file, re-export the original draft with that citation group or remove the obsolete field from the document.

Plain-text insertions use the formatted values in the file. To change them in Word's plain-text mode, Google Docs, or LibreOffice, export a fresh file and replace the affected text and bibliography.

- [Word add-in setup and compatibility](../integrations/word/README.md)
- [Google Docs sidebar setup](../integrations/google-docs/README.md)
- [LibreOffice Writer macro setup](../integrations/libreoffice/README.md)
