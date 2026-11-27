"""Insert a Ref Manager citation file into LibreOffice Writer."""

import json
from pathlib import Path

import uno
from com.sun.star.awt.MessageBoxType import ERRORBOX
from com.sun.star.text.ControlCharacter import PARAGRAPH_BREAK
from com.sun.star.ui.dialogs.ExecutableDialogResults import OK


def read_citations(path):
    with Path(path).open(encoding="utf-8") as source:
        contents = source.read(5 * 1024 * 1024 + 1)
    if len(contents) > 5 * 1024 * 1024:
        raise ValueError("The citation file is too large.")
    data = json.loads(contents)
    if not isinstance(data, dict) or data.get("format") != "ref-manager-citations" or data.get("version") != 1:
        raise ValueError("Choose a valid Ref Manager citation file.")
    for key in ("citations", "bibliography"):
        entries = data.get(key)
        if not isinstance(entries, list) or any(not isinstance(entry, str) or not entry.strip() for entry in entries):
            raise ValueError("The citation file contains invalid entries.")
    return data


def insert_at_cursor(document, citation):
    cursor = document.getCurrentController().getViewCursor()
    cursor.getText().insertString(cursor.getEnd(), citation, False)


def append_entries(document, entries):
    if not entries:
        raise ValueError("This citation file has no bibliography.")
    text = document.getText()
    cursor = text.createTextCursor()
    cursor.gotoEnd(False)
    undo = document.getUndoManager()
    undo.enterUndoContext("Append bibliography")
    try:
        if text.getString():
            text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
        text.insertString(cursor, "Bibliography", False)
        for entry in entries:
            text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
            text.insertString(cursor, entry, False)
    finally:
        undo.leaveUndoContext()


def current_writer():
    doc = XSCRIPTCONTEXT.getDocument()
    if doc is None or not doc.supportsService("com.sun.star.text.TextDocument"):
        raise ValueError("Open a Writer document first.")
    if doc.isReadonly():
        raise ValueError("Open an editable Writer document.")
    return doc


def service(name):
    ctx = XSCRIPTCONTEXT.getComponentContext()
    return ctx.getServiceManager().createInstanceWithContext(name, ctx)


def choose_file():
    picker = service("com.sun.star.ui.dialogs.FilePicker")
    try:
        picker.appendFilter("Ref Manager citation file", "*.json")
        if picker.execute() != OK:
            return None
        return read_citations(uno.fileUrlToSystemPath(picker.getSelectedFiles()[0]))
    finally:
        picker.dispose()


def choose_citation(entries):
    if not entries:
        raise ValueError("This file contains no citations.")
    model = service("com.sun.star.awt.UnoControlDialogModel")
    model.setPropertyValues(("Height", "Title", "Width"), (132, "Insert citation", 250))

    def add(name, control, **props):
        item = model.createInstance("com.sun.star.awt.UnoControl" + control + "Model")
        keys = tuple(sorted(props))
        item.setPropertyValues(keys, tuple(props[key] for key in keys))
        model.insertByName(name, item)

    add("citations", "ListBox", PositionX=8, PositionY=8, Width=234, Height=95)
    labels = tuple(f"{index + 1}. {entry.replace(chr(10), ' ')[:160]}"
                   for index, entry in enumerate(entries))
    uno.invoke(model.getByName("citations"), "setPropertyValue",
               ("StringItemList", uno.Any("[]string", labels)))
    # The model stores PushButtonType as a short: 1 for OK, 2 for Cancel.
    add("insert", "Button", PositionX=138, PositionY=110, Width=50, Height=14,
        Label="Insert", PushButtonType=1)
    add("cancel", "Button", PositionX=192, PositionY=110, Width=50, Height=14,
        Label="Cancel", PushButtonType=2)
    dialog = service("com.sun.star.awt.UnoControlDialog")
    try:
        dialog.setModel(model)
        dialog.createPeer(service("com.sun.star.awt.Toolkit"), None)
        listing = dialog.getControl("citations")
        listing.selectItemPos(0, True)
        if dialog.execute() == OK:
            index = listing.getSelectedItemPos()
            if index >= 0:
                return entries[index]
        return None
    finally:
        dialog.dispose()


def show_error(error):
    toolkit = service("com.sun.star.awt.Toolkit")
    box = toolkit.createMessageBox(toolkit.getActiveTopWindow(), ERRORBOX, 1, "Ref Manager", str(error))
    try:
        box.execute()
    finally:
        box.dispose()


def insert_citation(*_):
    try:
        document = current_writer()
        bundle = choose_file()
        if bundle is None:
            return
        citation = choose_citation(bundle["citations"])
        if citation is not None:
            insert_at_cursor(document, citation)
    except (ValueError, OSError) as error:
        show_error(error)


def append_bibliography(*_):
    try:
        document = current_writer()
        bundle = choose_file()
        if bundle is not None:
            append_entries(document, bundle["bibliography"])
    except (ValueError, OSError) as error:
        show_error(error)


g_exportedScripts = (insert_citation, append_bibliography)
