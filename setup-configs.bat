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

if not exist "data\players.json" (
  copy /Y "data\players.json.example" "data\players.json" >nul
  echo Created data\players.json
) else (
  echo data\players.json already exists — skipped
)

if not exist "data\games.json" (
  copy /Y "data\games.json.example" "data\games.json" >nul
  echo Created data\games.json
) else (
  echo data\games.json already exists — skipped
)

if not exist "data\tournaments.json" (
  copy /Y "data\tournaments.json.example" "data\tournaments.json" >nul
  echo Created data\tournaments.json
) else (
  echo data\tournaments.json already exists — skipped
)

if not exist "data\teams.json" (
  copy /Y "data\teams.json.example" "data\teams.json" >nul
  echo Created data\teams.json
) else (
  echo data\teams.json already exists — skipped
)

if not exist "data\cornhole-tournaments.json" (
  copy /Y "data\cornhole-tournaments.json.example" "data\cornhole-tournaments.json" >nul
  echo Created data\cornhole-tournaments.json
) else (
  echo data\cornhole-tournaments.json already exists — skipped
)

echo.
echo Done. Edit the config files to add Sentry DSNs if needed.
echo On GreenGeeks, create configs and data\*.json from the *.example copies if missing.
endlocal
