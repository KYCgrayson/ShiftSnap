# Native reliability acceptance — 2026-10-11

Result: seven bounded simulator scenarios passed. Product source unchanged from `1960d65` (documentation baseline `b1c8868`). This completes the native simulator gate that was blocked by the locked Mac on October 10.

## Environment and limits

- Dedicated iPhone 17 Pro simulator, iOS 26.5; ID C03ECA22-BBD2-4CA9-837B-330A788CADF7.
- Real React Native screens, SecureStore, AsyncStorage and Expo Calendar/EventKit; synthetic Alex QA account and localhost HTTP fixture on port 55439. Outage returns HTTP 503; this is not airplane-mode or a real Supabase outage test.
- Existing compatible Release native shell with freshly exported final QA JavaScript (2,075 modules, 4,316,226 bytes). SHA-256: `6c862f8cfe1b07388e71fbe4b877968ad9bd7abf340f0cf8fcf8a66b52d67be9`.
- No fresh full native compilation, production OAuth, physical-phone acceptance, or TestFlight submission is claimed.
- Full Calendar access explicitly authorized by the user for this isolated simulator and granted through iOS Settings. Calendar location and notifications declined.
- Fresh install before scenarios; no reinstall, reseed or storage clearing during cold-start/logout checks.

## Evidence

| Scenario | Observation | Artifact |
| --- | --- | --- |
| 1 Online load | Home and October Calendar show synthetic shifts October 10–12 | 01, 02 screenshots |
| 2 Offline cold start | Same-install restart shows cached October, read-only state and saved timestamp 2026/10/11 13:04:02 | 03 screenshot |
| 3 Uncached month | December says this month has not been saved on this phone | 04 screenshot; qualification below |
| 4 Offline edit | Save rejected with explicit read-only explanation; HTTP evidence contains no schedule mutation | 05 screenshot, native-http-boundary.json |
| 5 Reconnect | Restoring fixture and pressing Retry removes offline banner and reloads data | 06 screenshot, HTTP log |
| 6 Native calendar formats | All three formats update the same three native events; UUIDs and dates remain stable; name-first preference survives cold restart; actual Apple Calendar displays Oct 11 09:00–17:00 event | calendar-*.json, 07 screenshot |
| 7 Offline logout | Sign out during outage reaches welcome screen; same-install cold restart remains signed out, with no Alex QA identity or schedule | 08, 09 screenshots |

Calendar titles observed: `Day shift (D) · Alex QA`, `Day shift (D)`, `Alex QA · Day shift (D)`. Read-only snapshots of the simulator Calendar database filtered the exact synthetic IShift owner sync marker. All four snapshots contain the same three UUIDs. Native Calendar UI independently corroborates the title and time.

## Minor UX finding

For an unvisited month, the main banner correctly reports missing local data, but the generic cached-data subtitle and selected-day section can still refer to the previously selected October day. Scenario 3 passes the narrow missing-month-indication criterion; this is not a claim that the entire empty-state wording is consistent. Follow-up: align selected date and secondary wording when moving to an uncached month. No product change was made during this verification run.

## Repeatability

Follow `scripts/qa/README.md` native scenarios using `apps/mobile/tests/native-reliability.entry.js` and `scripts/qa/native-fixture-server.mjs`. The production Expo entry remains unchanged. For each title mode, read the disposable simulator's Calendar database without modifying it, filter `IShift-Sync-Key` by the synthetic owner, and compare UUID/title/start/end across snapshots. Restart the same installation for persistence and logout checks.

`native-http-boundary.json` records timestamps, methods, paths and outage mode only; repetitive realtime connection attempts are excluded and counted. `screenshots-manifest.json` provides SHA-256 hashes for all nine screenshots. Prior typechecking, integration and PostgreSQL results remain in `../2026-10-10/`; they were not rerun because no product source changed.
