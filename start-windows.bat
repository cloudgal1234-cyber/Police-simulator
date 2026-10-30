@echo off
REM Starts a local web server and opens the game in your default browser.
cd /d "%~dp0"
where node >nul 2>nul
if %ERRORLEVEL%==0 (
  start "" http://localhost:8080
  node server.js
  goto :eof
)
where py >nul 2>nul
if %ERRORLEVEL%==0 (
  start "" http://localhost:8080
  py -m http.server 8080
  goto :eof
)
where python >nul 2>nul
if %ERRORLEVEL%==0 (
  start "" http://localhost:8080
  python -m http.server 8080
  goto :eof
)
echo Node.js or Python was not found. Opening index.html directly instead...
start "" index.html
pause
