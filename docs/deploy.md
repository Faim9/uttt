# Deploying UTTT

How to run the site on a server: Docker runs four small services (the site, continuous backups, a restore
step, and a Cloudflare Tunnel). The tunnel means no ports are opened on the server: Cloudflare serves
`https://uttt.org` and forwards visitors through an outgoing connection the server makes.

Everything the site knows lives in one SQLite database, `deploy/data/uttt.db`, streamed continuously to
Cloudflare R2. Moving to another server is: set up the new one with these steps, and on first start it
restores the latest backup.

You need: the server (Ubuntu, reachable over SSH), the `uttt.org` domain on Cloudflare, and access to the
GitHub repository.

## 1. Connect and update the server

```sh
ssh -i path/to/private-key ubuntu@SERVER_IP
sudo apt update && sudo apt upgrade -y
```

Ubuntu installs security updates automatically (`unattended-upgrades`); nothing to do there.

## 2. Install Docker

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

Log in again (`ssh ...`) so the group change applies, then check: `docker run --rm hello-world`.

## 3. Get the code

The repository is private, so the server gets its own read-only key:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/uttt_deploy -N ""
cat ~/.ssh/uttt_deploy.pub
```

On GitHub: the repository → **Settings → Deploy keys → Add deploy key**, paste that line, leave
"Allow write access" off. Then on the server:

```sh
printf 'Host github.com\n  IdentityFile ~/.ssh/uttt_deploy\n' >> ~/.ssh/config
git clone git@github.com:YOUR_GITHUB_NAME/uttt.git ~/uttt
```

## 4. Create the backup bucket (Cloudflare R2)

In the Cloudflare dashboard → **R2 Object Storage** (it may ask for a payment method; the free tier
covers 10 GB, far more than needed):

1. **Create bucket** named `uttt-backups`. Under location, choose the **EU** jurisdiction.
2. **Manage API tokens → Create API token**: permission **Object Read & Write**, applied to
   `uttt-backups` only. Copy the **Access Key ID**, **Secret Access Key**, and the **endpoint** URL
   (`https://<account-id>.r2.cloudflarestorage.com`). The secret is shown once.

## 5. Create the tunnel (Cloudflare Zero Trust)

In the Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel**:

1. Type **Cloudflared**, name it `uttt`.
2. On the install page, copy the **token**: the long string after `--token` in any of the commands.
   Don't run those commands; Docker runs the tunnel.
3. **Public hostname**: domain `uttt.org` (leave subdomain empty), service type **HTTP**, URL `app:3000`.
   Save.

## 6. Configure

```sh
cd ~/uttt/deploy
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in the tunnel token and the four backup values. Save with Ctrl+O, Enter, then exit with Ctrl+X.
Then create the data folder, owned by the user the site runs as:

```sh
mkdir data && sudo chown 1000:1000 data
```

## 7. Start

```sh
docker compose up -d --build
```

The first build takes a few minutes. Then:

- `docker compose ps`: `app`, `backup`, and `tunnel` should be **running** (`app` also **healthy**),
  and `restore` **exited (0)**.
- Open **https://uttt.org**.
- `docker compose logs backup`: after a minute it should mention a snapshot.

In the Cloudflare dashboard for `uttt.org` → **SSL/TLS → Edge Certificates**, turn on
**Always Use HTTPS**.

## 8. Privacy contact address

The privacy page lists `privacy@uttt.org`. Forward it to your own inbox for free: in the Cloudflare
dashboard for `uttt.org` → **Email → Email Routing**, enable it (it adds the DNS records), then
**Routing rules → Create address**: `privacy` → your personal email. Confirm the verification email
Cloudflare sends to your inbox.

## Everyday tasks

**Update to the latest code:**

```sh
cd ~/uttt && git pull && cd deploy && docker compose up -d --build
```

**See what's happening:** `docker compose logs -f app` (Ctrl+C to stop watching).

**Restart everything:** `docker compose restart`. The site comes back by itself after a crash or a
server reboot.

**Turn on email** (once a provider is chosen): set `SMTP_URL` and `MAIL_FROM` in `.env`, then
`docker compose up -d`. Until then, verification and reset emails only appear in the app's logs.

## Restoring or moving

To check backups work, or to move to a new server: set up the new server with steps 1–6, but don't
copy `deploy/data`. On `docker compose up`, the `restore` step finds no database and downloads the
latest backup. Stop the old server first (`docker compose down`), so both don't write backups at once.
If the new server has a different tunnel, update the public hostname; with the same tunnel token,
nothing changes for visitors.

## If something goes wrong

- **The site doesn't load:** `docker compose ps` and `docker compose logs tunnel`. A wrong token shows
  up there.
- **"Cross-origin request blocked" when signing in:** `PUBLIC_URL` in `.env` must be exactly the
  address in the browser (`https://uttt.org`, no trailing slash).
- **`app` keeps restarting:** `docker compose logs app` shows why; a missing `PUBLIC_URL` stops it on
  purpose.
- **Permission errors about `/data`:** run `sudo chown -R 1000:1000 data` in `~/uttt/deploy`.
