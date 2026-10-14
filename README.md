# Campus Week

Campus Week's portable source lives in **Weather-Mister/ntu-sched**. Cloudflare Workers serves the frontend and API; D1 stores student accounts, encrypted connections, and revocable sessions. No ChatGPT Sites service, sign-in, storage, or build helper is required.

## Current stage

The current frontend was recovered byte-for-byte from the localhost app on 15 October 2026 (Taipei). It includes the timetable, English/Traditional Chinese controls, COOL feed UI, and fictional inbox/Gemini previews.

The account foundation verifies a student number and NTU Mail password against the same Roundcube endpoint used by the personal mail clients before provisioning an account. It encrypts retained NTU authorization using AES-GCM with account/provider-bound authenticated data. Only hashes of random session tokens enter D1; the browser receives a Secure, HttpOnly, SameSite login cookie valid for 30 days.

**Infrastructure:** Cloudflare D1 database `campus-week` is created in account `56ed116482d3c27b6980d1d13dff17c8`, with Asia Pacific placement and all four account tables verified. Its actual ID is recorded in `wrangler.jsonc`. The `ntu-sched` Worker is deployed with both `ASSETS` and `DB` bindings and is connected to this GitHub repository. Its canonical address is `https://ntu-sched.s20gamingfake.workers.dev`. The account-origin correction is committed; encryption-secret setup and a real NTU sign-in test remain before student login is enabled. COOL and academic timetable providers, recurring live refresh, the real mail client, and Gemini calls are later stages. Mail authorization does not imply COOL or academic-system authorization. Existing localhost login/import frontend files are preserved; their original local trial server was not available in this checkout.

`NTU_LOGIN_ENABLED` defaults to `false`. There is no fallback that creates real accounts through a demo login.

## Run checks

Use Node 24 or later:

```sh
npm test
```

The tests use synthetic credentials, a mocked NTU server, and SQLite to exercise D1 queries. They cover account isolation, encryption, session restoration, expired/invented tokens, CSRF/origin checks, logout, request size limits, throttling, and provider failures. They do not prove live NTU/Cloudflare connectivity.

## Configure Cloudflare

Use the official Wrangler CLI and account `56ed116482d3c27b6980d1d13dff17c8`:

1. Run `wrangler login` without copying tokens into the repository or chat.
2. Reuse the existing `campus-week` database recorded in `wrangler.jsonc`; do not create a duplicate.
3. Run `wrangler d1 migrations apply DB --remote`.
4. Set `APP_ORIGIN` to the exact HTTPS origin serving both the frontend and `/api`. The GitHub repository owns source; the app is served by Cloudflare. Cross-site cookie authentication from a separate GitHub Pages origin is intentionally unsupported.
5. Generate a random 32-byte encryption key locally and set the 64-character hex value through `wrangler secret put NTU_CREDENTIAL_KEY`. Never store it in tracked files, logs, or frontend bundles. Retain the key in a password manager; changing it without migrating encrypted rows makes retained connections unreadable.
6. The existing Worker is connected to the repository and rebuilds from `main`. Verify the latest deployment's `/api/health` and the empty database. After setting the encryption secret, enable `NTU_LOGIN_ENABLED=true` in the tracked configuration for a controlled real sign-in test before inviting students.

Do not commit `.env`, `.dev.vars`, `.wrangler`, node_modules, local SQLite data, passwords, cookies, or tokens.

## API

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/health` | Current implementation stage; never claims live feeds |
| POST | `/api/auth/login` | Verify NTU Mail, provision/reuse the student account, retain encrypted authorization, issue cookie |
| GET | `/api/auth/me` | Restore the current account and CSRF nonce |
| GET | `/api/connections` | Current student's connection status; no credentials or other students' data |
| POST | `/api/auth/logout` | Revoke the current device session |
| POST | `/api/auth/logout-all` | Revoke the current student's device sessions |

JSON login accepts only `studentNumber` and `password`. Mutation requests require the same Origin as the app; logout additionally requires `X-CSRF-Token`. Frontend passwords must use `type=password` and be cleared immediately after submission. Never put authorization or session tokens in localStorage or URL parameters.

## Next stages

The current layout now restores accounts and calls the protected account API when the Worker serves it; the local trial branch remains preserved separately in the same module. Next validate and port the local COOL/ePortfolio data connectors, add bounded refresh with immediate cached rendering and explicit last-synced/reconnect state, and port the personal sites' NTU Mail client with ownership derived exclusively from the authenticated session. Imports remain explicit snapshots until a verified upstream connector replaces them.
