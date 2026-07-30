# Deploy to GreenGeeks

GameTracker is PHP + static HTML/JS with JSON file storage. No Node.js, MySQL, or build step.

**Method:** clone this GitHub repo **directly** into the subdomain docroot (`public_html/GameTracker`). The live site *is* the git working tree — no separate clone and no `.cpanel.yml` copy step.

**Site:** https://gametracker.buselmeier.com  
**Docroot:** `/home/jbuse10/public_html/GameTracker/`

## 0. Remove an old “repositories” clone (if you made one)

If you previously cloned to something like `repositories/GameTracker`:

1. File Manager → delete that folder (or remove it in **Git Version Control** if listed).
2. Do **not** use Deploy HEAD Commit / `.cpanel.yml` anymore.

Ensure `public_html/GameTracker` is empty (or only has default cPanel placeholders you can remove) before cloning into it.

## 1. Clone GitHub into `public_html/GameTracker`

1. cPanel → **Git Version Control** → **Create**.
2. Clone URL: `https://github.com/jbuselm10/GameTrackerRepo.git`
3. Repository Path: `public_html/GameTracker`  
   (full path: `/home/jbuse10/public_html/GameTracker`)
4. Create / clone.

The site files (`index.html`, `api/`, `js/`, `.htaccess`, etc.) appear immediately in that folder. There is **no** separate Deploy step — **Update from Remote** is enough for later updates.

If the GitHub repo is private, use a deploy key or token per GreenGeeks/cPanel docs.

## 2. Confirm PHP

cPanel → **Select PHP Version** → **7.4 or newer** (8.x is fine).

## 3. Fresh data + writable `data/`

Repo `data/*.json` may contain sample/dev data. For an empty production site, in File Manager edit each file under `public_html/GameTracker/data/` to contain only:

```json
[]
```

Files: `players.json`, `games.json`, `tournaments.json`. Keep `data/.htaccess`.

Set `data/` writable (`755` folder / `644` JSON; try `775` on `data/` if saves fail).

## 4. Create config files on the server

Gitignored — create once in `public_html/GameTracker`:

| Copy from | Create on server |
|-----------|------------------|
| `js/config.example.js` | `js/config.js` |
| `api/config.example.php` | `api/config.php` |

Leave `sentryDsn` empty unless you use Sentry. Set `environment` in `api/config.php` to `production`.

## 5. Optional: protect the site

Skip this if you do not want a login prompt. Anyone with the URL can then change players, games, and tournaments.

To lock it later: cPanel → **Directory Privacy** → `public_html/GameTracker` → enable + username/password.

Root `.htaccess` still blocks web access to `.git/`, Composer files, `vendor/`, `data/` JSON (via `data/.htaccess`), and `.htpasswd`.

## 6. Optional: Composer / Sentry (PHP)

In `public_html/GameTracker`: `composer install --no-dev`, then set the DSN in `api/config.php`. Without `vendor/`, the app still runs.

## 7. Smoke test

1. https://gametracker.buselmeier.com
2. **Players** → add player → refresh — persists
3. `https://gametracker.buselmeier.com/data/players.json` returns **403**
4. Short tournament + play → **History** updates

## Checklist

- [ ] Old `repositories/…` clone removed (if any)
- [ ] Repo cloned into `public_html/GameTracker`
- [ ] PHP 7.4+
- [ ] `data/*.json` set to `[]` for fresh start; `data/` writable; `data/.htaccess` present
- [ ] `js/config.js` and `api/config.php` created; `environment` = `production`
- [ ] Smoke test passed

## Ongoing updates

```text
Local → git push → cPanel Git Version Control → Update from Remote
```

No Deploy HEAD Commit. Server configs and live `data/*.json` stay on the server if you do not reset them; a hard reset/checkout that overwrites `data/` would replace JSON — avoid force-resetting those files on the server.
