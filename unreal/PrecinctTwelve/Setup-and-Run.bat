@echo off
setlocal EnableDelayedExpansion
REM ============================================================================
REM  Precinct 12 (Unreal Engine 5) - one-click build & launch
REM  1. Finds your Unreal Engine 5 install (5.5 / 5.4 / 5.3)
REM  2. Compiles the C++ game module
REM  3. Opens the editor (first launch builds materials automatically)
REM ============================================================================
cd /d "%~dp0"
set "UPROJECT=%~dp0PrecinctTwelve.uproject"
set "UE="

for %%V in (5.6 5.5 5.4 5.3) do (
  if not defined UE (
    for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\EpicGames\Unreal Engine\%%V" /v InstalledDirectory 2^>nul ^| find "InstalledDirectory"') do (
      set "UE=%%B"
      set "UEVER=%%V"
    )
  )
)
if not defined UE (
  for %%V in (5.6 5.5 5.4 5.3) do (
    if not defined UE if exist "C:\Program Files\Epic Games\UE_%%V\Engine\Binaries\Win64\UnrealEditor.exe" (
      set "UE=C:\Program Files\Epic Games\UE_%%V"
      set "UEVER=%%V"
    )
  )
)
if not defined UE (
  echo.
  echo  Unreal Engine 5 was not found.
  echo  Install it from the Epic Games Launcher ^(Unreal Engine tab ^> Library ^> +^), version 5.4 or newer.
  echo.
  pause
  exit /b 1
)
echo Using Unreal Engine %UEVER% at "%UE%"

echo.
echo === Compiling the game (first time takes a few minutes) ===
call "%UE%\Engine\Build\BatchFiles\Build.bat" PrecinctTwelveEditor Win64 Development -Project="%UPROJECT%" -WaitMutex -NoHotReload
if errorlevel 1 (
  echo.
  echo  BUILD FAILED. Make sure Visual Studio 2022 is installed with the workload
  echo  "Game development with C++" ^(and "Desktop development with C++"^).
  echo  If it still fails, copy the error lines above and send them to Claude.
  echo.
  pause
  exit /b 1
)

echo.
echo === Opening the editor - press the green Play button (or Alt+P) to play ===
start "" "%UE%\Engine\Binaries\Win64\UnrealEditor.exe" "%UPROJECT%"
endlocal
