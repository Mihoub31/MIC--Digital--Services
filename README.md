# MIC Digital Services

Multilingual marketing site (Arabic / French / English) and local admin area for an Algerian digital services agency. The back office manages clients, requests and projects in SQLite, offers a local AI assistant through Ollama, and runs a read-only static security audit ("MIC Audit v3").

## Features

- Public site: six services, pricing, WhatsApp contact, AR / FR / EN switch with RTL support.
- Session-protected admin area: dashboard plus CRUD for clients, requests and projects.
- Local AI assistant (Ollama): technical questions without paid services or third-party data sharing.
- MIC Audit v3: evidence-based static analysis (file, line, excerpt), strict file allowlist, structured report, SQLite history (last 20 runs) and one-click report copy.
- Strictly read-only audit: no file modification, deletion, command execution or automatic fixes.

## Stack

- Node.js 24+ (tested on Node 26)
- Express 5, express-session + connect-sqlite3
- SQLite (better-sqlite3 in WAL mode)
- bcryptjs, helmet (strict CSP), express-rate-limit, dotenv
- Local Ollama (`qwen2.5-coder:0.5b` by default)
- Tests: Node's built-in test runner (`node:test`), no extra dependency

## Installation

```bash
npm install
```

On Windows without Visual Studio Build Tools, the native SQLite modules may fail to compile. Workaround:

```bash
npm install --ignore-scripts
npm rebuild sqlite3 --foreground-scripts
```

Both modules ship prebuilt N-API binaries, so no compilation is required that way.

## Configuration

Create a `.env` file at the repository root (never committed):

```ini
PORT=3000
NODE_ENV=development
SESSION_SECRET=<random string of at least 32 characters>
# Optional
HOST=127.0.0.1
MIC_DATA_DIR=./database
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:0.5b
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The WhatsApp number shown on the public site is configured in the `WHATSAPP_NUMBER` constant in `site.js`.

## Creating the administrator account

The script refuses to run if an account already exists. The password must be at least 12 characters long.

```bash
MIC_ADMIN_USERNAME=admin MIC_ADMIN_PASSWORD='strong-password' node scripts/create-admin.js
```

## Running

```bash
npm start   # http://127.0.0.1:3000
npm run dev # auto-reload
```

- Public site: `/`
- Admin login: `/admin/login`
- Health check: `/health`

For the local AI: `ollama serve`, then `ollama pull qwen2.5-coder:0.5b`. Without Ollama, the static audit still works and the AI recommendations section shows a fallback message.

## Tests

```bash
npm test
```

The suite starts real server instances on free ports and temporary SQLite databases (`MIC_DATA_DIR`), so real data is never touched. The 14 tests cover:

- startup, health, public site and CSP headers;
- externalized scripts and `/admin` protection;
- unauthenticated API access (401) and cross-origin requests (403);
- login, `HttpOnly` + `SameSite=Strict` cookie, logout;
- client / project CRUD and input validation;
- rejection of `.env` and paths outside the allowlist;
- full audit: contract, report sections, history, and identical SHA-256 hashes before/after (read-only proof);
- login rate limiting (429 after 10 attempts).

## Security

- Strict CSP (`script-src 'self'`), no inline scripts, `X-Frame-Options: DENY`.
- Loopback-only binding (`127.0.0.1`) by default; opt-in network exposure via `HOST`.
- Cross-origin API requests rejected on unsafe methods.
- SQLite sessions, `HttpOnly` cookie, `SameSite=Strict`, `secure` in production.
- Prepared SQL statements and static delete queries.
- Rate limiting: login 10/15 min, AI 10/15 min, agent/audit 20/15 min, API 100/15 min.
- No secrets in logs, responses or prompts; `.env`, databases and backups stay outside the audit scope.

## Structure

```
admin/            back-office pages and scripts
database/         schema and SQLite database (not versioned)
scripts/          administrator account creation
server/           Express server, AI agent, static audit engine
tests/            automated node:test suite
site.js           multilingual and WhatsApp logic for the public site
index.html        public landing page
```

## Known limitations

- Intended for local use; in production, put it behind HTTPS (reverse proxy).
- Single administrator account, no role management.
- AI advice depends on Ollama; it is advisory and does not replace human review.
- The browser UI is verified manually; the automated suite covers the API.

## License

ISC
