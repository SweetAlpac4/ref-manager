export function createWordManifest(origin) {
  const url = new URL(origin)
  if (url.protocol !== "https:") throw new Error("The Word add-in requires an HTTPS deployment.")
  const base = url.origin
  return `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="TaskPaneApp">
  <Id>bdabd6b5-0d30-4dc8-ad0b-73f101fac2ae</Id>
  <Version>1.0.0.0</Version>
  <ProviderName>Ref Manager</ProviderName>
  <DefaultLocale>en-US</DefaultLocale>
  <DisplayName DefaultValue="Ref Manager"/>
  <Description DefaultValue="Insert and refresh citations and a bibliography from a Ref Manager citation file."/>
  <IconUrl DefaultValue="${base}/icon-192.png"/>
  <SupportUrl DefaultValue="https://github.com/SweetAlpac4/ref-manager/issues"/>
  <Hosts><Host Name="Document"/></Hosts>
  <Requirements><Sets><Set Name="WordApi" MinVersion="1.1"/></Sets></Requirements>
  <DefaultSettings><SourceLocation DefaultValue="${base}/word/taskpane.html"/></DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
</OfficeApp>
`
}
