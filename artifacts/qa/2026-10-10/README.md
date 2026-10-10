# IShift reliability verification — 2026-10-10

## Decision
Source and integration review passed on `development`. Implementation commit `1960d65` was pushed to origin and verified with zero ahead/behind commits. Native UI acceptance is blocked by the locked Mac; do not treat this report as a TestFlight/release approval. No TestFlight submission was made.

## Preserved baseline
- Before implementation, all 29 pre-existing changed/untracked files were archived and each member checked against its SHA-256 manifest.
- Private ignored backup: `.local-backups/2026-10-10-before-reliability/`.
- Remote checkpoint: `e331b3b`. The checkpoint preserves existing work; it is not a release certification.

## Verified database boundary
`database-integration.json` records 45 passing checks: 27 migration applications and 18 authenticated-role scenarios on isolated PostgreSQL 17. Scenarios include invalid/unauthorized payloads, preservation of other scopes, repeated and concurrent replacement, a deliberately failed insertion after deletion (transaction rollback), corrected months, and the existing roster merge/undo flows.

The test supplies local Auth/Storage schema stand-ins and adapts one historical expression-UNIQUE declaration into its equivalent index in the test copy. It does not claim a pristine full Supabase environment replay. No production user rows were used.

`deployment.json` records the successful linked deployment of `20261010000001_atomic_schedule_shift_replacement.sql` after dry run and independent review. It changes function definitions only. Types were regenerated from the linked schema.

## Application checks
Final post-edit results: mobile and shared TypeScript checks passed; existing tests 8/8; calendar integration 7/7; authentication integration 7/7; offline data integration 8/8. Independent final source review approved both final guards. Runnable commands are in `scripts/qa/README.md`.

The pnpm wrapper briefly failed to spawn because the host exhausted process resources. Direct invocation of the same TypeScript compiler for each package succeeded after the final edits. This environment failure is not recorded as an application assertion failure. Calendar integration invokes the real reconciliation service with the native calendar boundary mocked. Auth and offline-read integration invoke real stores/cache with synthetic storage and network boundaries. These are integration checks, not native end-to-end acceptance.

## Native attempt and remaining gate
A dedicated iOS simulator was created. A fresh QA JavaScript bundle was installed into an existing compatible Release simulator shell; fixture-server logs show startup read requests. This is neither a fresh full native compilation nor visible UI proof. The attempted full Xcode build was stopped to avoid excessive machine resource use.

The final candidate also bundled successfully for iOS (2,075 modules, one Metro worker). This final bundle was not visually validated. The isolated PostgreSQL/HTTP services were stopped and the dedicated simulator was confirmed shut down.

The computer-use tool reported that the Mac is locked and automatic unlock failed. The user was asked to unlock it. Consequently, no screenshots, tap-flow acceptance, EventKit permission/write acceptance, production OAuth, or physical-device acceptance is claimed.

After unlock, repeat the seven scenarios in `scripts/qa/README.md`: online load, backend outage, cold restart/cache display, blocked edits, recovery, title preference/calendar reconciliation, and offline logout/relaunch. The fixture uses synthetic data only.

## User-visible limits
- Only successfully loaded months and supporting metadata have a phone copy; unseen historical months and original photos are not offline backups.
- Offline reading is supported; OCR, cloud editing and reconciliation wait for connectivity.
- The phone-copy confirmation must describe this save's completed persistence, not a previous month's timestamp.
- Title settings are account/device-local; current month changes on resync, other months on their next sync.
- Normal online reads provide database activity; opening the app is not a guarantee against Free-plan pausing. No artificial keepalive was added.
