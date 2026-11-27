export async function assertPdf(file) {
  const header = await file.slice(0, 1024).text()
  if (!header.includes("%PDF-")) throw new Error("Choose a valid PDF file.")
}
