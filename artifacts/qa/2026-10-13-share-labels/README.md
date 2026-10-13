# Share labels, legend and note native QA — 2026-10-13

Environment: dedicated IShift Reliability QA simulator, iPhone 17 Pro / iOS 26.5, com.shiftsnap.app. Synthetic localhost fixture only; no production user data or physical phone accessed.

## Current gate

Final focus-scroll build succeeded and was installed. At the final native UI check, CUA reported that the Mac was locked and automatic unlock failed. This historical lock was resolved in the subsequent display revision: keyboard-options.png and codes-with-note.png under ../2026-10-13-share-display confirm focused-note visibility and complete export. Earlier PNG, time variants, reset, 300-character cap, repeated-overlimit readiness, keyboard dismissal and Save Image checks passed.

## Verified output

- `no-times.png` / `with-times.png`: code precedes meaning, explicit rest code/meaning, optional stored times. These predate the legend follow-up.
- `legend-note-times.png`: actual iOS Save Image export. Full calendar, unique legend, multiline user-entered note, logo. E Early contains 07:00–15:00, 09:00–17:00, 未設定時間, and 23:00–07:00 隔日. Rest entries have no time. No coworker or private diary sentinel.
- `note-300-boundary.png`: 350-character input clamped to 300; repeated identical over-limit edit remains 300 and sharing remains enabled. Export contains all 300 characters and full footer, no software keyboard.
- Empty note omitted; closing/reopening resets note and time checkbox. Quote mode remains the existing preference.

## Reproduction

1. Copy `scripts/qa/calendar-share-fixture-server.mjs` to `/tmp/ishift-legend-fixture.mjs` and apply the three stored-time overrides documented in `legend-fixture.patch` before `const notes`.
2. Run the copied server from `/tmp` on its existing localhost port 55439. Its boundary log writes below `/tmp/artifacts/qa/2026-10-12-calendar-share`.
3. Build the iOS simulator Release scheme with `ENTRY_FILE` set to the absolute path of `apps/mobile/tests/native-reliability.entry.js`, `EXPO_NO_DOTENV=1`, `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55439`, the synthetic key `EXPO_PUBLIC_SUPABASE_ANON_KEY=local-qa-only`, a fresh `EXPO_PUBLIC_QA_RUN_ID`, and `EXPO_PUBLIC_QA_LOCALE=zh-TW`. Use normal Xcode ad-hoc signing, not manual deep signing.
4. Install/launch on the dedicated QA simulator. Open Calendar > Share current month; verify times default off and blank note.
5. Enter `本月班表，以最新通知為準。` + newline + `換班請先和我確認，休假日慢慢來。`. Enable times and inspect the legend. Share > Save Image; inspect the actual Photos PNG, not only the screenshot.
6. Set the note to `備註測試，依最新班表為準。\n` repeated 25 times (350 code points). Verify native input value has 300 code points. Repeat the same over-limit edit; Share must remain enabled. Export and inspect full content/footer.
7. Show the software keyboard, verify input and Share can be reached, then share. Close/reopen and verify blank note and unchecked times.

## Boundaries

TypeScript check and diff whitespace check pass. Native E2E uses a mocked HTTP boundary with real React Native UI, ViewShot, share sheet and Photos Save Image. It does not establish production database correctness or physical-device behavior. Extremely long synthetic code/meaning expands a calendar week considerably; content is preserved rather than truncated. Two input edge failures were found and repaired before acceptance: accessibility could bypass the native length cap, and repeated over-limit edits could leave capture readiness false. Software-keyboard checks also identified input/footer occlusion; keyboard avoidance and focused-input scrolling were added. No new unit tests were written. These changes are not in TestFlight build 12; no new upload was performed.
