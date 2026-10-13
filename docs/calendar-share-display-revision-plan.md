# Share display revision — 2026-10-13

## Background / evidence / root cause
The user supplied an actual export containing English meanings, times, and two Peach Diary labels. It matches the old meaning-only export behavior. Current unshipped changes pass persisted shift_code separately, but always render code + meaning. Times already default off in the unshipped code. Live read-only database check confirms original A/B/C codes exist alongside their English meanings; A complete paginated read found2032 shift rows,3 account owners and31 distinct nonnull person IDs; October2026 contains186 rows with A/B/C and rest/holiday codes. Person records are not unique app users. No production rows will be changed.

## Approved scope
- Default cells to original code only (including rest codes); optional localized Show shift names checkbox adds configured name. Independent time checkbox remains off by default.
- Legend intentionally retains code + meaning even when cell names are hidden. Keep custom note, privacy and monthly quote behavior.
- Remove both visible diary-style labels, retain IShift logo and month.
- Shorten the screenshot's quote by at least two characters using natural wording. Keep quote on one line using a fit strategy, not blindly cutting meaningful text. Review all quotes for narrow cards.

## Failure cases / passing criteria
- A/B/C replaced by meanings, rest code replaced by generic rest, names leak into default cells.
- Names/times toggles coupled; reopen retains unwanted state; legend loses meaning or gains times when off.
- Quote clips, ellipsizes or wraps; removing branding also removes IShift logo.
- Keyboard hides note; full PNG truncates legend/note/footer.
- Treat sampled DB counts as complete or assign a screenshot to an account without evidence.

## Checklist / progress
- [x] Inspect screenshot, source and bounded live database evidence.
- [x] Implement narrow UI/quote revision with smaller implementation agent.
- [x] Typecheck and diff whitespace check.
- [x] Native E2E actual image, default/options/reset, quote fit, keyboard and export; repeatable synthetic artifacts saved.
- [x] Independent source/evidence review.
No new unit tests. No production data edits. No TestFlight upload without new approval.

This revision supersedes the earlier requirement that cells and legend labels always match: cells now default to codes only; the legend deliberately keeps meanings. Production data was read only, and no names or account IDs are included in this record.

## User follow-up: compact inline legend
The verified legend still uses a full-width row per code, creating excess height. User requests side-by-side entries and a separator. Use a restrained middle dot between entries; retain the logo once in the footer. Layout wraps naturally as needed, keeping a label with its times in an entry and allowing unusually long entries to wrap without clipping. Failure gates: narrow overflow, detached separators, missing entries/times, excessive height and full PNG clipping. Native export must demonstrate a shorter inline legend with all meanings retained. No new data logic or release scope.

## User follow-up: declutter quote/options controls
Replace three style buttons with a single localized cycle button (gentle -> toxic -> none -> gentle), displaying current mode and a cycle icon/accessibility hint. Put names/time checkboxes in a separate row below it. Preserve existing monthly per-account/mode seeded quote logic; mode click changes style, not a random reroll. Failure gates: wrong cycle order, rapid taps while saving, inaccessible current mode, altered persistence/seed, options still mixing with style row, keyboard reachability. Verify a full style cycle and actual poster plus two-row controls.

## Final native acceptance
Final iPhone17Pro/iOS26.5 Traditional Chinese Release build passed. `final-inline-codes.png` is the actual Photos export with the compact one-row legend; `final-inline-times.png` retains all actual time variants in two wrapped lines. `final-controls.png` shows one cycle button above separate checkbox options. Full cycle toxic -> none -> gentle -> toxic returned the same monthly quote. Names/time defaults, reset and keyboard acceptance passed. Source/typecheck/diff checks passed. No production data edits or TestFlight upload. Other screen sizes/English quotes were not exhaustively native-tested.
