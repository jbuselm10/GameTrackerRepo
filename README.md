# GameTrackerRepo

Website for tracking who won card games among friends and family.

## Features

- **Home:** Introduction, instructions, and links
- **Players:** Add, update, or delete player profiles (name required; nickname optional)
- **Teams:** Name a team and assign players; use teams as tournament competitors
- **Games:** Maintain the list of games that can be played
- **Tournaments:** Create a tournament (name, date, scoring mode, player or team competitors), then track plays until someone wins
- **History:** Summaries by tournament, game, and player

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | HTML + Tailwind CSS (CDN) + vanilla JavaScript |
| Backend | PHP 7.4+ JSON REST API (`api/`) |
| Storage | JSON files in `data/` (no MySQL) |
| Hosting | GreenGeeks shared hosting (`public_html`) |
| Version control | GitHub |
| Optional | Sentry (browser + PHP via Composer) |

## Local development

1. Copy configs and empty data files (once): run `setup-configs.bat`, or:

   ```powershell
   Copy-Item js/config.example.js js/config.js
   Copy-Item api/config.example.php api/config.php
   Copy-Item data/players.json.example data/players.json
   Copy-Item data/games.json.example data/games.json
   Copy-Item data/tournaments.json.example data/tournaments.json
   Copy-Item data/teams.json.example data/teams.json
   ```

   `data/*.json` is gitignored — your local players/games/tournaments/teams stay on your machine only.

2. Start PHP’s built-in server from the repo root:

   ```bat
   run.bat
   ```

   Or: `php -S localhost:8000`

3. Open http://localhost:8000

## Deploy

Clone this repo directly into GreenGeeks `public_html/GameTracker` via cPanel **Git Version Control**.  
See [DEPLOY.md](DEPLOY.md).
