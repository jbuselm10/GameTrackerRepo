# GameTrackerRepo

Website for tracking who won card games among friends and family.

## Features

- **Home:** Introduction, instructions, and links
- **Players:** Add, update, or delete player profiles (name required; nickname optional)
- **Games:** Maintain the list of games that can be played
- **Tournaments:** Create a tournament (name, date, games needed to win), pick players once, then track plays until someone wins
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

1. Copy configs (once): run `setup-configs.bat`, or:

   ```powershell
   Copy-Item js/config.example.js js/config.js
   Copy-Item api/config.example.php api/config.php
   ```

2. Start PHP’s built-in server from the repo root:

   ```bat
   run.bat
   ```

   Or: `php -S localhost:8000`

3. Open http://localhost:8000

## Deploy

See [DEPLOY.md](DEPLOY.md) for GreenGeeks upload steps, writable `data/`, server configs, and password protection.
