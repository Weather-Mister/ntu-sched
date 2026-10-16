# Campus Week

Campus Week's portable source lives in **Weather-Mister/ntu-sched**. Cloudflare Workers serves the frontend and API; D1 stores student accounts, encrypted connections, and revocable sessions. No ChatGPT Sites service, sign-in, storage, or build helper is required.

## Current stage

The current frontend was recovered byte-for-byte from the localhost app on 15 October 2026 (Taipei). It includes the timetable, English/Traditional Chinese controls, COOL feed UI, and fictional inbox/Gemini previews.

The account foundation verifies a student number and NTU Mail password against the same Roundcube endpoint used by the personal mail clients before provisioning an account. It encrypts retained NTU authorization using AES-GCM with account/provider-bound authenticated data. Only hashes of random session tokens enter D1; the browser receives a Secure, HttpOnly, SameSite login cookie valid for 30 days.

**Infrastructure:** The `ntu-sched` Worker serves `https://ntu-sched.s20gamingfake.workers.dev` using the existing `campus-week` D1 database and `ASSETS` binding in account `56ed116482d3c27b6980d1d13dff17c8`. GitHub pushes to `main` trigger Cloudflare deployments. On 15 October 2026 the owner confirmed that real NTU Mail verification and login persistence across refresh work.

**Timetable:** The Worker completes the fixed ePortfolio SSO1 flow at `https://web2.cc.ntu.edu.tw/p/s/login2/p1.php`, then reads the current weekly timetable from `https://portal.aca.ntu.edu.tw/eportfolio/course-overview`. This is the HTTP port of the original local importer, with an inert HTML parser instead of a browser. It performs one credential submission, bounds redirects and response sizes, scopes cookies to their domain/path, stops on verification challenges, and permits callback POSTs only to fixed SSO routes. It never evaluates provider scripts, returns private HTML, or exposes retained authorization.

The saved timetable and its authorization share an encrypted `timetable` connection record owned by the session student; no database migration is needed. The frontend renders that saved snapshot immediately after restoring the account. Initial sync tries the saved account password once; a different myNTU password can be entered through the timetable reconnect form. Mail authorization alone is never reported as a successful timetable connection.

Lesson names retain both official ePortfolio language views. The NTU globe uses a `lang=en` or `lang=zh` cookie and reloads the same course-overview URL; the HTTP importer reproduces that preference only for this read, within the existing authenticated sync. Names are paired by unique meeting time and course/room identity. A failed alternate-language read preserves the successful original timetable. Existing snapshots gain the names after **Sync timetable**, and the skeleton's EN/中文 controls then switch them immediately.

Automatic timetable checks are due every **five days**. The hourly cron processes at most ten overdue connected accounts per run. Open, active pages also check when their snapshot becomes due. Every timetable has a manual refresh that bypasses the short duplicate-request cache. Failed reads preserve the prior snapshot; a rejected password or challenge pauses automatic attempts until reconnect. Manually selected demo/file timetables are not silently replaced on the current page. On 15 October 2026 the owner confirmed the hosted timetable works after accepting the successful SSO landing at `/eportfolio/basic-info`. Automated checks use provider fixtures.

**Personal class details (skeleton):** Click an imported class in Day or Week view to edit its name for the current interface language, plus a shared room and description. Stable internal course IDs group the original NTU course code (or original native title when no code is supplied) within its reported semester, independent of meeting time, room or display overrides. Every meeting and Up Next uses the same account-owned override. Restore original details resets both language names and shared fields. Timetable times remain imported from NTU; personal events retain their separate editor.

Edits are stored in the existing encrypted student-owned timetable connection with per-course versions. No migration is needed. Original source fields stay intact; importer and override writes merge with compare-and-swap so a concurrent NTU refresh cannot erase edits. A stale device gets a conflict and retains its draft. Preview edits stay in memory and clear when leaving preview. Other students never receive these records.

**COOL homework:** The first connection automatically signs in through COOL's fixed SAML/ADFS flow using the owner's retained myNTU authorization (falling back to retained NTU Mail authorization when no timetable connection exists). Only the recognized ADFS credential form and COOL SAML callback can receive POSTs. An authenticated `/api/v1/users/self/profile` read verifies `login_id` against the session's student number before `/calendar` supplies the personal iCal link. No link copying or user-supplied upstream URL is required. A different myNTU password can be entered through Reconnect COOL.

The personal feed link and last successful homework snapshot are encrypted in the existing owner/provider-bound `cool` record. The link, provider cookies and assertions never enter API responses or frontend storage. Subsequent refreshes read the calendar without another login; a revoked feed can be rediscovered once. Failed reads retain saved homework, while rejected credentials or a verification challenge pause automatic sign-in until reconnect. The connector makes at most three actual credential submissions and twelve calendar checks per ten-minute account window.

Calendar parsing uses pinned `ical.js`, supports folded/escaped text, UTC/Taipei/timezone definitions, all-day deadlines, duplicate revisions and cancellations. Dated assignment and calendar events both appear, labeled separately; calendar events use their start time rather than an invented assignment deadline. Numeric COOL event links are preserved without arbitrary query parameters. Recurring events produce a warning, unreadable assignment deadlines fail without replacing the snapshot, and an empty valid feed removes deleted homework. The UI shows upcoming due dates in Taipei, with course/search filters; it does not infer submission status. Calendar changes depend on what COOL publishes.

Each new page opening shows saved homework immediately and fetches the upstream calendar once, even when the saved snapshot is fresh. Hidden/offline openings defer that fetch until visible/online. Further checks run every **five minutes** while visible, with manual refresh. The existing hourly cron checks up to ten connected accounts whose calendar snapshot is at least an hour old. Account switches clear the previous owner's homework and ignore late responses.

**COOL announcements (skeleton):** The Announcements tab reads published announcements from active enrolled courses for the last 90 days using the separate authenticated Canvas API. It restores the encrypted saved feed immediately, checks upstream on every page/account opening, then every **two minutes** only while the page is visible, focused and online. Hidden/offline openings defer the initial check until active. The COOL refresh button refreshes the selected tab; the Settings COOL sync and page refresh buttons also refresh announcements. Cards show course, title, author, Taipei posting time, expandable plain-text content and a direct COOL link. Provider HTML never executes in the app.

The announcement snapshot and COOL-only provider cookies are encrypted in the existing student-owned `cool` record; no migration or new secrets are required. Provider sessions are reused; an expired session can reconnect once using the saved NTU authorization, with existing credential limits. Transient errors keep saved announcements, throttle responses respect retry timing, and rejected passwords pause automatic attempts. Calendar and announcement writes use compare-and-swap merges so concurrent updates cannot erase each other. No background announcement polling runs while the site is closed. Campus Mail and the optional Gemini translation endpoint are implemented.

`NTU_LOGIN_ENABLED` is explicitly enabled in the deployment configuration; a missing or malformed encryption secret still disables account login. Demo login never creates a real account.

## Run checks

**Exam syllabus lab:** Open `/exams-lab` (Cloudflare also accepts `/exams-lab.html`) and choose an imported lesson. `/api/exams/resolve` searches the public NTU catalog in the timetable's semester, compares exact names/codes and all meeting periods, and fetches the matching syllabus. Imported offering IDs or a recent account-owned COOL course link provide stronger evidence; multiple sections still require a teacher/section choice. Shared COOL links cannot disambiguate multiple sections. A unique timetable match is explicitly labelled as an inference, and a manual selection remains labelled student-selected. Advanced lookup retains the restricted official URL preview.

The preview includes the full weekly plan and exam entries. Week-only plans stay week-only, dated schedule rows remain tentative, evaluation percentages are excluded, and final projects do not become final exams. No grade page is fetched and no exam date or course selection is persisted. The endpoint derives ownership from the existing session, limits lookups per student, never forwards authorization to the public catalog, rejects redirects and oversized responses, and uses no shared student-data cache. Hidden tabs clear their results and account changes invalidate in-flight responses. The lab currently previews results; it does not add exams to the calendar.

When a matched public syllabus contains no exam entries, the lab automatically tries `POST /api/exams/cool-preview` with the existing account session and CSRF nonce. The server resolves the same offering through the public catalog, verifies that its linked COOL ID is in this student's active course list, then reads only its syllabus body and module/item titles. It does not request scores, grades, submissions, linked files or individual content pages. COOL results have a separate source link; `Week 10 / Midterm 2` remains week-only and module unlock times never become exam dates. The existing encrypted COOL session may be reused/refreshed once through retained NTU authorization under the shared login limit; only provider cookies are retained, not syllabus content. A failed/revoked connection leaves the public result visible and asks for reconnection instead of repeatedly logging in.

Use Node 24 or later:

```sh
npm ci
npm test
```

Tests use synthetic credentials, mocked NTU servers, SQLite, and an inert DOM. They cover account isolation, encryption, session restoration, CSRF/origin checks, throttling, cookie scoping, ePortfolio parsing, manual/automatic sync, preservation after provider failures, and late responses during account switches. Calendar checks additionally cover automatic discovery, SAML callback restrictions, identity matching, deadline revisions, revocation, timezone handling, foreground checks and saved-data fallback. These synthetic tests do not prove a real COOL login. `npx wrangler deploy --dry-run` verifies the Worker bundle.

## Configure Cloudflare

Branch previews intentionally expose static UI only: the `previews` configuration disables sign-in and binds no production database. Authenticated integrations are tested with fixtures and verified on the production origin after the checked merge.

Use the official Wrangler CLI and account `56ed116482d3c27b6980d1d13dff17c8`:

1. Run `wrangler login` without copying tokens into the repository or chat.
2. Reuse the existing `campus-week` database recorded in `wrangler.jsonc`; do not create a duplicate.
3. Run `wrangler d1 migrations apply DB --remote`.
4. Set `APP_ORIGIN` to the exact HTTPS origin serving both the frontend and `/api`. The GitHub repository owns source; the app is served by Cloudflare. Cross-site cookie authentication from a separate GitHub Pages origin is intentionally unsupported.
5. Generate a random 32-byte encryption key locally and set the 64-character hex value through `wrangler secret put NTU_CREDENTIAL_KEY`. Never store it in tracked files, logs, or frontend bundles. Retain the key in a password manager; changing it without migrating encrypted rows makes retained connections unreadable.
6. The existing Worker rebuilds from `main`. Verify the latest deployment's `/api/health`. Dashboard secrets belong under **Runtime variables and secrets**, not Build variables; adding the key only to GitHub Actions does not configure the running Worker.

Do not commit `.env`, `.dev.vars`, `.wrangler`, node_modules, local SQLite data, passwords, cookies, or tokens.

## API

**Personal schedule events:** Add one-time events on a specific date or weekly events on any selected weekdays, with an optional inclusive end date. Each event has an editable name, optional location/notes, and start/end times in Taipei time. Weekly edits apply to the entire series. Personal entries join imported classes in the day list, weekday counts, week grid, overlap display, and Up Next without altering imported timetable data. Tap a personal entry to edit or remove it; removal offers Undo. Events belong to the authenticated student account and persist across devices. Fictional profiles keep only in-memory preview events.

Apply `migrations/0003_custom_events.sql` before deploying this release; it adds only `custom_events` and its owner lookup index. Event writes use the same session, CSRF, acknowledged-save, retry identity, version, and account-switch protections as manual tasks. Up to 500 active event definitions are supported per account; recurring occurrences are expanded only for the displayed dates, rather than stored as separate rows.

**Manual tasks:** Each student's tasks are stored in D1 under the permanent account ID associated with their normalized student number. The authenticated session supplies ownership for every read and mutation; clients cannot choose another student. Tasks retain their text and completion state across sign-ins and devices. The skeleton reloads them on account entry, manual refresh, and every 30 seconds while visible and online. Preview profiles continue to use fictional in-memory tasks.

Apply `migrations/0002_manual_tasks.sql` to the existing database **before** deploying this release. This additive migration creates only the task table and index. It does not change students, sessions, connections, or timetable data. The API accepts up to 500 active tasks per account, each 140 characters. Create UUIDs make retries idempotent; version checks prevent stale devices from overwriting newer changes. Remove is a soft delete, and the latest removal offers Undo in the interface. Unsaved input survives a failed save; failures preserve the last acknowledged list. Switching accounts clears tasks, undo state, drafts and pending responses before loading the next account.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/health` | Current implementation stage; never claims live feeds |
| POST | `/api/auth/login` | Verify NTU Mail, provision/reuse the student account, retain encrypted authorization, issue cookie |
| GET | `/api/auth/me` | Restore the current account and CSRF nonce |
| GET | `/api/connections` | Current student's connection status; no credentials or other students' data |
| GET | `/api/tasks` | Current student's saved active tasks |
| GET | `/api/events` | Current student's saved custom event definitions |
| POST | `/api/events` | Create an event with a retry-safe UUID and its schedule fields |
| PATCH | `/api/events/:id` | Edit an owned event using its version, or restore a removed event |
| DELETE | `/api/events/:id` | Soft remove an owned event using its version |
| POST | `/api/tasks` | Create a task with `{id, text}`; retry the same UUID safely |
| PATCH | `/api/tasks/:id` | Save `{version, done}` or undo removal with `{version, deleted: false}` |
| DELETE | `/api/tasks/:id` | Soft remove an owned task using `{version}` |
| GET | `/api/timetable` | Current student's saved timetable and connection state |
| PATCH | `/api/timetable/courses/:id` | Edit this student’s imported class with `version`, `language` (`en`/`zh`) and changed `name`, `room`, `description`; or restore with `{version, reset:true}` |
| POST | `/api/timetable/sync` | Read ePortfolio using retained authorization or a supplied myNTU password; optional `force: true` for manual refresh |
| GET | `/api/cool/announcements` | Current student’s saved announcement snapshot |
| POST | `/api/cool/announcements/sync` | Refresh published announcements using the saved COOL/NTU connection; optional `password` and `force` |
| GET | `/api/cool/calendar` | Current student’s saved homework and connection state; never the private feed link |
| POST | `/api/cool/calendar/sync` | Automatically discover/read the personal feed using retained NTU authorization; optional `password` and `force` |
| POST | `/api/auth/logout` | Revoke the current device session |
| POST | `/api/auth/logout-all` | Revoke the current student's device sessions |

JSON login accepts only `studentNumber` and `password`. Timetable and COOL sync accept only optional `password` and `force`; neither accepts a student ID or upstream URL. Mutation requests require the same Origin as the app; logout and all sync actions additionally require `X-CSRF-Token`. Password fields are masked and cleared after submission. Never put authorization or session tokens in localStorage or URL parameters.

All task mutations also require `X-CSRF-Token`. Task responses include the authenticated student number so a tab can reject responses after another tab changes the shared login cookie. No task content is stored in localStorage or shared between preview and real accounts.

## Next stages

Verify live announcement reads and automatic COOL calendar discovery with the owner's real account, then verify the connected Campus Mail client on the owner's phone and desktop. Retain the same encrypted ownership boundaries and cached-data fallback for each provider.


## Gemini translation in Campus Mail

The reader offers **Translate → Original / English** when the opened NTU email contains Chinese. This uses the same structured Chinese-to-English prompt, response format, Gemini generation settings and semantic HTML rules as the Eren personal mail client. The translated subject and body replace the reading view while active; the source remains unchanged. Switching back or reopening the same message uses an in-memory translation cache (at most 30 messages), which is cleared when the signed-in student changes. No translation is performed without the student's explicit click.

Unlike the personal site's privately configured mail workspace, Campus Week is an independent multi-student Cloudflare Worker. It **cannot read or reuse Eren's personal Gemini key/model configuration** from the other mail service. For live translation, the version-controlled `wrangler.jsonc` sets `GEMINI_MODEL` to `gemini-3.1-flash-lite`. Keep the actual `GEMINI_API_KEY` value as a **Cloudflare production Worker Secret** (Settings → Variables and Secrets), never in GitHub. To configure it with Wrangler instead, run `npx wrangler secret put GEMINI_API_KEY` and enter the value privately.

Do not commit the API key or expose it to the client. If the key has not been provisioned, only the translation endpoint is unavailable; reading and sending NTU mail continue to work as before. All translations are requested by an authenticated, same-origin, CSRF-protected POST that identifies only mailbox and UID; the server reads that student's email itself, rate limits to 12 requests per minute per account (matching personal Mail); the translation window resets every minute and invalid/failed NTU reads do not count, strips dangerous markup, and sends subject, text, and safe semantic structure to Gemini. Email content is sent to the configured Google Gemini API only after the user clicks Translate. Model HTML is sanitized and displayed inside the existing sandboxed, no-same-origin iframe. Provider errors or incomplete output leave the original view intact.

## Campus Mail

Apply migrations/0004_mail.sql before publishing. Campus Mail reuses the personal project's Roundcube adapter, data-command parser and confirmed/uncertain sending flow, with ownership derived exclusively from the Campus Week session. The basic NTU Mail operations require no additional provider secrets; optional Gemini translation requires a server-side Gemini API key secret and the version-controlled public model setting. Existing NTU credentials encrypt short-lived cookie sessions and push subscriptions with account/provider-bound AES-GCM. A D1 lease serializes provider operations across devices and Worker instances.

The skeleton supports inbox/folders, paginated folder search, read/reply, rich-text compose, archive/trash, and individual streamed attachment downloads up to 20 MB. The reader uses NTU's formatted body rather than parsing an entire MIME message, sanitizes it, and displays it in an iframe without script or same-origin permissions. External images are opt-in. The personal-site Gemini composer adds rich formatting, Undo AI/Redo, encrypted account drafts, attachments (8 files / 20 MB total), and a durable scheduled Outbox. Closing the composer saves the draft; switching students clears its visible content and tab copy.

Inbox metadata is reused for 60 seconds and only the visible inbox refreshes once per minute. Cron runs each minute for scheduled sends; notification checks retain their five-minute per-student interval and check at most four due students with alerts enabled; larger enrollment may increase latency. Each run reads only the newest Inbox UID. Initial checks establish a baseline, deleted subscriptions are pruned, and unsuccessful checks use exponential backoff. Auth rejection suspends checks until a new login. Push delivery tracks each device's notified UID so transient errors retry without repeating successful deliveries. No mail body or attachment is fetched by the background job. With four students, five-minute polling is 1,152 mailbox checks/day, distinct from Worker invocations and upstream subrequests. D1 query counts and CPU still need production monitoring; do not interpret passing fixtures as a measured Cloudflare usage guarantee. Timetable and COOL retain hourly processing at minute 15.

Web Push uses native WebCrypto (RFC 8291 aes128gcm and VAPID). An encrypted, stable VAPID key is generated once in mail_config. Subscriptions are validated against browser push-service hostnames and limited to eight per student. The service worker never caches API responses or mail. Generic lock-screen notifications omit email subjects/bodies; it checks the current account before display. iOS needs installation on the Home Screen and notification permission, Android and desktop need supported browsers and permission. Delivery timing depends on browser/OS/network conditions.

Send IDs are claimed before provider preparation and bound to a payload digest. NTU receives an imported MIME draft with a stable Message-ID and server-derived reply headers; a transport failure after send becomes uncertain and is never automatically resent. Check delivery searches Sent for the exact Message-ID. Do not expire send deduplication records while their IDs could be retried. Live mail acceptance requires an explicitly authorized self-send and a real-device notification check.

## Personal-site Gemini composer

The composer uses the personal client’s exact `AI_SYSTEM` instruction, current-draft payload, temperature 0.3, 8,192-token JSON response, quick commands and rich editor vocabulary. It shares Campus Week’s existing server-side Gemini model/key configuration. Generating only revises the body; sending and scheduling require separate explicit buttons. Late AI responses are ignored after manual edits, closing the composer, starting a send or switching accounts. Formatting survives Undo AI/Redo. Reply context is read using the current student's NTU authorization.

Migration `0005_mail_composer.sql` defines drafts, files, encrypted upload chunks and Outbox jobs. The Worker also applies this additive, idempotent schema on first composer access or scheduled run so existing deployments can upgrade without a separate D1 CLI session. The runtime schema is tested against that migration. Draft bodies, attachment names/content and queued snapshots use student- and record-bound AES-GCM. Every composer API uses the existing account session, same-origin policy and mutation CSRF checks; supplied student IDs never determine ownership. Draft versions reject stale saves from another tab. Autosave is serialized and debounced 1.2 seconds; an account-scoped sessionStorage copy covers offline edits and reloads, and is removed when switching accounts.

Endpoints: `POST /api/mail/ai`; `GET/POST/DELETE /api/mail/drafts`; `POST/DELETE /api/mail/drafts/attachment`; `GET/POST /api/mail/outbox`; `POST /api/mail/outbox/action` (`cancel`, `check`, `restore`). Upload chunks are immutable, 255 KB each (a multiple of three bytes so base64 chunks concatenate safely); sending requires every selected attachment to be complete. Restored queued drafts retain immutable files. A MIME alternative preserves plain text and rich HTML. NTU's imported compose state must contain every expected filename before transmission.

Send/Schedule freezes the saved draft version into an encrypted Outbox snapshot and hides the draft from the editable list. The minute cron claims up to four due jobs with a lease; a stable send ID and Message-ID protect retries and crashed jobs. Pending/scheduled jobs may be cancelled. Failed/cancelled jobs restore their draft; uncertain delivery must be checked against Sent and is never automatically resent. Scheduling accepts one minute to one year ahead in the browser's displayed local timezone; execution normally occurs on a subsequent minute tick and may be later under provider contention. No real mail is sent by automated tests.

## Centralized settings

The skeleton Settings dialog is one continuous page: student number/logout, three live theme previews (Daylight, After hours, device appearance), interface language, timetable statistics, illustrated iOS/Android installation guides and an optional Hanzi Steps companion. Miniature previews are local CSS; no remote pages or trackers load. Statistics derive from stable course IDs and valid weekly meetings; personal events and duplicate meetings are excluded. Hours measure the scheduled start-to-end duration, including breaks within an imported meeting.

`GET/PATCH /api/preferences` saves versioned, student-bound AES-GCM preferences. Migration `0006_student_preferences.sql` also bootstraps idempotently on first use. Theme changes apply immediately, serialize to the account, and use a device-only appearance fallback. Preview profiles never call the preferences API. Late responses are discarded after account changes, and logout clears the widget and username from the view.

The Hanzi Steps widget is off by default. A student explicitly connects an existing username; `GET /api/widgets/hanzi?username=…` validates it and reads only the fixed public Hanzi Cloudflare `/widget` endpoint, without NTU credentials or cookies. A bounded summary contains streak, practice progress and next character. The dashboard widget refreshes on focus and every two minutes while visible/focused, preserving previously loaded data on temporary failures. Preview mode uses clearly labelled fictional progress. No changes are made to Hanzi Steps or its learning records. PWA installation uses the existing no-cache service worker; the optional browser install prompt is only invoked by its button. Apple/Google installation guides link to the official instructions.
