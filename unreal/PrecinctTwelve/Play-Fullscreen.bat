@echo off
REM Runs the game directly in its own window (after Setup-and-Run.bat has been used once).
cd /d "%~dp0"
set "UE="
for %%V in (5.6 5.5 5.4 5.3) do (
  if not defined UE (
    for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\EpicGames\Unreal Engine\%%V" /v InstalledDirectory 2^>nul ^| find "InstalledDirectory"') do set "UE=%%B"
  )
)
if not defined UE if exist "C:\Program Files\Epic Games\UE_5.4\Engine" set "UE=C:\Program Files\Epic Games\UE_5.4"
if not defined UE ( echo Unreal Engine 5 not found. & pause & exit /b 1 )
start "" "%UE%\Engine\Binaries\Win64\UnrealEditor.exe" "%~dp0PrecinctTwelve.uproject" -game -fullscreen
