# Campus Week

Campus Week's portable source lives in **Weather-Mister/ntu-sched**. Cloudflare Workers serves the frontend and API; D1 stores student accounts, encrypted connections, and revocable sessions. No ChatGPT Sites service, sign-in, storage, or build helper is required.

## Current stage

The current frontend was recovered byte-for-byte from the localhost app on 15 October 2026 (Taipei). It includes the timetable, English/Traditional Chinese controls, COOL feed UI, and fictional inbox/Gemini previews.

The account foundation verifies a student number and NTU Mail password against the same Roundcube endpoint used by the personal mail clients before provisioning an account. It encrypts retained NTU authorization using AES-GCM with account/provider-bound authenticated data. Only hashes of random session tokens enter D1; the browser receives a Secure, HttpOnly, SameSite login cookie valid for 30 days.

**Not yet live:** the Cloudflare database binding, deployment address, and encryption secret still need configuration; real NTU verification needs an end-to-end deployment test. COOL and academic timetable providers, recurring live refresh, the real mail client, and Gemini calls are later stages. Mail authorization does not imply COOL or academic-system authorization. Existing localhost login/import frontend files are preserved; their original local trial server was not available in this checkout.

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
2. Run `wrangler d1 create campus-week` and copy its actual database ID into `wrangler.jsonc`.
3. Run `wrangler d1 migrations apply DB --remote`.
4. Set `APP_ORIGIN` to the exact HTTPS origin serving both the frontend and `/api`. The GitHub repository owns source; the app is served by Cloudflare. Cross-site cookie authentication from a separate GitHub Pages origin is intentionally unsupported.
5. Generate a random 32-byte encryption key locally and set the 64-character hex value through `wrangler secret put NTU_CREDENTIAL_KEY`. Never store it in tracked files, logs, or frontend bundles. Retain the key in a password manager; changing it without migrating encrypted rows makes retained connections unreadable.
6. Run `wrangler deploy`. Verify `/api/health` and the empty database, then enable `NTU_LOGIN_ENABLED=true` for a controlled real sign-in test before inviting students.

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

Connect the recovered frontend to account restoration and login. Then validate and port the local COOL/ePortfolio data connectors, add bounded refresh with immediate cached rendering and explicit last-synced/reconnect state, and port the personal sites' NTU Mail client with ownership derived exclusively from the authenticated session. Imports remain explicit snapshots until a verified upstream connector replaces them.
