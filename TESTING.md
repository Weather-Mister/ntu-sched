# Testing Campus Week

Use Node 24. Install the pinned dependencies with `npm ci` once, or when the lockfile changes.

| Change | Local verification |
| --- | --- |
| Mail, composer, translation, notifications | `npm run test:mail` |
| Authentication, ownership, request handling | `npm run test:accounts` |
| Exams, course matching, syllabus parsing | `npm run test:exams` |
| One other feature | `node --test tests/<feature>.test.mjs` |
| Shared logic or several features | `npm test` |
| JavaScript changes | Also run `npm run check` |
| CSS, icons, visual spacing | Inspect affected themes at desktop and phone widths; check keyboard focus and readable labels |

The focused commands are conveniences, not complete dependency analysis. Include related suites when a change crosses feature boundaries. CI runs the complete offline suite and syntax check on pull requests and main, so a focused local run does not weaken the merge checks. Avoid repeating a passing full run unless the code changes or a new concern warrants it.

`npm run test:upstream` makes real requests to public NTU services. Use it deliberately when checking provider changes, or run the GitHub workflow manually with **Check live NTU services** enabled. Ordinary tests use fixtures and must not depend on NTU availability or real credentials.

## What deserves a test

- Observable behavior: correct results, useful errors, recovery, and acknowledged changes.
- Security boundaries: session/CSRF checks, ownership, private data, credentials, URL restrictions, sanitization, and send deduplication.
- A reproducible bug, including late responses and concurrent updates.
- Small shell contracts that catch missing assets, missing controls, invalid references, or inaccessible dialogs.

Do not add tests for exact CSS declarations, pixel values, SVG path data, class order, or the spelling of an internal JavaScript expression. These assertions can pass while the layout is broken and fail during harmless refactors. Verify visual changes in the browser. Test controls by using them and observing their requests/results, rather than matching their source code.

Keep fixtures scoped to the test. Replace retry and polling waits with a controlled test clock; preserve the production retry limits and assertions that no provider request occurs while a mailbox is locked. Do not remove security or failure cases merely to lower the test count.
