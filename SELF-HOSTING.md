# Self-hosting TournamentTracker

You can run TournamentTracker on your own server, homelab, or VPS so others (or just you) use your instance instead of you hosting a central service. Data stays on your machine.

## Requirements

- **Docker** (for Docker / Compose) or **Node.js 18+** (for manual)
- For production: a **strong `SESSION_SECRET`** (see below)

Storage is **in-memory** by default: data resets when the process restarts. A Postgres-backed storage layer can be added later for persistence.

---

## Option 1: Docker Compose (recommended)

One-command run: app + env in a single stack.

Note: the current Dockerfile copies `node_modules` from the build stage to avoid missing runtime deps. This keeps the image simple at the expense of size.

1. **Clone the repo**
   ```bash
   git clone https://github.com/YOUR_USER/TournamentTracker.git
   cd TournamentTracker
   ```

2. **Set a session secret** (required for production)

   Copy `env.example` to `.env` and set `SESSION_SECRET`, or create `.env` with:
   ```env
   SESSION_SECRET=your-long-random-secret-at-least-32-chars
   ```
   Generate one with:  
   `openssl rand -hex 32` (macOS/Linux) or  
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (Node)

3. **Build and run**
   ```bash
   docker compose up -d
   ```

   App is at **http://localhost:5000**. To bind another host port, edit `docker-compose.yml`:
   ```yaml
   ports:
     - "3000:5000"   # host:container
   ```

4. **View logs / stop**
   ```bash
   docker compose logs -f app
   docker compose down
   ```

---

## Option 2: Docker only

Build and run the image yourself:

```bash
# Build
docker build -t tournament-tracker .

# Run (replace the secret in production)
docker run -d -p 5000:5000 \
  -e SESSION_SECRET="your-long-random-secret" \
  --name tt \
  tournament-tracker
```

Open **http://localhost:5000**.

---

## Option 3: Manual (Node on a VPS / server)

For a VM, VPS, or bare metal without Docker:

1. **Clone and install**
   ```bash
   git clone https://github.com/YOUR_USER/TournamentTracker.git
   cd TournamentTracker
   npm ci
   ```

2. **Configure**
   Copy `env.example` to `.env` and set at least:
   ```env
   SESSION_SECRET=your-long-random-secret
   PORT=5000
   ```

3. **Build and run**
   ```bash
   npm run build
   npm run start
   ```
   On Windows PowerShell:  
   `$env:NODE_ENV="production"; $env:PORT="5000"; node dist/index.js`

4. **Run behind a reverse proxy (optional)**

   Put Nginx or Caddy in front and terminate TLS:

   **Caddy** (example, with `caddy reverse-proxy` or Caddyfile):
   ```
   your-domain.com {
     reverse_proxy localhost:5000
   }
   ```

   **Nginx** (example):
   ```nginx
   location / {
     proxy_pass http://127.0.0.1:5000;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

5. **Keep it running (e.g. systemd on Linux)**

   Create `/etc/systemd/system/tournament-tracker.service`:

   ```ini
   [Unit]
   Description=TournamentTracker
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/opt/TournamentTracker
   Environment=NODE_ENV=production
   EnvironmentFile=/opt/TournamentTracker/.env
   ExecStart=/usr/bin/node dist/index.js
   Restart=on-failure
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

   Then:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now tournament-tracker
   ```

---

## Environment variables

| Variable         | Required | Default              | Description |
|------------------|----------|----------------------|-------------|
| `SESSION_SECRET` | **Yes** in production | `local-dev-secret` | Secret for signing session cookies. Use a long random string. |
| `PORT`           | No       | `5000`               | Port the app listens on. |
| `REPL_ID`        | No       | —                    | Alternative to `SESSION_SECRET` (e.g. Replit). |
| `DATABASE_URL`   | No       | —                    | For future Postgres support; not used by current in-memory storage. |

---

## Testing betting with multiple accounts

To test betting as several users:

1. **Self-host** an instance (Docker or manual) on a machine you control.
2. **Register multiple accounts** (different browsers, incognito, or different devices) against that instance.
3. **Create a bracket** and share the link or access code so those accounts can join.
4. **Place bets** from each account on the active match, then advance the match and see payouts.

No special setup beyond running the app and creating users.

---

## Streaming and other integrations

Streaming (Twitch, YouTube, etc.) is **not yet built into the app**. The codebase doesn’t assume a central host; a self-hosted instance is a good place to add:

- Webhooks or API routes that streaming tools (OBS, StreamElements, etc.) can call.
- A small “stream overlay” or “bot” that talks to your instance’s API and displays bracket/bets on stream.

When you’re ready to integrate, you can add routes or a separate service that uses the same storage/API. The self-hosted setup doesn’t change that.

---

## Data and persistence

- **Current:** In-memory only. Restart = data reset.
- **Future:** The Drizzle schema and `drizzle.config.ts` are set up for Postgres. When a Postgres storage layer exists, you’d set `DATABASE_URL` and (optionally) add the Postgres service from the commented block in `docker-compose.yml`.

---

## Troubleshooting

- **“Port already in use”**  
  Change `PORT` or the host port in your `docker run` / Compose `ports` / systemd env.

- **Sessions reset or “logged out” after a while**  
  With in-memory storage, sessions live in the process. Restart clears them. For longer-lived sessions and multi-instance, a Postgres (or Redis) session store would need to be wired in.

- **Docker build fails (e.g. Replit plugins)**  
  If `vite build` fails due to `@replit/*` plugins, you can temporarily remove or make them conditional in `vite.config.ts` for the self-hosted build, then restore for Replit.

- **HTTPS**  
  Use a reverse proxy (Caddy, Nginx, Traefik) in front of the app to handle TLS. The app itself listens on HTTP.
