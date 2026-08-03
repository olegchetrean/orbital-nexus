# Deploy — satelit.megapromoting.com

Aplicația este un build static (Vite + React). Se publică pe **serverul propriu
MEGA PROMOTING**, nu pe Vercel.

The app is a static build (Vite + React). It is published on **MEGA PROMOTING's
own server**, not on Vercel.

| | |
|---|---|
| Domeniu / Domain | `satelit.megapromoting.com` |
| Server | `141.227.180.10` — alias SSH `megapromoting`, user `ubuntu` |
| Document root | `/var/www/satelit` (owner `ubuntu:ubuntu`) |
| vhost nginx | `/etc/nginx/sites-available/satelit.megapromoting.com` (symlink în `sites-enabled/`) |
| Copie versionată / Versioned copy | [`deploy/nginx/satelit.megapromoting.com.conf`](../deploy/nginx/satelit.megapromoting.com.conf) |
| Webroot ACME | `/var/www/certbot` |
| Loguri / Logs | `/var/log/nginx/satelit.access.log`, `/var/log/nginx/satelit.error.log` |
| Script deploy | [`scripts/deploy.sh`](../scripts/deploy.sh) |

---

## Stare curentă / Current status

- [x] Director `/var/www/satelit` creat, build-ul actual este deja copiat acolo
- [x] vhost nginx activ pe **portul 80** (`nginx -t` trece, nginx reîncărcat)
- [x] `location /.well-known/acme-challenge/` funcțional (testat, HTTP 200)
- [ ] **Înregistrare DNS de tip A — LIPSEȘTE. Se adaugă manual (vezi Pasul 1).**
- [ ] Certificat TLS Let's Encrypt — se emite **după** ce DNS-ul propagă (Pasul 3)

Până când DNS-ul există, site-ul răspunde doar dacă forțezi IP-ul:

Until the DNS record exists, the site only answers if you force the IP:

```bash
curl -sI --resolve satelit.megapromoting.com:80:141.227.180.10 \
  http://satelit.megapromoting.com/
```

---

# 🇷🇴 Română

## Pasul 1 — Adaugă înregistrarea DNS (manual, la Hostinger)

Nameserverele domeniului `megapromoting.com` sunt la **Hostinger**
(`dns-parking.com`), deci zona **nu** se poate edita programatic. Oleg adaugă
înregistrarea din panoul Hostinger → *Domains* → `megapromoting.com` → *DNS / Nameservers*:

| Câmp | Valoare |
|---|---|
| Tip | `A` |
| Nume / Host | `satelit` (**nu** `satelit.megapromoting.com`) |
| Valoare / Points to | `141.227.180.10` |
| TTL | implicit (lasă cum e, de obicei 14400 sau „Automatic") |

Nu adăuga `AAAA` — serverul nu are IPv6 configurat pentru acest vhost.

## Pasul 2 — Verifică propagarea

```bash
dig +short satelit.megapromoting.com
# Răspuns așteptat:
# 141.227.180.10
```

Alternative dacă `dig` nu există:

```bash
host -t A satelit.megapromoting.com
nslookup satelit.megapromoting.com 8.8.8.8   # verifică direct la Google DNS
```

Propagarea durează de obicei 5–30 de minute, uneori până la câteva ore.
**Nu trece la Pasul 3 până când `dig` nu întoarce exact `141.227.180.10`** —
certbot va eșua și consumi din rate limit-ul Let's Encrypt
(5 eșecuri de validare / cont / oră).

## Pasul 3 — Emite certificatul TLS

După ce DNS-ul răspunde corect, pe server:

```bash
ssh megapromoting
sudo certbot --nginx -d satelit.megapromoting.com
```

Certbot modifică **singur** vhost-ul: adaugă blocul `listen 443 ssl`, liniile
`ssl_certificate`, și un bloc de redirect `80 → 443`. Când întreabă despre
redirect, alege opțiunea **„Redirect"** (2).

Nu edita manual fișierul pentru TLS și nu copia peste el versiunea din
`deploy/nginx/` după ce certbot a rulat — ai șterge configurația HTTPS.

Verificare:

```bash
curl -sI https://satelit.megapromoting.com/ | head -3
sudo certbot certificates          # arată data expirării
sudo systemctl list-timers | grep certbot   # reînnoirea automată e deja activă
```

## Pasul 4 — Deploy

Din rădăcina proiectului, pe laptop:

```bash
./scripts/deploy.sh
```

Scriptul: verifică uneltele și SSH-ul → `npm run build` → verifică integritatea
build-ului → `rsync --delete` spre `/var/www/satelit/` → verifică live cu
`curl -sI` și raportează codul HTTP.

Opțiuni:

```bash
./scripts/deploy.sh --skip-build   # publică dist/ existent, fără rebuild
./scripts/deploy.sh --dry-run      # arată ce s-ar copia, nu scrie nimic
./scripts/deploy.sh --help
```

Scriptul e idempotent — se poate rula de câte ori vrei. `--delete` șterge de pe
server fișierele care nu mai există în `dist/`, deci vechile asset-uri cu hash
sunt curățate automat.

**Nu e nevoie de reload nginx după deploy** — fișierele sunt statice. Reload doar
dacă modifici vhost-ul.

## Depanare

| Simptom | Cauză probabilă / soluție |
|---|---|
| `curl` → `000`, DNS nu răspunde | Înregistrarea A încă nu a propagat. Repetă Pasul 2. |
| HTTP 403 | Permisiuni. `ssh megapromoting 'ls -la /var/www/satelit'` — trebuie `ubuntu:ubuntu`, `755`. |
| HTTP 404 pe `/assets/...` | Build vechi pe server. Rulează `./scripts/deploy.sh` din nou. |
| Pagină albă, erori CSP în consolă | Un domeniu nou de API nu e în `connect-src`. Adaugă-l în vhost (secțiunea `location /` **și** `location = /index.html`), apoi `sudo nginx -t && sudo systemctl reload nginx`. |
| certbot: „Timeout during connect" | DNS-ul nu arată spre `141.227.180.10` sau portul 80 e blocat. |
| Build eșuează la `tsc -b` | Erori TypeScript în `src/`. Rezolvă-le; deploy-ul nu publică un build rupt. |
| Utilizatorii văd versiunea veche | Normal doar pentru `/assets/*` (cache 1 an, dar numele conțin hash). `index.html` are `no-store`, deci reîncărcarea rezolvă. |

Loguri:

```bash
ssh megapromoting 'sudo tail -50 /var/log/nginx/satelit.error.log'
ssh megapromoting 'sudo tail -50 /var/log/nginx/satelit.access.log'
```

## Revenire la o configurație anterioară de nginx

Înainte de instalarea acestui vhost s-a făcut backup complet la `/etc/nginx`:

```bash
ssh megapromoting 'ls -la /home/ubuntu/backups/'
# restaurare (doar în caz de nevoie):
ssh megapromoting 'sudo tar xzf /home/ubuntu/backups/nginx-<TIMESTAMP>.tar.gz -C / && sudo nginx -t && sudo systemctl reload nginx'
```

---

# 🇬🇧 English

## Step 1 — Add the DNS record (manually, at Hostinger)

The `megapromoting.com` nameservers are at **Hostinger** (`dns-parking.com`), so
the zone **cannot** be edited programmatically. Add the record from the Hostinger
panel → *Domains* → `megapromoting.com` → *DNS / Nameservers*:

| Field | Value |
|---|---|
| Type | `A` |
| Name / Host | `satelit` (**not** the full `satelit.megapromoting.com`) |
| Value / Points to | `141.227.180.10` |
| TTL | default (leave as-is, usually 14400 or "Automatic") |

Do not add an `AAAA` record — the server has no IPv6 configured for this vhost.

## Step 2 — Check propagation

```bash
dig +short satelit.megapromoting.com
# Expected:
# 141.227.180.10
```

Fallbacks if `dig` is unavailable:

```bash
host -t A satelit.megapromoting.com
nslookup satelit.megapromoting.com 8.8.8.8
```

Propagation usually takes 5–30 minutes, occasionally a few hours.
**Do not proceed to Step 3 until `dig` returns exactly `141.227.180.10`** —
certbot would fail and burn Let's Encrypt rate limit (5 failed validations per
account per hour).

## Step 3 — Issue the TLS certificate

Once DNS resolves correctly, on the server:

```bash
ssh megapromoting
sudo certbot --nginx -d satelit.megapromoting.com
```

Certbot edits the vhost **itself**: it adds the `listen 443 ssl` block, the
`ssl_certificate` lines, and an `80 → 443` redirect block. When prompted about
redirection, choose **"Redirect"** (option 2).

Do not hand-edit the file for TLS, and do not copy the `deploy/nginx/` version
over it after certbot has run — that would wipe the HTTPS configuration.

Verify:

```bash
curl -sI https://satelit.megapromoting.com/ | head -3
sudo certbot certificates                    # expiry date
sudo systemctl list-timers | grep certbot    # auto-renewal is already enabled
```

## Step 4 — Deploy

From the project root, on your laptop:

```bash
./scripts/deploy.sh
```

The script: checks tooling and SSH → `npm run build` → validates build integrity
→ `rsync --delete` to `/var/www/satelit/` → verifies live with `curl -sI` and
reports the HTTP status code.

Options:

```bash
./scripts/deploy.sh --skip-build   # ship the existing dist/, no rebuild
./scripts/deploy.sh --dry-run      # show what would be copied, write nothing
./scripts/deploy.sh --help
```

The script is idempotent — run it as often as you like. `--delete` removes files
from the server that no longer exist in `dist/`, so stale hashed assets are
cleaned up automatically.

**No nginx reload is needed after a deploy** — the files are static. Reload only
when you change the vhost.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `curl` → `000`, DNS not resolving | The A record hasn't propagated yet. Repeat Step 2. |
| HTTP 403 | Permissions. `ssh megapromoting 'ls -la /var/www/satelit'` — expect `ubuntu:ubuntu`, `755`. |
| HTTP 404 on `/assets/...` | Stale build on the server. Re-run `./scripts/deploy.sh`. |
| Blank page, CSP errors in console | A new API host is missing from `connect-src`. Add it to the vhost (in `location /` **and** `location = /index.html`), then `sudo nginx -t && sudo systemctl reload nginx`. |
| certbot: "Timeout during connect" | DNS does not point to `141.227.180.10`, or port 80 is blocked. |
| Build fails at `tsc -b` | TypeScript errors in `src/`. Fix them; the deploy will not ship a broken build. |
| Users see an old version | Expected only for `/assets/*` (1-year cache, but filenames are content-hashed). `index.html` is `no-store`, so a reload fixes it. |

Logs:

```bash
ssh megapromoting 'sudo tail -50 /var/log/nginx/satelit.error.log'
ssh megapromoting 'sudo tail -50 /var/log/nginx/satelit.access.log'
```

## Rolling back the nginx configuration

A full backup of `/etc/nginx` was taken before installing this vhost:

```bash
ssh megapromoting 'ls -la /home/ubuntu/backups/'
# restore (only if needed):
ssh megapromoting 'sudo tar xzf /home/ubuntu/backups/nginx-<TIMESTAMP>.tar.gz -C / && sudo nginx -t && sudo systemctl reload nginx'
```

---

## Note tehnice / Technical notes

- **SPA fallback**: `try_files $uri $uri/ /index.html` — react-router handles
  routes client-side.
- **`base: './'`** in `vite.config.ts` means `index.html` requests assets
  relatively. For deep links ending in `/` that would break, so the vhost has two
  `rewrite` rules that pull `*/assets/*` back to the root. If you ever switch to
  `base: '/'`, those rules become harmless no-ops.
- **Caching**: `/assets/*` → `max-age=31536000, immutable` (filenames are
  content-hashed); `index.html` → `no-cache, no-store, must-revalidate`.
- **CSP**: allows `worker-src 'self' blob:` (the SGP4 orbit worker) and WebGL,
  and whitelists `celestrak.org`, `services.swpc.noaa.gov`, `www.swpc.noaa.gov`,
  `ll.thespacedevs.com`, `db.satnogs.org`, `api.wheretheiss.at` in `connect-src`.
  **Any new external data source must be added there or the browser will block it.**
- **nginx gotcha**: `add_header` is not inherited into a block that defines its
  own `add_header` directives — that is why the security headers are repeated in
  several `location` blocks. Do not "clean that up".
