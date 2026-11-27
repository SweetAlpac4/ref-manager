# Ref Manager add-in for Word

The task pane uses the same HTTPS host as the Ref Manager web app and reads citation JSON locally.

1. Open the HTTPS deployment of Ref Manager. Go to **Library → Citation workspace**, choose an in-text style, and use **Download citation file**.
2. Choose **Download Word add-in manifest** from the workspace. Sideload the manifest using Microsoft's instructions for your Word client. In Word on the web, look for **Upload My Add-in** in the add-ins dialog. That option depends on your account and organization settings.
3. Open **Ref Manager** in Word and select the citation file. Put the cursor in the document and choose **Insert at cursor**.

For built-in in-text styles with WordApi 1.3, the add-in inserts linked fields and saves their reference IDs in the document. Use **Insert or update bibliography** to add the bibliography. When you change reference metadata or citation styles in Ref Manager, re-export the same citation draft, load the new file in Word, and choose **Refresh citations and bibliography**. Refresh follows the order of the linked fields in the document and uses the sources that appear there.

Older files, custom styles, and WordApi 1.1 support plain-text insertion and **Append bibliography**. For native footnotes, use **Download Word document (.docx)** from Ref Manager.

[Microsoft's Word on the web sideloading guide](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-office-add-ins-for-testing)
