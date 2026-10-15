# Native calendar code-first acceptance — 2026-10-15

## Result
Passed the scoped native iOS simulator workflow. Native Release build and TypeScript checks passed. No production database, physical-device calendar or TestFlight writes.

## Boundary and reproduction
Dedicated device C03ECA22-BBD2-4CA9-837B-330A788CADF7 (IShift Reliability QA, iOS 26.5). Run `node scripts/qa/native-code-first-fixture.mjs` with port 55439 free; it serves synthetic Supabase responses, not production data. Build the existing `apps/mobile/tests/native-reliability.entry.js` with EXPO_NO_DOTENV=1, EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55439, EXPO_PUBLIC_SUPABASE_ANON_KEY=local-qa-only, a fresh EXPO_PUBLIC_QA_RUN_ID, and EXPO_PUBLIC_QA_LOCALE=zh-TW. Use the signed simulator Release scheme ShiftSnap. Do not erase simulator state: prior event identity is part of the test.

Synthetic current-month shifts on days 10/11/12 retain stable IDs and map to A / Morning shift, B / Afternoon shift, and / / 休假. The person is Alex QA. Work shifts are 09:00–17:00; rest is all-day. Existing baseline had three D shifts; the first sync intentionally changes fixture code and the third shift to all-day, so timing preservation is compared from code-only onward.

In native UI: open Calendar and select day 11 (code B above meaning); open Settings, verify both new switches initially off; review then cancel; enable 15-minute reminders; confirm code-only; confirm meaning-only, person-only, both; repeat both unchanged; restart and verify saved choices; finally turn both off and confirm. After each stage run `python3 scripts/qa/snapshot-calendar-code-first.py LABEL` from repository root. Snapshots read only this synthetic user's keyed events.

## Evidence
- baseline.json and cancelled.json are byte-identical: cancellation did not mutate managed events.
- code-only / with-meaning / with-person / both show all four correct title combinations, including raw `/`.
- All snapshots have the same three UUIDs; repeated.json exactly equals both.json.
- After initial fixture normalization, start/end/all-day/calendar/alarms/notes are identical across all title choices.
- Notes retain the IShift:v2 ownership marker and full meaning; person name is absent.
- Two explicit work alarms are -900 seconds. Native SQLite also has a default_alarm=1 row on every item, including rest; these are separately classified in alarm-default-classification.json. No extra custom rest alarm. An initial check incorrectly counted default rows as custom alarms; corrected classification is recorded rather than claiming no native alarm rows.
- Final-code-only equals initial code-only exactly after the final locale-only rebuild.
- Restart preserved meaning=false/person=true before testing both on final build.
- Screenshots: detail-B.png, options-code-only.png, confirmation-both.png.
- verification.json records comparison results.

## Limits
Real EventKit/native UI and local persistence; backend is synthetic. Not a production account, iCloud propagation or physical-device acceptance test. Snapshot comparisons cover this synthetic owner's events, not all unrelated calendar entries. Both card branches were source-reviewed; the personal card was exercised natively. Existing legacy mock integration tests still assert removed title-mode behavior; they were not used as acceptance evidence or rewritten after implementation. No claim that the entire historical test suite passes.
