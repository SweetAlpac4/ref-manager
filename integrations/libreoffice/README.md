# Ref Manager macros for LibreOffice Writer

Writer can insert a citation at the cursor or append a bibliography using a local citation JSON file. These Python macros require LibreOffice's Python scripting provider. Some Linux packages install it separately as `libreoffice-script-provider-python`.

1. Copy [ref_manager.py](ref_manager.py) into your [LibreOffice user Python scripts folder](https://help.libreoffice.org/latest/en-GB/text/sbasic/python/python_locations.html). Create the `Scripts/python` folders if needed, then restart LibreOffice.
2. In Ref Manager, open **Library → Citation workspace**, choose an in-text style, and select **Download citation file**.
3. In Writer, position the cursor and open **Tools → Macros → Run Macro**. Under **My Macros → ref_manager**, choose **insert_citation**. Find your JSON file and choose the citation to insert.
4. To add the bibliography at the end of the document, run **append_bibliography** and choose the same file.

The macros insert plain text. For native footnotes, open the DOCX produced by **Download Word document (.docx)** in Writer.
