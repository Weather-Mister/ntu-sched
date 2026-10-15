# Campus Week

Campus Week's portable source lives in **Weather-Mister/ntu-sched**. Cloudflare Workers serves the frontend and API; D1 stores student accounts, encrypted connections, and revocable sessions. No ChatGPT Sites service, sign-in, storage, or build helper is required.

## Current stage

The current frontend was recovered byte-for-byte from the localhost app on 15 October 2026 (Taipei). It includes the timetable, English/Traditional Chinese controls, COOL feed UI, and fictional inbox/Gemini previews.

The account foundation verifies a student number and NTU Mail password against the same Roundcube endpoint used by the personal mail clients before provisioning an account. It encrypts retained NTU authorization using AES-GCM with account/provider-bound authenticated data. Only hashes of random session tokens enter D1; the browser receives a Secure, HttpOnly, SameSite login cookie valid for 30 days.

**Infrastructure:** The `ntu-sched` Worker serves `https://ntu-sched.s20gamingfake.workers.dev` using the existing `campus-week` D1 database and `ASSETS` binding in account `56ed116482d3c27b6980d1d13dff17c8`. GitHub pushes to `main` trigger Cloudflare deployments. On 15 October 2026 the owner confirmed that real NTU Mail verification and login persistence across refresh work.

**Timetable:** The Worker completes the fixed ePortfolio SSO1 flow at `https://web2.cc.ntu.edu.tw/p/s/login2/p1.php`, then reads the current weekly timetable from `https://portal.aca.ntu.edu.tw/eportfolio/course-overview`. This is the HTTP port of the original local importer, with an inert HTML parser instead of a browser. It performs one credential submission, bounds redirects and response sizes, scopes cookies to their domain/path, stops on verification challenges, and permits callback POSTs only to fixed SSO routes. It never evaluates provider scripts, returns private HTML, or exposes retained authorization.

The saved timetable and its authorization share an encrypted `timetable` connection record owned by the session student; no database migration is needed. The frontend renders that saved snapshot immediately after restoring the account. Initial sync tries the saved account password once; a different myNTU password can be entered through the timetable reconnect form. Mail authorization alone is never reported as a successful timetable connection.

Automatic timetable checks are due every **five days**. The hourly cron processes at most ten overdue connected accounts per run. Open, active pages also check when their snapshot becomes due. Every timetable has a manual refresh that bypasses the short duplicate-request cache. Failed reads preserve the prior snapshot; a rejected password or challenge pauses automatic attempts until reconnect. Manually selected demo/file timetables are not silently replaced on the current page. The first real hosted ePortfolio sync still requires owner verification; automated checks use provider fixtures.

**Upcoming COOL behavior:** Homework will use the owner's COOL calendar feed. Announcements should check once a minute while the site is open and active. Both will have manual refresh. These providers, the live inbox and Gemini calls are not implemented yet.

`NTU_LOGIN_ENABLED` is explicitly enabled in the deployment configuration; a missing or malformed encryption secret still disables account login. Demo login never creates a real account.

## Run checks

Use Node 24 or later:

```sh
npm ci
npm test
```

Tests use synthetic credentials, mocked NTU servers, SQLite, and an inert DOM. They cover account isolation, encryption, session restoration, CSRF/origin checks, throttling, cookie scoping, ePortfolio parsing, manual/automatic sync, preservation after provider failures, and late responses during account switches. They do not prove a real ePortfolio login. `npx wrangler deploy --dry-run` verifies the Worker bundle.

## Configure Cloudflare

Use the official Wrangler CLI and account `56ed116482d3c27b6980d1d13dff17c8`:

1. Run `wrangler login` without copying tokens into the repository or chat.
2. Reuse the existing `campus-week` database recorded in `wrangler.jsonc`; do not create a duplicate.
3. Run `wrangler d1 migrations apply DB --remote`.
4. Set `APP_ORIGIN` to the exact HTTPS origin serving both the frontend and `/api`. The GitHub repository owns source; the app is served by Cloudflare. Cross-site cookie authentication from a separate GitHub Pages origin is intentionally unsupported.
5. Generate a random 32-byte encryption key locally and set the 64-character hex value through `wrangler secret put NTU_CREDENTIAL_KEY`. Never store it in tracked files, logs, or frontend bundles. Retain the key in a password manager; changing it without migrating encrypted rows makes retained connections unreadable.
6. The existing Worker rebuilds from `main`. Verify the latest deployment's `/api/health`. Dashboard secrets belong under **Runtime variables and secrets**, not Build variables; adding the key only to GitHub Actions does not configure the running Worker.

Do not commit `.env`, `.dev.vars`, `.wrangler`, node_modules, local SQLite data, passwords, cookies, or tokens.

## API

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/health` | Current implementation stage; never claims live feeds |
| POST | `/api/auth/login` | Verify NTU Mail, provision/reuse the student account, retain encrypted authorization, issue cookie |
| GET | `/api/auth/me` | Restore the current account and CSRF nonce |
| GET | `/api/connections` | Current student's connection status; no credentials or other students' data |
| GET | `/api/timetable` | Current student's saved timetable and connection state |
| POST | `/api/timetable/sync` | Read ePortfolio using retained authorization or a supplied myNTU password; optional `force: true` for manual refresh |
| POST | `/api/auth/logout` | Revoke the current device session |
| POST | `/api/auth/logout-all` | Revoke the current student's device sessions |

JSON login accepts only `studentNumber` and `password`. Timetable sync accepts only optional `password` and `force`; it never accepts a student ID or upstream URL. Mutation requests require the same Origin as the app; logout and timetable sync additionally require `X-CSRF-Token`. Password fields are masked and cleared after submission. Never put authorization or session tokens in localStorage or URL parameters.

## Next stages

After verifying the hosted timetable flow, implement the COOL calendar/announcements behavior above, then port the personal sites' NTU Mail client with ownership derived exclusively from the session. Retain the same encrypted ownership boundaries and cached-data fallback for each provider.

