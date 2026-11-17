@echo off
rem Opens "Draftboard Dev": the current code, with its own data folder
rem (com.draftboard.app.dev), next to the installed app. Used by the
rem "Draftboard DEV" desktop shortcut. Closing this window closes the app.
title Draftboard DEV
cd /d "%~dp0.."
npm run app:dev
