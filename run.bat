@echo off
setlocal

cd /d "%~dp0"

where php >nul 2>&1
if errorlevel 1 (
  echo PHP was not found on PATH.
  echo Install PHP, or add it to PATH, then run this again.
  echo.
  pause
  exit /b 1
)

set PORT=8000
set URL=http://localhost:%PORT%

echo Starting GameTracker at %URL%
echo Press Ctrl+C to stop the server.
echo.

start "" "%URL%"
php -S localhost:%PORT%

endlocal
