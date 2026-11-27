# Ref Manager add-in for Word

The task pane uses the same HTTPS host as the Ref Manager web app. It reads the citation JSON locally and inserts plain text using Word's document API.

1. Open the HTTPS deployment of Ref Manager. Go to **Library → Citation workspace**, choose an in-text style, and use **Download citation file**.
2. Choose **Download Word add-in manifest** from the workspace. Sideload the manifest using Microsoft's instructions for your Word client. In Word on the web, look for **Upload My Add-in** in the add-ins dialog. That option depends on your account and organization settings.
3. Open **Ref Manager** in Word and select the citation file. Put the cursor in the document and choose **Insert at cursor**. Use **Append bibliography** to add the entries to the end of the document.

Inserted content is editable text. For native footnotes, use the Word document export from the web app.

[Microsoft's Word on the web sideloading guide](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-office-add-ins-for-testing)
