/** @OnlyCurrentDoc */

function onOpen() {
  DocumentApp.getUi().createMenu('Ref Manager')
    .addItem('Open citation sidebar', 'showCitationSidebar')
    .addToUi();
}

function showCitationSidebar() {
  DocumentApp.getUi().showSidebar(
    HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Ref Manager')
  );
}

function insertCitation(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 10000 || /[\r\n]/.test(text)) {
    throw new Error('Choose a valid single-line citation.');
  }
  const doc = DocumentApp.getActiveDocument();
  const cursor = doc.getCursor();
  if (!cursor || !cursor.insertText(text)) {
    throw new Error('Place the cursor inside an editable paragraph, then try again.');
  }
}

function appendBibliography(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 2000 ||
      entries.some(entry => typeof entry !== 'string' || !entry.trim() || entry.length > 10000)) {
    throw new Error('Choose a valid bibliography.');
  }
  const body = DocumentApp.getActiveDocument().getActiveTab().asDocumentTab().getBody();
  body.appendParagraph('Bibliography').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  for (const entry of entries) body.appendParagraph(entry);
}
