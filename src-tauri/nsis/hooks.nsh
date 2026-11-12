; Included by Tauri's installer.nsi before MultiUser.nsh. MultiUser defines its
; page texts with /IfNDef, so these win. NSIS's own Spanish text says
; "Instación"; the strings live in English.nsh / Spanish.nsh next to this file.
!define MULTIUSER_INSTALLMODEPAGE_TEXT_TOP "$(DraftboardModeTop)"
!define MULTIUSER_INSTALLMODEPAGE_TEXT_ALLUSERS "$(DraftboardModeAllUsers)"
!define MULTIUSER_INSTALLMODEPAGE_TEXT_CURRENTUSER "$(DraftboardModeCurrentUser)"
