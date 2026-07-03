# Work Log

## 2026-07-03

### Project Review

- Project: Vite + React + TypeScript single page app.
- Main app code: `src/App.tsx`.
- Styling: `src/App.css`, `src/index.css`.
- Build command verified with `npm.cmd run build`.
- Lint command verified with `npm.cmd run lint`.
- `npm run build` and `npm run lint` fail in PowerShell because script execution blocks `npm.ps1`; `npm.cmd` works.

### Current Issues

1. `src/App.tsx` is too large.
   - UI, alarm logic, storage, backup, timers, and helpers are in one file.
   - Current size: about 1452 lines.

2. Alarm logic has a midnight edge case.
   - Example: Monday 00:10 schedule with 30 minutes before should alarm on Sunday 23:40.
   - Current logic checks today's day and today's alarm time, so this case can be wrong.

3. No automated tests exist.
   - `package.json` has no `test` script.
   - Time calculation and backup validation are not covered by tests.

4. Favicon path may be wrong for subpath deployment.
   - `vite.config.ts` uses `base: '/alarm-schedule/'`.
   - `index.html` uses `/favicon.svg`.
   - In subpath deployment, this can point to the domain root instead of `/alarm-schedule/favicon.svg`.

5. `AGENTS.md` is untracked.
   - Git status shows `?? AGENTS.md`.

### Fixes Applied

1. Split shared types, constants, and time logic out of `src/App.tsx`.
   - Added `src/types.ts`.
   - Added `src/scheduleData.ts`.
   - Added `src/timeUtils.ts`.
   - `src/App.tsx` reduced from about 1452 lines to 1249 lines.

2. Fixed midnight alarm calculation.
   - Alarm occurrences are now calculated from the schedule's real start date.
   - A schedule that starts after midnight can now alarm on the previous day.

3. Added automated tests.
   - Added Vitest.
   - Added `npm run test`.
   - Added `src/timeUtils.test.ts`.
   - Covered midnight alarm formatting, start/end rollover, due alarm detection, and next alarm detection.

4. Fixed favicon path for Vite subpath deployment.
   - Changed `index.html` favicon href from `/favicon.svg` to `%BASE_URL%favicon.svg`.

5. Fixed dependency audit finding.
   - `npm audit fix` updated the lockfile.
   - `npm.cmd audit --audit-level=high` now reports 0 vulnerabilities.

### Verification

- `npm.cmd run test`: passed, 4 tests.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- `npm.cmd audit --audit-level=high`: passed, 0 vulnerabilities.

### Ad Slot Example

- Added an example ad slot between the weekly schedule area and the alarm list.
- Moved the example ad slot above the schedule editor.
- Added the previous middle ad slot back, so the page now has two example ad slots.
- Hid both example ad slots until AdSense or another ad provider is ready.

### Cloudflare Pages Prep

- Updated `vite.config.ts` to use `/` as the Vite base path when Cloudflare Pages sets `CF_PAGES=1`.
- Added `wrangler.jsonc` with project name `alarm-schedule` and build output directory `./dist`.
- Added Cloudflare Pages deployment settings to `README.md`.
- Verified local GitHub Pages-style build and Cloudflare Pages-style build.
- Checked Wrangler auth with `npx.cmd --yes wrangler@latest whoami`; local machine is not authenticated with Cloudflare yet.
- Files changed:
  - `src/App.tsx`
  - `src/App.css`
- Verification after change:
  - `npm.cmd run test`: passed, 4 tests.
  - `npm.cmd run lint`: passed.
  - `npm.cmd run build`: passed.
