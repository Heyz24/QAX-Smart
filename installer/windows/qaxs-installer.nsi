; QAX-Smart Windows installer (NSIS)
; Build with: makensis installer/windows/qaxs-installer.nsi
;
; Packages the PORTABLE distribution (scripts/build-portable.sh, run on
; Windows), not a single pkg binary - @yao-pkg/pkg was confirmed
; non-viable for this project (node-llama-cpp is ESM-only; pkg cannot
; dynamically import ESM code under any configuration). See HANDOFF.md's
; "Packaging status" section for the full story, and
; installer/linux/build-deb.sh for the equivalent, already-verified-for-
; real Linux packaging this mirrors.
;
; Requires: dist-portable\win-x64\ already built via
; `scripts\build-portable.sh dist-portable/win-x64` (run on Windows, or
; with a downloaded official Windows node.exe passed via
; NODE_BIN_OVERRIDE) BEFORE running makensis. That folder must contain:
; qaxs.bat, node-runtime.exe, dist\, node_modules\, models\, LICENSE.md,
; THIRD_PARTY_LICENSES.md, THIRD_PARTY_LICENSES_TEXTS\.

!include "MUI2.nsh"

Name "QAX-Smart"
OutFile "..\..\dist-installers\qaxs-setup-windows-x64.exe"
InstallDir "$PROGRAMFILES64\QAX-Smart"
RequestExecutionLevel admin

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  ; The whole portable folder, recursively - this is the app, its
  ; bundled Node.js runtime, production node_modules (including
  ; node-llama-cpp's native binary), and license files. No system
  ; Node.js install is required on the target machine - verified for
  ; the equivalent Linux build by physically removing the build
  ; machine's own node binary and confirming the bundled copy still
  ; ran the full pipeline (see tests/portable-build-smoke.sh).
  File /r "..\..\dist-portable\win-x64\*.*"

  ; Add to machine PATH via the registry (append-only, mirrors QAX's own
  ; documented fix for the setx-truncation bug in its installer history —
  ; do NOT switch this to setx). qaxs.bat resolves via PATHEXT the same
  ; way QAX's own .cmd/.bat wrapper resolution works (see QAX user
  ; manual section 5), so `qaxs` on its own works from any new terminal
  ; once PATH is refreshed.
  EnumRegKey $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" 0
  ReadRegStr $1 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
  StrCpy $2 "$1;$INSTDIR"
  WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path" "$2"
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000

  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
SectionEnd
