# Ref Manager sidebar for Google Docs

This document-bound Apps Script adds a **Ref Manager** menu to an editable Google Doc. Each document needs its own installation. No separate web server is required.

1. Open your Google Doc and choose **Extensions → Apps Script**.
2. Replace the contents of **Code.gs** with [Code.gs](Code.gs).
3. Add an HTML file named **Sidebar** and replace its contents with [Sidebar.html](Sidebar.html). Save the script.
4. Reload the document, then choose **Ref Manager → Open citation sidebar**. Authorize access to the current document if prompted.
5. In Ref Manager, open **Library → Citation workspace**. Select an in-text citation style and choose **Download citation file for Google Docs**.
6. Load that JSON file in the sidebar. Place the cursor in the document and choose **Insert at cursor**. **Append bibliography** adds the bibliography at the end of the active tab.

Inserted text is editable in Google Docs. If you change citation order or style, download a fresh file and replace earlier entries where needed. The JSON file contains only formatted citations and bibliography entries, plus the style name.

[Google's guide to document-bound Apps Script](https://developers.google.com/apps-script/guides/bound)
