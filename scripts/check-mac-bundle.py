"""Check the installed application's identity and document associations."""
import plistlib
import sys
from pathlib import Path

with (Path(sys.argv[1]) / 'Contents/Info.plist').open('rb') as source:
    info = plistlib.load(source)
assert info['CFBundleIdentifier'] == 'com.chadhs.markup-preview'
assert info['CFBundleName'] == 'Markup Preview'
assert info['CFBundleExecutable'] == 'Markup Preview'
documents = info['CFBundleDocumentTypes']
extensions = {extension for document in documents for extension in document['CFBundleTypeExtensions']}
assert {'org', 'md', 'markdown'} <= extensions
assert all(document['CFBundleTypeRole'] == 'Viewer' for document in documents)
print('macOS app identity and Org/Markdown viewer associations verified.')
