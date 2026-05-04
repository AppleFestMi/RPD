# Deployment Hardening

**Status:** Operational guide. Apply step-by-step on the production VPS.
**Last updated:** 2026-05-04
**Audience:** SystemAdmin / IT performing the production deploy.

---

## 1. Target environment

- **Host:** Single VPS, Debian 12 or Ubuntu 24.04 LTS, 2 vCPU / 4 GB RAM minimum, encrypted block storage.
- **Provider:** DigitalOcean, Hetzner, or Linode acceptable for MVP. Migrate to Azure / AWS when budget allows; the Docker Compose setup is portable.
- **Public surface:** ports 22 (SSH, key-only) and 443 (HTTPS via Caddy/Nginx). Port 80 redirects to 443. Postgres, the Next.js app, and any worker process are bound only to the internal Docker network.
- **DNS:** A record at the department's domain (e.g. `ops.richmondpd.example`). DNSSEC enabled if the registrar supports it.

---

## 2. Provision and OS hardening

Perform once, the day the VPS is provisioned.

### 2.1 First-boot

```bash
# Update everything
apt update && apt -y upgrade && apt -y autoremove

# Set timezone (UTC for logs; America/New_York for human readability — pick one and document)
timedatectl set-timezone UTC

# Hostname
hostnamectl set-hostname rpd-ops-prod
```

### 2.2 Non-root admin user

```bash
adduser --disabled-password --gecos "" rpdadmin
usermod -aG sudo rpdadmin
mkdir -p /home/rpdadmin/.ssh
# paste the admin's public SSH key
nano /home/rpdadmin/.ssh/authorized_keys
chmod 700 /home/rpdadmin/.ssh
chmod 600 /home/rpdadmin/.ssh/authorized_keys
chown -R rpdadmin:rpdadmin /home/rpdadmin/.ssh
```

### 2.3 SSH lockdown

Edit `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
UsePAM yes
PubkeyAuthentication yes
AllowUsers rpdadmin
LoginGraceTime 30
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 0
Protocol 2
```

Then:

```bash
systemctl restart ssh
# From a SECOND terminal, confirm you can still log in as rpdadmin via key.
# Only then close the original session.
```

### 2.4 Firewall (UFW)

```bash
apt -y install ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'ssh'
ufw allow 80/tcp  comment 'http (redirects to https)'
ufw allow 443/tcp comment 'https'
ufw enable
ufw status verbose
```

### 2.5 Automatic security updates

```bash
apt -y install unattended-upgrades apt-listchanges
dpkg-reconfigure --priority=low unattended-upgrades
# Verify /etc/apt/apt.conf.d/50unattended-upgrades has security origins enabled
# and Unattended-Upgrade::Automatic-Reboot "true";
# with a reboot window in low-traffic hours.
```

### 2.6 Intrusion prevention

```bash
apt -y install fail2ban
# Default jail.conf protects sshd. Enable nginx-bad-request / nginx-limit-req
# jails once the reverse proxy is in place if you switch from Caddy to Nginx.
systemctl enable --now fail2ban
fail2ban-client status
```

### 2.7 Time sync, audit, kernel

```bash
apt -y install chrony auditd
systemctl enable --now chrony auditd
# Optional but recommended: install Lynis and run a baseline audit.
apt -y install lynis
lynis audit system --quick
```

### 2.8 Disk encryption

If the provider's volume is not already encrypted at rest, set up LUKS on the data volume holding `/var/lib/docker` (and the database volume), and ensure the unlock key is stored in a secrets manager, not on the host.

---

## 3. Docker

### 3.1 Install

Use Docker's official APT repository (not the distro's outdated `docker.io`):

```bash
# Follow current docs at https://docs.docker.com/engine/install/debian/
# At time of writing:
apt -y install ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add admin to docker group (so they don't need sudo for compose)
usermod -aG docker rpdadmin
# Log out / log in for group change to take effect.
```

### 3.2 Daemon hardening

`/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true,
  "icc": false
}
```

Restart Docker after changes: `systemctl restart docker`.

### 3.3 Compose layout

The repository ships:

- `docker-compose.yml` — local development (app, db, mail catcher).
- `docker-compose.prod.yml` — production (app, db, caddy reverse proxy). No published Postgres port. Volumes named explicitly. Healthchecks declared.

Production deploy from the host:

```bash
# As rpdadmin
cd /srv/rpd-ops
git pull
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy
```

---

## 4. Reverse proxy (Caddy default)

Caddy provides automatic HTTPS via Let's Encrypt and trims the operator burden.

`Caddyfile`:

```
ops.richmondpd.example {
    encode gzip zstd
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
        Cross-Origin-Opener-Policy "same-origin"
        # CSP set by the application (see headers.ts) so the nonce can match.
    }
    reverse_proxy app:3000
}
```

Notes:

- The application sets a strict `Content-Security-Policy` with a per-request nonce; Caddy passes it through.
- HSTS preload is intentional. Confirm before enabling on a domain you do not control.
- For Nginx instead of Caddy, equivalent config is in `docs/examples/nginx.conf` (TBD).

---

## 5. Database

### 5.1 Postgres in Docker

- Postgres runs as a non-root user inside the container.
- The container exposes 5432 only to the internal Compose network. **No `ports:` mapping in the compose file.** It is reachable only by the app and from within the container itself for backups.
- Volume: a named Docker volume `pgdata`, on encrypted block storage.
- A separate `postgres` superuser is **not** the application's runtime user. The app connects as `rpdops` with rights only to its own database.

### 5.2 Initial setup

```sql
CREATE ROLE rpdops LOGIN PASSWORD '<from secrets>';
CREATE DATABASE rpdops OWNER rpdops;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO rpdops;
```

Migrations are applied with Prisma Migrate (`prisma migrate deploy`). Never edit the schema directly in production.

### 5.3 Backups

- Nightly logical dump:
  ```bash
  docker compose exec -T db pg_dump -U rpdops -F c rpdops > /var/backups/rpd/$(date -u +%FT%H%MZ).pgcustom
  age -r <recipient-pubkey> /var/backups/rpd/...pgcustom > .age
  ```
- Encrypted dumps shipped off-host (object storage with restricted IAM, or a second VPS).
- Retention: 30 daily, 12 monthly. Adjust per the department's record-retention policy.
- **Restore drill quarterly.** Stand up a temporary container, restore the latest dump, run a sanity-check query, audit-log the drill (event: `backup.restore.tested`), tear down. Document the run.

---

## 6. Application secrets

`.env.production` lives at `/srv/rpd-ops/.env.production`, owned by `root:rpdadmin`, mode `0640`.

Required variables (see `.env.example`):

```
NODE_ENV=production
NEXTAUTH_URL=https://ops.richmondpd.example
NEXTAUTH_SECRET=<32+ bytes, openssl rand -base64 48>
DATABASE_URL=postgresql://rpdops:<pw>@db:5432/rpdops?schema=public
MFA_ENCRYPTION_KEY=<32 bytes, openssl rand -base64 32>
SESSION_IDLE_MS=1800000
SESSION_ABSOLUTE_MS=43200000
RATE_LIMIT_AUTH_PER_MIN=10
LOG_LEVEL=info
```

Rotation cadence:

- `NEXTAUTH_SECRET`: every 12 months or on any suspected compromise. Rotation invalidates all sessions; users re-login. Audit-log the rotation.
- `MFA_ENCRYPTION_KEY`: rotation requires a re-encrypt step (envelope decryption + re-encryption of all `User.mfaSecret` rows). Plan a maintenance window.
- Database password: every 6–12 months; coordinate with the migration step.

---

## 7. Observability and logging

- Structured JSON logs from the app to stdout; Docker captures and rotates them.
- Optional log shipping: `vector` or `promtail` to a self-hosted log stack (Loki + Grafana on the same or another small VPS).
- Health endpoints:
  - `/api/health` — liveness (200 if process is up).
  - `/api/ready` — readiness (200 if DB reachable, migrations current).
- Caddy access logs to a separate file with rotation.
- Audit log lives in Postgres; it is **the** record of who did what, and is independent of OS logs.

---

## 8. Incident / compromise checklist

If you suspect a compromise:

1. Snapshot the VPS volume (provider snapshot or full disk image). Do not yet wipe.
2. Snapshot the database (`pg_dump` immediately).
3. Rotate `NEXTAUTH_SECRET` — invalidates all sessions.
4. Disable user accounts you suspect (`User.disabledAt`) and force password reset for everyone (`User.forcePasswordReset = true`).
5. Reset MFA for SystemAdmin / Admin accounts.
6. Pull the audit log for the suspected window: filter by IP, by user, by `permission.denied` and `login.failure`.
7. Review Caddy access logs and `fail2ban` status.
8. Update fail2ban rules and firewall as needed.
9. Notify per departmental policy. This document does not cover legal/PR.

If CJI was suspected to have been entered (it should not have been per [`DATA_BOUNDARIES.md`](DATA_BOUNDARIES.md)), this becomes a **CJIS incident** and follows the department's separate procedure — this app is just one input.

---

## 9. Day-2 maintenance

| Frequency | Task |
| --- | --- |
| Daily | Automated backups run; backup ship verified |
| Weekly | Review `fail2ban-client status`, top failed-login IPs in audit log |
| Monthly | Apply non-security upgrades; rebuild app image; redeploy in a low-traffic window |
| Quarterly | Restore drill; secrets review; user/role review (deactivate stale accounts) |
| Annually | Penetration test or external review (if budget); rotate `NEXTAUTH_SECRET`; review this document |

---

## 10. What this document does not do

- It does not replace the department's IT-security plan or county/state policy.
- It does not certify CJIS compliance — see [`SECURITY_MODEL.md`](SECURITY_MODEL.md).
- It does not cover application-feature configuration (those live in admin docs as the features land).

The deployment is deliberately small and boring: one VPS, one reverse proxy, one app, one database, one set of backups, one well-known set of operations. Resist accumulating moving parts.
