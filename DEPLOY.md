# Deploy to GreenGeeks

GameTracker is PHP + static HTML/JS with JSON file storage. No Node.js, MySQL, or build step is required.

**Preferred:** cPanel **Git Version Control** + [`.cpanel.yml`](.cpanel.yml) (below).  
**Fallback:** File Manager / FTP upload (section 8).

## 1. Clone the GitHub repo in cPanel

1. Push this repo to GitHub (already: `https://github.com/jbuselm10/GameTrackerRepo.git`).
2. cPanel → **Git Version Control** → **Create**.
3. Clone URL: your GitHub repo URL.
4. Repository Path: **outside** the web root, e.g. `repositories/GameTracker`  
   (full path like `/home/USERNAME/repositories/GameTracker`).  
   Do not clone into `public_html` — that can expose `.git`.

If the GitHub repo is private, add a deploy key or use a token as GreenGeeks/cPanel docs describe for private clones.

## 2. Set the deploy path in `.cpanel.yml`

Edit [`.cpanel.yml`](.cpanel.yml) and replace `USERNAME` with your cPanel username:

```yaml
- export DEPLOYPATH=/home/USERNAME/public_html/
```

Subfolder / subdomain example:

```yaml
- export DEPLOYPATH=/home/USERNAME/public_html/gametracker/
```

Commit and push that change to GitHub, then in cPanel Git → **Update from Remote**.

## 3. Deploy

In cPanel → Git Version Control → your repo → **Pull or Deploy**:

1. **Update from Remote** (pull latest from GitHub).
2. **Deploy HEAD Commit** (runs `.cpanel.yml`).

What deploy does:

- Copies HTML, `api/`, `css/`, `js/`, root `.htaccess`, `composer.json`, `favicon.png` into `DEPLOYPATH`.
- Ensures `data/.htaccess` exists.
- Creates `data/*.json` as `[]` **only if missing** — live data is never overwritten.
- Does **not** deploy gitignored `js/config.js` / `api/config.php` (create those once on the server). Existing server configs are left alone when you re-deploy `js/` and `api/` (files only on the server stay).

## 4. Confirm PHP

cPanel → **Select PHP Version** → **7.4 or newer** (8.x is fine).

If pages load but saves fail with a message about PHP, PHP is not running for that folder.

## 5. Make `data/` writable

1. Keep `data/.htaccess` (deploy copies it).
2. Set `data/` permissions so the web user can write — typically `755` on the folder and `644` on the JSON files. If saves still fail, try `775` on `data/` (or ask GreenGeeks support).

First deploy seeds empty `[]` files when missing. To reset production data later, replace each JSON file’s contents with `[]` in File Manager (do not rely on redeploy for that).

## 6. Create config files on the server

These files are gitignored. Create them once in the **deployed** site (File Manager under `public_html` or your subfolder), not only in the git clone:

| Copy from | Create on server |
|-----------|------------------|
| `js/config.example.js` | `js/config.js` |
| `api/config.example.php` | `api/config.php` |

Leave `sentryDsn` empty unless you use Sentry. Set `environment` in `api/config.php` to `production`.

## 7. Protect the site (HTTP Basic Auth)

Anyone with the URL can change data unless you lock the folder down.

### Option A — cPanel (easiest)

1. cPanel → **Directory Privacy** (sometimes **Password Protect Directories**).
2. Select `public_html` (or your GameTracker folder).
3. Enable protection, set a realm name, create a username/password.

### Option B — `.htaccess` + `.htpasswd`

1. Ensure root `.htaccess` was deployed.
2. Create `.htpasswd` in the site root (or outside `public_html`).
3. Uncomment the `AuthType` / `AuthName` / `AuthUserFile` / `Require` lines in `.htaccess` and set `AuthUserFile` to the full server path.
4. Generate a hash: `htpasswd -nbB yourusername 'your-strong-password'` and put `username:hash` in `.htpasswd`.

## 8. Fallback: File Manager / FTP

If you are not using Git Version Control, upload the site into `public_html/` (or a subfolder), preserve `api/`, `css/`, `js/`, `data/`, and both `.htaccess` files, then do steps 4–7. Prefer creating configs on the server. Do not upload `vendor/` unless you ran `composer install` for that environment. For a fresh site, upload `data/*.json` as `[]` each.

## 9. Optional: Composer / Sentry (PHP)

Only if you want server-side Sentry: in the **deployed** folder, `composer install --no-dev`, then set the DSN in `api/config.php`. Without `vendor/`, the app still runs.

## 10. Smoke test

1. Open the site URL (login prompt if auth is enabled).
2. **Players** → add a player → refresh — it persists.
3. `https://your-domain/.../data/players.json` returns **403**.
4. Create a short tournament, record a play, confirm **History** updates.

## Checklist

- [ ] `.cpanel.yml` has the correct `DEPLOYPATH` (`USERNAME` replaced)
- [ ] Repo cloned outside `public_html`; Deploy HEAD Commit succeeded
- [ ] PHP 7.4+ selected
- [ ] `data/` writable; `data/.htaccess` present; JSON seeded or preserved
- [ ] `js/config.js` and `api/config.php` created on the server; `environment` = `production`
- [ ] Password protection enabled
- [ ] Smoke test passed

## Ongoing updates

```text
Local → git push → cPanel Update from Remote → Deploy HEAD Commit
```

Configs and existing `data/*.json` stay on the server across deploys.
