# Running TournamentTracker locally

This project is a single Node + Vite dev workflow: the Express server runs on port **5000** and serves the React app in development.

## Prerequisites

- **Node.js**: 18+ recommended (20+ is great)
- **npm**: comes with Node

## Quick start (development)

From the repo root:

```bash
npm install
npm run dev
```

Then open:

- `http://localhost:5000`

## Environment variables

The app will run without any env vars for local demo usage.

Optional:

- **`SESSION_SECRET`**: session signing secret (recommended for any non-local run). Falls back to `REPL_ID`, then `local-dev-secret`.
- **`REPL_ID`**: alternative to `SESSION_SECRET` (e.g. on Replit).
- **`PORT`**: port to listen on (default `5000`).

Database-related (only required if you want to use Drizzle migrations):

- **`DATABASE_URL`**: Postgres connection string used by `drizzle-kit` (not required to boot the app with the current in-memory storage)

### Using a `.env` file

Create a file named `.env` in the repo root:

```env
# Optional
REPL_ID=some-long-random-secret

# Optional for self-hosted / production
SESSION_SECRET=your-long-random-secret
PORT=5000

# Only needed for drizzle-kit commands
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME
```

## Type-checking

```bash
npm run check
```

## Production build

Builds both the client and the server bundle into `dist/`:

```bash
npm run build
```

### Run production build

On macOS/Linux:

```bash
npm run start
```

On Windows PowerShell (equivalent of the `start` script’s `NODE_ENV=production`):

```powershell
$env:NODE_ENV="production"; node dist/index.js
```

On Windows CMD:

```bat
set NODE_ENV=production&& node dist\index.js
```

## Database (optional)

The project includes a Drizzle config + schema for Postgres. If you want to push schema changes to your database:

1. Set `DATABASE_URL` (env var or `.env`)
2. Run:

```bash
npm run db:push
```

## Common issues

- **Port 5000 already in use**
  - Stop the other process using port 5000, then rerun `npm run dev`.
  - The server already retries if the port is temporarily busy.
- **State resets after restart**
  - This is expected right now because storage is in-memory (`server/storage.ts`).

