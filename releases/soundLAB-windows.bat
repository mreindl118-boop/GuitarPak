@echo off
rem ============================================================
rem  soundLAB desktop installer for Windows
rem
rem  Creates Desktop + Start Menu shortcuts that open soundLAB
rem  in its own app window (Edge/Chrome app mode - no tabs, no
rem  address bar). MIDI keyboards work natively: Chromium's
rem  built-in Web MIDI is the bridge - approve the MIDI prompt
rem  on first run. The app itself works offline after the first
rem  visit (it is a PWA) and auto-updates.
rem ============================================================
setlocal
set "URL=https://mreindl118-boop.github.io/GuitarPak/"
set "PF86=%ProgramFiles(x86)%"

set "BROWSER="
if exist "%PF86%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%PF86%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%PF86%\Google\Chrome\Application\chrome.exe" set "BROWSER=%PF86%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not defined BROWSER (
  echo Could not find Microsoft Edge or Google Chrome.
  echo Install either one, then run this installer again.
  pause
  exit /b 1
)

echo Using browser: %BROWSER%

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $l=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\soundLAB.lnk'); $l.TargetPath='%BROWSER%'; $l.Arguments='--app=%URL%'; $l.Description='soundLAB - guitar + keys practice and studio'; $l.Save()"
if errorlevel 1 goto :fail

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $d=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'; $l=$ws.CreateShortcut((Join-Path $d 'soundLAB.lnk')); $l.TargetPath='%BROWSER%'; $l.Arguments='--app=%URL%'; $l.Description='soundLAB - guitar + keys practice and studio'; $l.Save()"
if errorlevel 1 goto :fail

echo.
echo Installed. soundLAB is now on your Desktop and in the Start Menu.
echo.
echo First run tips:
echo   - Plug in (or Bluetooth-pair in Windows Settings) your MIDI keyboard,
echo     then allow the MIDI permission prompt in soundLAB's Settings.
echo   - The app keeps working offline after the first visit.
echo.
choice /c YN /m "Launch soundLAB now"
if errorlevel 2 exit /b 0
start "" "%BROWSER%" --app=%URL%
exit /b 0

:fail
echo Shortcut creation failed.
pause
exit /b 1
