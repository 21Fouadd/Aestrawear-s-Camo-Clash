# Camo Clash Jeddah match-server deployment

These files install a prebuilt authoritative Node.js server on one OCI Compute
VM in `me-jeddah-1`. The browser game remains on Cloudflare; both players open
`wss://<trusted-hostname>/v2` and send only authenticated inputs to this VM.

## Recommended host

- OCI Jeddah (`me-jeddah-1`) Always Free `VM.Standard.A1.Flex` (ARM64), using
  1 OCPU and 6 GB RAM, with Oracle Linux 9 or Ubuntu 24.04.
- A reserved public IPv4 address in a public subnet with an Internet gateway.
- A user-owned DNS name such as `game-api.example.com` pointing directly to
  that reserved IP. Use a DNS-only record while measuring latency; adding a
  proxy inserts another network hop.
- Node.js 22.13 or newer, npm, NGINX, Certbot, curl, tar, and systemd.

Do not expose the Node listener. It must bind only to `127.0.0.1:3002`; NGINX
is the sole Internet-facing process and terminates trusted TLS.

## Network and host firewall

Create an OCI Network Security Group for the VM with stateful TCP ingress:

| Port | Source | Purpose |
| --- | --- | --- |
| 443 | `0.0.0.0/0`, and `::/0` if IPv6 is configured | WSS gameplay |
| 80 | `0.0.0.0/0`, and `::/0` if IPv6 is configured | ACME and HTTPS redirect |
| 22 | The administrator's current public IP `/32` only | SSH administration |

Never add an OCI ingress rule for port 3002. Keep normal outbound HTTPS, DNS,
and NTP available so packages and certificates can be maintained.

Ubuntu UFW equivalent (keep the SSH rule active before enabling UFW):

```bash
sudo ufw allow from YOUR_PUBLIC_IP/32 to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Oracle Linux `firewalld` equivalent (restrict SSH at the OCI NSG as well):

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
sudo setsebool -P httpd_can_network_connect 1
```

The SELinux boolean is required on enforcing Oracle Linux hosts so NGINX can
connect to the loopback-only Node listener. It does not expose port 3002.

Firewall changes are deliberately not automated by `deploy.sh`, because an
incorrect SSH source can lock the operator out of a remote VM.

## Host prerequisites

Install NGINX, Certbot, curl, tar, and a system Node.js 22.13+ runtime using the
distribution's supported package channel. Confirm the runtime before deploy:

```bash
node --version
npm --version
nginx -v
certbot --version
```

On Ubuntu, `/etc/nginx/conf.d/*.conf` is included by the standard `http` block.
On a custom NGINX installation, verify that include before deployment. The same
standard include is expected on Oracle Linux.

## DNS and TLS

Prefer a hostname in a domain you own. Point its A record to the VM's reserved
public IP, wait until `dig +short game-api.example.com` returns that address,
then deploy. `deploy.sh` uses Certbot's HTTP-01 webroot flow and never accepts a
self-signed certificate.

For a short test only, a public-IP hostname from `nip.io` can substitute for an
owned domain, for example `203-0-113-10.nip.io`. Confirm it resolves before use.
This delegates DNS availability and naming control to a third party, so it is
not a production identity and should not hold long-lived access tokens. Move to
an owned hostname before inviting real players.

## Build the release archive

Build in the server package, then archive only its locked production package
metadata and prebuilt JavaScript. The archive must have these paths at its root:

```text
package.json
package-lock.json
dist/index.js
```

Example:

```bash
tar -czf camo-clash-server.tar.gz package.json package-lock.json dist
sha256sum camo-clash-server.tar.gz
```

Do not include `.env`, private keys, source credentials, or `node_modules`.
`deploy.sh` installs locked production dependencies on the ARM VM with
`npm ci --omit=dev`.

## Configure secrets outside the release

Copy `camo-clash.env.example` to a secure operator path and replace every
placeholder. Generate a strong ticket secret without putting it in shell
history, for example by opening the file in a restricted editor and inserting
the output of `openssl rand -base64 48`. The same ticket-signing secret must be
installed through the protected secret facility of the Cloudflare issuer; it
must never be shipped to browser JavaScript.

Required invariants enforced by the deploy script:

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=3002`
- `PUBLIC_BASE_URL=https://<trusted-hostname>`
- `ALLOWED_ORIGINS` contains every exact `--origin`, comma-separated
- `MATCH_TICKET_SECRET` is a real value of at least 32 characters

The installed file is `/etc/camo-clash/camo-clash.env`, owned by root with mode
`0600`. A later deploy reuses it unless `--env-file` is passed explicitly.

## Deploy or update

Copy the archive, its checksum, a populated environment file, and this deploy
directory to the VM. Run:

```bash
sudo bash ./deploy.sh \
  --archive /tmp/camo-clash-server.tar.gz \
  --sha256 PASTE_THE_64_CHARACTER_SHA256 \
  --hostname game-api.example.com \
  --origin https://camo-clash-aestrawear.aestrawear-camo-clash.workers.dev \
  --env-file /root/camo-clash.env \
  --cert-email ops@example.com
```

Repeat `--origin` when the game is intentionally served from another trusted
HTTPS origin, and include the same comma-separated origins in the environment
file. On later releases, omit `--env-file` and `--cert-email` unless rotating
configuration or changing the certificate account.

The deploy is idempotent by archive SHA-256. Releases live under
`/opt/camo-clash/releases`, and `/opt/camo-clash/current` switches atomically.
The script checks the new process at `http://127.0.0.1:3002/healthz`; if that
fails, it restores the previous release. It then validates and reloads NGINX
and checks the public HTTPS health endpoint.

Useful operations:

```bash
sudo systemctl status camo-clash-server.service
sudo journalctl -u camo-clash-server.service -n 200 --no-pager
sudo nginx -t
bash ./healthcheck.sh --hostname game-api.example.com
sudo certbot renew --dry-run
```

The match server must send WebSocket ping/heartbeat traffic more often than the
configured 75-second proxy timeout. Use a 20-30 second heartbeat and terminate
connections that stop returning pong frames.
