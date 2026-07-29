# Deploy to GreenGeeks

GameTracker is PHP + static HTML/JS with JSON file storage. Upload the site into `public_html` (or a subdomain folder). No Node.js, MySQL, or build step is required.

## 1. Upload files

Upload the contents of this repo into your GreenGeeks web root, for example:

- Main domain: `public_html/`
- Subdomain / subfolder: `public_html/gametracker/` (or the folder cPanel assigned)

Preserve this layout:

```text
public_html/   (or your chosen folder)
  index.html
  *.html
  api/
  css/
  js/
  data/
  .htaccess              (included — protects .htpasswd / vendor / composer files)
  composer.json          (optional — only if using PHP Sentry)
```

Do **not** upload local-only files as secrets:

- Prefer creating `js/config.js` and `api/config.php` on the server from the examples (see step 4).
- Do not upload `vendor/` unless you ran `composer install` for that environment.

**Ways to upload:** cPanel File Manager, FTP/SFTP, or Git if your plan supports it.

## 2. Confirm PHP

GreenGeeks enables PHP by default. In cPanel → **Select PHP Version**, use **7.4 or newer** (8.x is fine).

If pages load but saves fail with a message about PHP, PHP is not running for that folder.

## 3. Make `data/` writable

The API writes `data/players.json`, `data/games.json`, and `data/tournaments.json`.

1. Keep `data/.htaccess` so browsers cannot download those files directly.
2. In File Manager (or FTP), set `data/` permissions so the web user can write — typically `755` on the folder and `644` on the JSON files. If saves still fail, try `775` on `data/` (or ask GreenGeeks support for the correct ownership).

### Fresh vs existing data

- **Keep current data:** upload the existing `data/*.json` files as-is.
- **Start empty:** replace each file’s contents with `[]` (a JSON empty array), or create three files containing only `[]`.

## 4. Create config files on the server

These files are gitignored. Create them on GreenGeeks after upload:

| Copy from | Create on server |
|-----------|------------------|
| `js/config.example.js` | `js/config.js` |
| `api/config.example.php` | `api/config.php` |

**On the server (File Manager):** duplicate each example file and rename the copy (remove `.example`), or paste the example contents into new files named `js/config.js` and `api/config.php`.

**Locally** you can run `setup-configs.bat`, or:

```powershell
Copy-Item js/config.example.js js/config.js
Copy-Item api/config.example.php api/config.php
```

```bash
cp js/config.example.js js/config.js
cp api/config.example.php api/config.php
```

Leave `sentryDsn` empty to run without Sentry. Paste real DSNs only if you use Sentry.

Set `environment` in `api/config.php` to `production` on GreenGeeks.

## 5. Optional: Composer / Sentry (PHP)

Only needed if you want server-side Sentry:

1. SSH into the account (if available) or use a terminal that can reach the site root.
2. Run `composer install --no-dev` in the folder that contains `composer.json`.
3. Put a real DSN in `api/config.php`.

Without `vendor/`, the app still runs; PHP Sentry simply stays off.

## 6. Protect the site (HTTP Basic Auth)

Anyone with the URL can change players, games, and tournaments unless you lock the folder down.

### Option A — cPanel (easiest)

1. cPanel → **Directory Privacy** (sometimes labeled **Password Protect Directories**).
2. Select `public_html` (or your GameTracker folder).
3. Enable protection, set a realm name (e.g. `Game Tracker`), and create a username/password.

### Option B — enable auth in the included `.htaccess`

1. Upload the repo’s `.htaccess` (already includes deny rules for `.htpasswd`, Composer files, and `vendor/`).
2. Create `.htpasswd` in the site root (or outside `public_html`).
3. Edit `.htaccess`: uncomment the `AuthType` / `AuthName` / `AuthUserFile` / `Require` lines and set `AuthUserFile` to the **full server path** of `.htpasswd` (e.g. `/home/USERNAME/public_html/.htpasswd`).
4. Generate a password hash:

```bash
# On the server (or any machine with htpasswd)
htpasswd -nbB yourusername 'your-strong-password'
```

Put the printed `username:hash` line into `.htpasswd`.

Or use an [htpasswd generator](https://hostingcanada.org/htpasswd-generator/) and paste the line into `.htpasswd`.

## 7. Smoke test

1. Open the site URL; you should see the home page (and a login prompt if auth is enabled).
2. Open **Players**, add a test player, refresh — it should persist.
3. Confirm `https://your-domain/.../data/players.json` returns **403** (not downloadable).
4. Create a short tournament and record a play; confirm History updates.

## Checklist

- [ ] Files uploaded with `api/`, `js/`, `css/`, `data/` intact
- [ ] PHP 7.4+ selected
- [ ] `data/` writable; `data/.htaccess` present
- [ ] `js/config.js` and `api/config.php` created on the server
- [ ] Password protection enabled (cPanel or `.htaccess`)
- [ ] Smoke test passed
