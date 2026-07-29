@echo off
setlocal
cd /d "%~dp0"

if not exist "js\config.js" (
  copy /Y "js\config.example.js" "js\config.js" >nul
  echo Created js\config.js
) else (
  echo js\config.js already exists — skipped
)

if not exist "api\config.php" (
  copy /Y "api\config.example.php" "api\config.php" >nul
  echo Created api\config.php
) else (
  echo api\config.php already exists — skipped
)

echo.
echo Done. Edit the config files to add Sentry DSNs if needed.
echo On GreenGeeks, create the same two files from the *.example.* copies.
endlocal
