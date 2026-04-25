#!/usr/bin/env bash
# Bootstrap the GotchiCloset auto-renew backend on the existing Hostinger VPS.
# Run via hPanel Browser Terminal as root. Idempotent — re-running won't double-create.
#
# Prereq: export GH_PAT='ghp_xxx' before running. PAT needs 'repo' scope only.
#         Mint at https://github.com/settings/tokens/new (classic).
#
# What it does:
#   1. Installs a self-hosted GitHub Actions runner labelled `gotchicloset-vps`
#   2. Clones the gotchi-closet repo to /root/gotchicloset
#   3. Generates a hot wallet via viem and writes /root/gotchicloset/.env
#   4. First-time docker compose build + start (project name `gotchicloset`)
#   5. Health-checks
#
# What it does NOT do:
#   - Touch /root/<other-app>, /opt/actions-runner (no suffix), or any non-gotchicloset paths
#   - Run docker system prune or any cross-project destructive commands
#   - Set up nginx/TLS — do that AFTER you point a DNS A record at this box (see deploy/README.md)

set -euo pipefail

REPO_OWNER="robertatkinson3570"
REPO_NAME="gotchi-closet"
APP_DIR="/root/gotchicloset"
RUNNER_DIR="/opt/actions-runner-gotchicloset"
RUNNER_LABEL="gotchicloset-vps"
RUNNER_VERSION="2.317.0"
COMPOSE_PROJECT="gotchicloset"

red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
section(){ printf '\n\033[0;36m=== %s ===\033[0m\n' "$*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  red "Run as root."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  red "docker not installed on this box. Bailing."
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  red "curl not installed."
  exit 1
fi

# --- 1. Self-hosted runner -----------------------------------------------------

section "1/5  GitHub Actions runner"

if [[ -d "$RUNNER_DIR" && -f "$RUNNER_DIR/.runner" ]]; then
  yellow "runner already configured at $RUNNER_DIR — skipping registration"
else
  if [[ -z "${GH_PAT:-}" ]]; then
    red "Need GH_PAT env var with a GitHub PAT (repo scope) to mint a runner registration token."
    red "Mint one at: https://github.com/settings/tokens/new (classic, scope: repo)"
    red "Then run:    export GH_PAT='ghp_...'  &&  re-run this script"
    exit 1
  fi

  mkdir -p "$RUNNER_DIR"
  cd "$RUNNER_DIR"
  if [[ ! -f run.sh ]]; then
    yellow "downloading runner v$RUNNER_VERSION"
    curl -fsSL -o runner.tar.gz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
    tar xzf runner.tar.gz
    rm runner.tar.gz
  fi

  yellow "minting registration token via REST API…"
  RESP=$(curl -fsS -X POST \
    -H "Authorization: Bearer $GH_PAT" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runners/registration-token")
  if command -v jq >/dev/null 2>&1; then
    TOKEN=$(echo "$RESP" | jq -r .token)
  elif command -v python3 >/dev/null 2>&1; then
    TOKEN=$(echo "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
  else
    # Crude fallback: regex out the token field
    TOKEN=$(echo "$RESP" | grep -oP '"token"\s*:\s*"\K[^"]+')
  fi
  if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
    red "Failed to get registration token. Server said:"
    echo "$RESP"
    exit 1
  fi

  # Allow running as root — the runner refuses by default. Officially supported env flag.
  RUNNER_ALLOW_RUNASROOT="1" ./config.sh --url "https://github.com/${REPO_OWNER}/${REPO_NAME}" \
    --token "$TOKEN" \
    --labels "$RUNNER_LABEL" \
    --name "$RUNNER_LABEL" \
    --unattended

  yellow "installing as systemd service"
  RUNNER_ALLOW_RUNASROOT="1" ./svc.sh install
  RUNNER_ALLOW_RUNASROOT="1" ./svc.sh start
fi
green "runner status:"
cd "$RUNNER_DIR" && ./svc.sh status || true

# --- 2. Repo checkout ----------------------------------------------------------

section "2/5  Repo checkout"

if [[ -d "$APP_DIR/.git" ]]; then
  yellow "$APP_DIR exists — pulling latest"
  cd "$APP_DIR"
  git fetch --all --prune
  git reset --hard origin/main
else
  git clone "https://github.com/${REPO_OWNER}/${REPO_NAME}.git" "$APP_DIR"
fi
green "$APP_DIR $(git -C "$APP_DIR" rev-parse --short HEAD)"

# --- 3. Hot wallet + .env ------------------------------------------------------

section "3/5  Hot wallet + .env"

if [[ -f "$APP_DIR/.env" ]]; then
  yellow ".env already exists — leaving as-is. Edit by hand if you need to rotate."
else
  yellow "generating fresh hot wallet"
  cd "$APP_DIR"
  if [[ ! -d node_modules ]]; then
    if command -v pnpm >/dev/null 2>&1; then
      pnpm install --frozen-lockfile --prod=false
    else
      yellow "pnpm not found — using npm"
      npm install
    fi
  fi
  WALLET_OUT=$(node -e "
    const {generatePrivateKey, privateKeyToAccount} = require('viem/accounts');
    const k = generatePrivateKey();
    const a = privateKeyToAccount(k);
    console.log(JSON.stringify({key: k, address: a.address}));
  ")
  WALLET_KEY=$(echo "$WALLET_OUT" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).key)')
  WALLET_ADDR=$(echo "$WALLET_OUT" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).address)')

  cat > "$APP_DIR/.env" <<EOF
AUTORENEW_HOT_WALLET_KEY=${WALLET_KEY}
AUTORENEW_DB_PATH=/srv/gotchicloset/data/autorenew.db
BASE_RPC_URL=https://mainnet.base.org
SUBGRAPH_URL=https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn
PORT=8787
VITE_DEV_ALLOWED_ORIGINS=https://www.gotchicloset.com,https://gotchicloset.com,http://localhost:5000
EOF
  chmod 600 "$APP_DIR/.env"
  chown root:root "$APP_DIR/.env"

  green "hot wallet address: $WALLET_ADDR"
  green "----------------------------------------------------"
  green "ACTION REQUIRED:"
  green "  1. Fund $WALLET_ADDR with ~0.005 ETH on Base"
  green "  2. Add to your client .env:"
  green "       VITE_AUTORENEW_OPERATOR=$WALLET_ADDR"
  green "       VITE_AUTORENEW_API_URL=https://api.gotchicloset.com/api/lending/autorenew"
  green "  3. Redeploy the SPA on Vercel"
  green "----------------------------------------------------"
fi

# --- 4. Docker compose up ------------------------------------------------------

section "4/5  docker compose up"

cd "$APP_DIR"
docker compose -p "$COMPOSE_PROJECT" -f deploy/docker-compose.yml up -d --build
green "docker compose ps:"
docker compose -p "$COMPOSE_PROJECT" -f deploy/docker-compose.yml ps

# --- 5. Health check -----------------------------------------------------------

section "5/5  Health check"

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:8791/api/lending/autorenew/health > /tmp/gc_health.json 2>/dev/null; then
    green "health response:"
    cat /tmp/gc_health.json
    echo
    break
  fi
  yellow "wait $i…"
  sleep 3
done

if [[ ! -s /tmp/gc_health.json ]]; then
  red "health check did not respond. Container logs:"
  docker compose -p "$COMPOSE_PROJECT" -f deploy/docker-compose.yml logs --tail=80
  exit 1
fi

section "Done"
green "Auto-renew backend is up at 127.0.0.1:8791 inside the VPS."
green ""
green "Next steps (separate from this script):"
green "  - DNS: point A records gotchicloset.com / www.gotchicloset.com / api.gotchicloset.com -> 31.97.216.251"
green "  - nginx + certbot for api.gotchicloset.com (see deploy/README.md)"
green "  - Update client .env with VITE_AUTORENEW_OPERATOR + VITE_AUTORENEW_API_URL, redeploy SPA"
green ""
green "Tail logs anytime:  docker compose -p $COMPOSE_PROJECT -f $APP_DIR/deploy/docker-compose.yml logs -f"
