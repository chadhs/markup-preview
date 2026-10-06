!macro customInstall
  ; electron-builder v26's file association macro quotes the document argument
  ; but leaves the executable unquoted. Installation paths can contain spaces.
  WriteRegStr SHCTX "Software\Classes\com.chadhs.markup-preview.org\shell\open\command" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'
  WriteRegStr SHCTX "Software\Classes\com.chadhs.markup-preview.markdown\shell\open\command" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'
!macroend
