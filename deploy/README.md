# GotchiCloset auto-renew deploy

Deploys to the user's Hostinger VPS (`srv1360330` / `31.97.216.251`) using a self-hosted GitHub Actions runner. Direct external SSH is refused on this host — go via hPanel Browser Terminal for one-time setup, then GitHub Actions for everything else.

## Isolation guarantees — DO NOT MODIFY

This box hosts other live services that have nothing to do with GotchiCloset. The deploy below is **strictly isolated**:

| Resource | GotchiCloset value | Why it's safe |
|---|---|---|
| App dir | `/root/gotchicloset` | Sibling to `/root/marquiq`, never touches it |
| Docker compose project name | `gotchicloset` (forced via `-p gotchicloset`) | Containers/volumes/networks live under `gotchicloset_*` namespace |
| Container name | `gotchicloset-autorenew` | Unique, no collision possible |
| Port (host bind) | `127.0.0.1:8791` | Bound to localhost only; doesn't expose publicly |
| Volume | `gotchicloset_autorenew_data` | Project-scoped Docker volume |
| GH Actions runner | label `gotchicloset-vps`, dir `/opt/actions-runner-gotchicloset` | Separate from any other runner on the box |
| nginx site | `/etc/nginx/sites-*/api.gotchicloset.com` | Own file; only `nginx -t && systemctl reload nginx` after changes (validates first) |

**RULES — every Claude session and every operator working on this:**

- ✅ Always run `docker compose` with **both** `-p gotchicloset` AND `-f deploy/docker-compose.yml`
- ✅ Only edit nginx site files at `api.gotchicloset.com`
- ❌ NEVER `docker system prune`, `docker volume prune`, `docker network prune` — would wipe data from other apps on this box
- ❌ NEVER `docker compose down` without `-p gotchicloset -f deploy/docker-compose.yml`
- ❌ NEVER edit `/root/<other-app>/**`, `/opt/actions-runner/**` (no suffix), or unfamiliar nginx site files
- ❌ NEVER restart `nginx` (always `reload`); never `systemctl restart docker` or anything that touches the daemon

## What's deployed

- Node service in Docker, container `gotchicloset-autorenew`
- Bound to `127.0.0.1:8791` (nginx reverse-proxies to a public hostname)
- SQLite db at `/root/gotchicloset/data/autorenew.db`
- Cron every 2 minutes that re-lists tokens whose templates are enabled and have no active listing on-chain
- Hot wallet only has listing rights (`setLendingOperator`) — cannot transfer or sell gotchis

## One-time setup (run via hPanel Browser Terminal as root)

### 1. Register a self-hosted runner for `gotchi-closet`

Existing runners on the box are bound to their own repos; we need a separate one for `gotchi-closet`.

```bash
# Get a one-time registration token
TOKEN=$(gh api -X POST repos/robertatkinson3570/gotchi-closet/actions/runners/registration-token --jq .token)

# Install + register
mkdir -p /opt/actions-runner-gotchicloset
cd /opt/actions-runner-gotchicloset
curl -o runner.tar.gz -L https://github.com/actions/runner/releases/download/v2.317.0/actions-runner-linux-x64-2.317.0.tar.gz
tar xzf runner.tar.gz
./config.sh --url https://github.com/robertatkinson3570/gotchi-closet \
  --token "$TOKEN" \
  --labels gotchicloset-vps \
  --name gotchicloset-vps \
  --unattended
./svc.sh install
./svc.sh start
./svc.sh status
```

### 2. Clone the repo

```bash
git clone https://github.com/robertatkinson3570/gotchi-closet.git /root/gotchicloset
cd /root/gotchicloset
```

### 3. Generate a hot wallet

```bash
node -e "const {generatePrivateKey, privateKeyToAccount} = require('viem/accounts'); const k = generatePrivateKey(); const a = privateKeyToAccount(k); console.log('PRIVATE_KEY=' + k); console.log('ADDRESS=' + a.address);"
```

Save the **private key** to `/root/gotchicloset/.env` (next step). Save the **public address** — you'll add it to the client `.env` as `VITE_AUTORENEW_OPERATOR` and rebuild the SPA.

Fund the address with ~0.005 ETH on Base (lasts a long time at Base gas rates).

### 4. Create env file

```bash
cat > /root/gotchicloset/.env <<'EOF'
AUTORENEW_HOT_WALLET_KEY=0xPASTE_PRIVATE_KEY
AUTORENEW_DB_PATH=/srv/gotchicloset/data/autorenew.db
BASE_RPC_URL=https://mainnet.base.org
SUBGRAPH_URL=https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn
PORT=8787
VITE_DEV_ALLOWED_ORIGINS=https://www.gotchicloset.com,https://gotchicloset.com,http://localhost:5000
EOF
chmod 600 /root/gotchicloset/.env
chown root:root /root/gotchicloset/.env
```

### 5. nginx + TLS for `api.gotchicloset.com`

(After pointing the DNS at the VPS.)

```bash
cat > /etc/nginx/sites-available/api.gotchicloset.com <<'EOF'
server {
    listen 80;
    server_name api.gotchicloset.com;
    location / {
        proxy_pass http://127.0.0.1:8791;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/api.gotchicloset.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.gotchicloset.com --non-interactive --agree-tos -m you@example.com
```

### 6. First deploy (manually)

```bash
cd /root/gotchicloset
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f
```

You should see `[autorenew] enabled · operator=0x...`. After this, every push to `main` that touches `server/**` or `deploy/**` auto-deploys via the GitHub Actions workflow.

### 7. Update the client

In your local `.env`:

```
VITE_AUTORENEW_OPERATOR=0x<the public address from step 3>
VITE_AUTORENEW_API_URL=https://api.gotchicloset.com/api/lending/autorenew
```

Redeploy the SPA (Vercel: `npx vercel --prod --yes` from the project root).

## Verifying

```bash
# Health check
curl https://api.gotchicloset.com/api/lending/autorenew/health
# {"ok":true,"operator":"0x...","enabledCount":0}

# Watch logs (on VPS)
cd /root/gotchicloset && docker compose -f deploy/docker-compose.yml logs -f
```

Then list a gotchi from the UI with auto-renew toggled on. The next time it ends, the cron should re-list automatically.

## Manual deploy fire

```bash
gh workflow run "Deploy auto-renew to VPS"
gh run list --workflow="Deploy auto-renew to VPS" --limit 1
gh run watch <run-id>
```

## Operations

- DB backup: `cp /root/gotchicloset/data/autorenew.db /backups/autorenew-$(date +%Y%m%d).db`
- Disable a single token: `curl -X POST https://api.gotchicloset.com/api/lending/autorenew/listings/<tokenId>/enable -H 'content-type: application/json' -d '{"enabled":false}'`
- Tx log for a token: `curl https://api.gotchicloset.com/api/lending/autorenew/listings/<tokenId>/log`
- Hot wallet should hold ≤0.01 ETH; rotate quarterly: generate new key → update `.env` → restart → users re-authorize on next list

## Security notes

- The hot wallet is only authorized via `setLendingOperator(operator, tokenId, true)` — it can list on the user's behalf but cannot transfer the gotchi away
- Per-user opt-in: a user must explicitly enable auto-renew on each listing
- Listings carry a `splitOther = 5%` going to `0xc4Cb6cB969e8b4e309Ab98E4Da51b77887aFaD96` (configurable) — this is the service fee
- If the hot wallet is compromised, blast radius is "spam-list a user's gotchi" — not asset theft. Rotate immediately.
