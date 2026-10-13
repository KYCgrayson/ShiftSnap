# Native export display verification — 2026-10-13

Tested real React Native iOS26.5 Release app on dedicated IShift Reliability QA iPhone17Pro simulator. Synthetic localhost HTTP fixture only; no production identities or data used in images.

## Passed before final inline-legend tweak
- `default-codes.png`: actual Photos Save Image; A/B/C and original rest `/` in cells, no times or names in cells, code+meaning legend. Exact requested quote shortened by two characters and visible on one line. Both diary labels absent; IShift logo remains.
- Names enabled while time disabled adds cell meanings without times. Times independently enabled adds actual stored pairs and legend variants (normal, changed, missing, overnight).
- `codes-with-note.png`: actual complete Photos PNG including multiline explicit note. Private diary/coworker sentinel excluded.
- `keyboard-options.png`: software keyboard open, focused note/checkboxes/share button fully visible. Resolves prior locked-Mac keyboard acceptance gate.
- Both settings enabled then close/reopen restores both unchecked and empty note.
- Typecheck/diff checks pass. No new unit tests.

## Reproduction
Start from `scripts/qa/calendar-share-fixture-server.mjs`, apply `fixture.patch` to a copy under /tmp and run it from /tmp on localhost55439. This uses A/B/C and / in synthetic records, including multi-shift days and varied stored times. Apply `qa-entry.patch` to a temporary sibling of `apps/mobile/tests/native-reliability.entry.js` to seed toxic quote index9 and locale zh-TW. Use that temporary file as ENTRY_FILE for simulator Release build, with EXPO_NO_DOTENV=1, EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55439, EXPO_PUBLIC_SUPABASE_ANON_KEY=local-qa-only, EXPO_PUBLIC_QA_LOCALE=zh-TW and a fresh EXPO_PUBLIC_QA_RUN_ID. Install/launch on dedicated QA device; no production app configuration change.

Open Calendar > Share month. Export default, toggle names only and verify times absent, then enable time and verify actual variants. Add explicit multiline note and show software keyboard; field and share button remain visible. Save via native share sheet > Save Image and read the resulting simulator Photos PNG. Close/reopen and verify reset.

Boundary: this verifies one iPhone size / Traditional Chinese flow and synthetic API responses, not every screen size, English quote or physical phone. No TestFlight upload performed.

## Final follow-up acceptance
`final-inline-codes.png`: actual Photos export with four inline entries and dots, one row. `final-inline-times.png`: actual Photos export retaining all four A time variants and other entries, naturally wrapping into two lines. `final-controls.png`: one style-cycle button on its own row, checkboxes below. Native cycle toxic -> none -> gentle -> toxic returned the same exact toxic quote, confirming no per-tap reroll. Both final builds succeeded. Earlier images document intermediate layout; final-inline files represent delivered layout.
