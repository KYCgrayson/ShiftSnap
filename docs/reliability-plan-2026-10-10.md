# IShift reliability delivery plan

## Background and goal
Preserve the existing uncommitted work, synchronize it to GitHub, then make saved schedules reliable, system-calendar output configurable, and previously loaded schedules readable after an offline cold start. No TestFlight submission in this task.

## Findings and root causes
- Authenticated month data is memory-only; guest persistence does not cover real accounts.
- Auth restoration currently gates app access on restoring a network-capable session.
- Calendar titles are fixed to name first. Existing sync-key regular expressions reject valid version keys.
- Schedule replacement deletes before inserting in separate requests, risking lost shifts.
- Existing work depends on three new SQL migrations; typechecking cannot verify deployed schema or RLS.
- The lint script is a placeholder and must not be reported as validation.

## Priority and value
1. P0: verified local backup and a remote WIP checkpoint; preserve recoverability before edits.
2. P0: atomic authorized schedule replacement and reliable calendar reconciliation. Prevent data loss and stale events.
3. P1: account-scoped title preference: shift first (default), shift only, name first. Useful for glanceability and discretion, low scope.
4. P1: persistent account/group-scoped schedule read cache, offline cold-start access, timestamp/status, safe refresh. Enables actual daily use during outages.
5. Deferred: offline OCR, offline writes/conflict resolution, original-photo disk cache, artificial database keepalive. These do not belong to the agreed first delivery.

## Failure cases to address before implementation
- Delete succeeds but replacement insert fails; unauthorized account/group tries replacement; concurrent replacements; retry of same save.
- Title change creates duplicate events; wrong-account events removed; old shift events survive replacement; overnight/rest/all-day semantics regress.
- App killed/restarted offline; expired token; backend timeout; successful empty month; corrupted cache; missing month; partial read failure.
- Sign-out/account switch during an in-flight request; group switch; removed group membership; old data written into a new account's cache.
- Offline/read-only screen attempts remote mutation or destructive calendar reconcile from incomplete cached data.
- Storage failure falsely reports offline readiness; reconnect never retries; stale auth completion restores a signed-out account.

## Checklist and progress
- [x] Inspect current source and Git baseline (development matches origin).
- [x] Archive all 29 pre-existing changed/untracked files and verify SHA-256 against archive contents.
- [ ] Review and push scoped WIP checkpoint (exclude local agent configuration and backups).
- [ ] Implement P0 safety changes.
- [ ] Implement title preference with UI preview and persistence.
- [ ] Implement authenticated offline read and reconnect behavior.
- [ ] Independent review and repairs.
- [ ] Run typecheck, existing tests, meaningful integration/database tests, native E2E where environment supports it.
- [ ] Save reproducible QA artifact and push final reviewed commits.

## QA and passing criteria
- Replacement is all-or-nothing, authorized, and scoped; failures preserve old rows.
- Repeated month sync updates titles without duplicates; obsolete managed events removed; other users/events untouched; overnight and days off retain dates/times.
- Successful online load -> cold restart offline -> same cached schedule visible. No cached month is falsely shown as empty/current. Account switch and logout never expose another account.
- Refresh errors preserve disk data; reconnect updates cache; local sign-out clears offline identity even when server unreachable.
- Real-device/simulator UI and mocked-boundary integration evidence are reported separately. No claim of production deployment or physical-device acceptance without evidence.

## Backup
Private ignored archive: `.local-backups/2026-10-10-before-reliability/`. Includes binary Git patch and hash manifest. Do not publish the archive or local `.codex` configuration.
