# Deploying UTTT

How to run the site on a server: Docker runs four small services (the site, continuous backups, a restore
step, and a Cloudflare Tunnel). The tunnel means no ports are opened on the server: Cloudflare serves
`https://uttt.org` and forwards visitors through an outgoing connection the server makes.

Everything the site knows lives in one SQLite database, `deploy/data/uttt.db`, streamed continuously to
Cloudflare R2. Moving to another server is: set up the new one with these steps, and on first start it
restores the latest backup.

You need: the server (Ubuntu 24.04, reachable over SSH), the `uttt.org` domain on Cloudflare, and access to the
GitHub repository. To host from your own computer instead, see [On your own computer](#on-your-own-computer).

## 1. Connect and secure the server

The site runs on a netcup VPS (Nuremberg) as the user `uttt`. Many providers, netcup included, hand over a
server that logs in as `root` with a password. Put your key on it once (`ssh-copy-id root@SERVER_IP`), then:

```sh
ssh root@SERVER_IP
apt update && apt upgrade -y
adduser --disabled-password --gecos "" uttt
echo "uttt ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/uttt && chmod 440 /etc/sudoers.d/uttt
install -d -m 700 -o uttt -g uttt /home/uttt/.ssh
install -m 600 -o uttt -g uttt /root/.ssh/authorized_keys /home/uttt/.ssh/
```

Check that `ssh uttt@SERVER_IP` works, then allow keys only, no root, and only SSH through the firewall
(the tunnel connects outward, so the site needs no open port):

```sh
printf 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n' \
  | sudo tee /etc/ssh/sshd_config.d/00-uttt.conf && sudo sshd -t && sudo systemctl reload ssh
sudo ufw allow OpenSSH && sudo ufw --force enable
```

Ubuntu installs security updates automatically (`unattended-upgrades`); nothing to do there.

## 2. Install Docker

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker uttt
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
   `uttt-backups` only. Copy the **Access Key ID**, **Secret Access Key**, and the **EU** endpoint
   (`https://<account-id>.eu.r2.cloudflarestorage.com`; an EU bucket isn't reachable at the other one).
   The secret is shown once.

## 5. Create the tunnel (Cloudflare Zero Trust)

In the Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel**:

1. Type **Cloudflared**, name it `uttt`.
2. On the install page, copy the **token**: the long string after `--token` in any of the commands.
   Don't run those commands; Docker runs the tunnel.
3. **Public hostname**: domain `uttt.org` (leave subdomain empty), service type **HTTP**, URL `app:3000`.
   Save.

## 6. Create the bot check (Cloudflare Turnstile)

In the Cloudflare dashboard → **Turnstile → Add widget**: name it `uttt`, add the hostname `uttt.org`,
widget mode **Managed**, and create it. Copy the **Site Key** and the **Secret Key**.

## 7. Configure

```sh
cd ~/uttt/deploy
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in the tunnel token, the two Turnstile keys, and the backup values. Save with Ctrl+O, Enter, then exit with Ctrl+X.
(If `nano` is missing, as on some providers' images, install it with `sudo apt install nano`.)
Then create the data folder, owned by the user the site runs as:

```sh
mkdir data && sudo chown 1000:1000 data
```

## 8. Start

```sh
docker compose up -d --build
```

The first build takes a few minutes. Then:

- `docker compose ps`: `app`, `backup`, and `tunnel` should be **running** (`app` also **healthy**),
  and `restore` **exited (0)** (so does `house-bot` until step 10).
- Open **https://uttt.org**.
- `docker compose logs backup`: after a minute it should mention a snapshot.

In the Cloudflare dashboard for `uttt.org` → **SSL/TLS → Edge Certificates**, turn on
**Always Use HTTPS**.

## 9. Privacy contact address

The privacy page lists `privacy@uttt.org`. Forward it to your own inbox for free: in the Cloudflare
dashboard for `uttt.org` → **Email → Email Routing**, enable it (it adds the DNS records), then
**Routing rules → Create address**: `privacy` → your personal email. Confirm the verification email
Cloudflare sends to your inbox.

## On your own computer

For tests, your own computer (Fedora) can host the site. The tunnel opens no ports and hides your home
address, and the site runs in containers, without access to your files. It's online only while the
computer is on and the site is started. Accounts and games carry over to a server later through the
backups (see [Restoring or moving](#restoring-or-moving)).

Do steps 4–6 (backups, tunnel, and bot check). Then, once, install what lets this guide's
`docker compose` commands run on Podman, Fedora's built-in container tool:

```sh
sudo dnf install docker-compose podman-docker
sudo touch /etc/containers/nodocker
systemctl --user enable --now podman.socket
```

(`nodocker` silences a notice the `docker` command would otherwise print every time.)

Do step 7 in the project's `deploy` folder, but create the data folder with:

```sh
mkdir data && podman unshare chown 1000:1000 data
```

Podman runs containers without root, so the site's user (1000) maps to a different user on your
computer; `podman unshare` sets the owner as the containers see it. Use it the same way for anything
else in `data`, e.g. `podman unshare rm -rf data` to delete it.

Start the site with `docker compose up -d --build` (step 8) and stop it with `docker compose down`. It
doesn't start again by itself after a reboot.

## 10. House bot (optional)

The house bot waits in every bot pool, so a newly written bot finds a game at once, and people can
challenge it from the leaderboard's Bots tab. It plays with the site's engine, on at most one CPU core.

1. Give it an email address, e.g. another routing rule as in step 9 (`housebot` → your inbox).
2. Sign up an account for it on the site (its name is what players see), and confirm the email.
3. In **Settings → Bot account**, turn it into a bot, then create an **API token**.
4. Put the token in `.env` as `HOUSE_BOT_TOKEN=uttt_...` and run `docker compose up -d`.

`docker compose logs house-bot` shows what it refuses, if anything; the leaderboard's Bots tab shows it
online. Without a token, the `house-bot` service exits at once and stays off.

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

To check backups work, or to move to a new server: set up the new server with steps 1–7, but don't
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
- **Permission errors about `/data`:** run `sudo chown -R 1000:1000 data` in `~/uttt/deploy`
  (on your own computer: `podman unshare chown -R 1000:1000 data`).
