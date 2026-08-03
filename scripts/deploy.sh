#!/usr/bin/env bash
# =============================================================================
#  deploy.sh — publica Orbital Nexus pe satelit.megapromoting.com
#
#  Ce face, in ordine:
#    1. verifica uneltele si conexiunea SSH
#    2. `npm run build`  (tsc + vite -> dist/)
#    3. verifica integritatea build-ului (index.html trimite spre asset-uri reale)
#    4. `rsync --delete` catre /var/www/satelit de pe server
#    5. verifica live cu `curl -sI` si raporteaza codul HTTP
#
#  Este idempotent: se poate rula de oricate ori, rezultatul e acelasi.
#
#  Utilizare:
#    ./scripts/deploy.sh                 # build + deploy + verificare
#    ./scripts/deploy.sh --skip-build    # foloseste dist/ existent
#    ./scripts/deploy.sh --dry-run       # arata ce s-ar copia, fara sa scrie
#
#  Server: 141.227.180.10, alias SSH `megapromoting` (vezi ~/.ssh/config)
# =============================================================================

set -euo pipefail

# --- Configuratie ------------------------------------------------------------
SSH_HOST="megapromoting"
SERVER_IP="141.227.180.10"
DOMAIN="satelit.megapromoting.com"
REMOTE_DIR="/var/www/satelit"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${PROJECT_ROOT}/dist"

# --- Optiuni din linia de comanda --------------------------------------------
SKIP_BUILD=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --dry-run)    DRY_RUN=1 ;;
    -h|--help)    sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Optiune necunoscuta: $arg  (vezi --help)" >&2; exit 2 ;;
  esac
done

# --- Ajutoare pentru afisare -------------------------------------------------
pas()  { printf '\n\033[1;36m==>\033[0m \033[1m%s\033[0m\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
avert(){ printf '    \033[33m!\033[0m %s\n' "$*"; }
eroare(){ printf '\n\033[1;31mEROARE:\033[0m %s\n' "$*" >&2; exit 1; }

# =============================================================================
#  1. Verificari preliminare
# =============================================================================
pas "1/5  Verific uneltele si conexiunea"

for unealta in npm rsync ssh curl; do
  command -v "$unealta" >/dev/null 2>&1 || eroare "Lipseste '$unealta' din PATH."
done
ok "npm, rsync, ssh, curl sunt disponibile"

if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_HOST" true 2>/dev/null; then
  eroare "Nu ma pot conecta la '$SSH_HOST'. Verifica ~/.ssh/config si cheia id_ed25519."
fi
ok "Conexiune SSH catre $SSH_HOST ($SERVER_IP)"

# =============================================================================
#  2. Build
# =============================================================================
if [[ "$SKIP_BUILD" -eq 1 ]]; then
  pas "2/5  Build sarit (--skip-build)"
  [[ -f "${DIST_DIR}/index.html" ]] || eroare "Nu exista dist/index.html. Ruleaza fara --skip-build."
  ok "Folosesc dist/ existent"
else
  pas "2/5  Construiesc aplicatia (npm run build)"
  cd "$PROJECT_ROOT"
  npm run build
  ok "Build terminat"
fi

# =============================================================================
#  3. Verificarea integritatii build-ului
#     (prinde cazul in care index.html trimite spre hash-uri de asset-uri
#      care nu mai exista pe disc — build intrerupt sau dist/ amestecat)
# =============================================================================
pas "3/5  Verific integritatea build-ului"

[[ -f "${DIST_DIR}/index.html" ]] || eroare "Lipseste ${DIST_DIR}/index.html"

lipsa=0
while IFS= read -r referinta; do
  [[ -z "$referinta" ]] && continue
  if [[ ! -f "${DIST_DIR}/${referinta}" ]]; then
    avert "index.html cere '${referinta}' — fisierul NU exista in dist/"
    lipsa=$((lipsa + 1))
  fi
done < <(grep -oE '(src|href)="\.?/?(assets/[^"]+|favicon\.svg)"' "${DIST_DIR}/index.html" \
         | sed -E 's/.*="\.?\/?//; s/"$//')

if [[ "$lipsa" -gt 0 ]]; then
  eroare "$lipsa referinte rupte in dist/. Ruleaza din nou 'npm run build' (fara --skip-build)."
fi

dimensiune="$(du -sh "$DIST_DIR" | cut -f1)"
numar_fisiere="$(find "$DIST_DIR" -type f | wc -l | tr -d ' ')"
ok "dist/ este coerent: ${numar_fisiere} fisiere, ${dimensiune}"

# =============================================================================
#  4. Sincronizare pe server
# =============================================================================
pas "4/5  Trimit fisierele pe server (${SSH_HOST}:${REMOTE_DIR})"

# mkdir -p este idempotent; ne asiguram ca directorul exista si dupa o reinstalare
ssh "$SSH_HOST" "mkdir -p '${REMOTE_DIR}'"

RSYNC_OPTIUNI=(-avz --delete --human-readable)
if [[ "$DRY_RUN" -eq 1 ]]; then
  RSYNC_OPTIUNI+=(--dry-run)
  avert "MOD DRY-RUN: nu se scrie nimic pe server"
fi

# Slash-ul final la 'dist/' este obligatoriu: copiaza CONTINUTUL, nu directorul.
rsync "${RSYNC_OPTIUNI[@]}" "${DIST_DIR}/" "${SSH_HOST}:${REMOTE_DIR}/"

if [[ "$DRY_RUN" -eq 1 ]]; then
  pas "Dry-run incheiat. Nu s-a modificat nimic."
  exit 0
fi
ok "Fisiere sincronizate"

# =============================================================================
#  5. Verificare live
# =============================================================================
pas "5/5  Verific site-ul"

# Rezolvare DNS portabila (dig / host / python3)
rezolva_dns() {
  if command -v dig >/dev/null 2>&1; then
    dig +short "$DOMAIN" A | grep -E '^[0-9.]+$' | head -1
  elif command -v host >/dev/null 2>&1; then
    host -t A "$DOMAIN" 2>/dev/null | awk '/has address/{print $NF; exit}'
  else
    python3 -c "import socket;print(socket.gethostbyname('${DOMAIN}'))" 2>/dev/null || true
  fi
}

cod_http() {
  curl -sS -o /dev/null -w '%{http_code}' -I --max-time 20 "$@" 2>/dev/null || echo "000"
}

IP_DNS="$(rezolva_dns || true)"

if [[ -n "$IP_DNS" ]]; then
  ok "DNS: ${DOMAIN} -> ${IP_DNS}"
  [[ "$IP_DNS" == "$SERVER_IP" ]] || avert "DNS-ul NU arata spre ${SERVER_IP}. Verifica zona la Hostinger."

  cod_https="$(cod_http "https://${DOMAIN}/")"
  cod_http80="$(cod_http "http://${DOMAIN}/")"

  echo "    HTTPS https://${DOMAIN}/  ->  HTTP ${cod_https}"
  echo "    HTTP  http://${DOMAIN}/   ->  HTTP ${cod_http80}"

  case "$cod_https" in
    200) ok "Site-ul raspunde corect pe HTTPS." ;;
    000) avert "HTTPS indisponibil (certificat lipsa?). Ruleaza pe server:"
         avert "  sudo certbot --nginx -d ${DOMAIN}" ;;
    *)   avert "HTTPS a raspuns cu ${cod_https} — verifica /var/log/nginx/satelit.error.log" ;;
  esac

  if [[ "$cod_http80" == "200" && "$cod_https" != "200" ]]; then
    avert "Deocamdata merge doar pe HTTP. Certificatul TLS inca nu e emis."
  fi
else
  avert "DNS: ${DOMAIN} inca NU se rezolva."
  avert "Trebuie adaugata la Hostinger o inregistrare A:  satelit -> ${SERVER_IP}"
  avert "Verific totusi direct pe IP-ul serverului..."

  cod_direct="$(cod_http --resolve "${DOMAIN}:80:${SERVER_IP}" "http://${DOMAIN}/")"
  echo "    http://${DOMAIN}/ (via --resolve ${SERVER_IP})  ->  HTTP ${cod_direct}"

  if [[ "$cod_direct" == "200" ]]; then
    ok "Serverul serveste corect fisierele. Mai lipseste doar DNS-ul + certbot."
  else
    eroare "Serverul a raspuns cu ${cod_direct}. Verifica: ssh ${SSH_HOST} 'sudo nginx -t'"
  fi
fi

pas "Gata. Detalii complete in docs/DEPLOY.md"
