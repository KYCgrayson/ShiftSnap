# Native calendar PNG share fixture: failure scenarios

This fixture drives the existing `native-reliability.entry.js` against a synthetic localhost Supabase boundary. It contains no real user data. These scenarios were defined before implementing `calendar-share-fixture-server.mjs`.

1. **Wrong month or partial date range:** October 2026 has 31 dates; November has 30; August begins Saturday and takes six Sunday-first calendar rows. `date=gte` / `date=lte` and RPC `p_start_date` / `p_end_date` must keep adjacent-month rows out of each response. Open October, November, and August in the native calendar and verify a complete PNG for each.
2. **Coworker disclosure:** A separate user's rows share the group and overlap the owner's October dates. They must appear only in the coworker query (`user_id=neq.<owner>`), never in the personal RPC or PNG, even when coworker display is enabled.
3. **False personal ownership:** An owner-created reference row has `is_personal=false` because its ID is absent from the personal RPC. It must not appear in the PNG despite its `user_id` matching the signed-in user.
4. **Multiple shifts and long text:** October includes two personal shifts on one date, a long name and long shift code. Each should remain readable and distinguishable after image capture.
5. **Day off versus blank:** October mixes early, late, and explicit day-off rows, with dates having no rows. The PNG must mark only explicit day-off rows as rest, and leave blank dates blank.
6. **Note and photo disclosure:** `daily_notes` and `schedules` responses contain sentinel text and image references. Neither sentinel nor any note/photo marker belongs in the exported PNG.
7. **Failed or cancelled share:** HTTP success alone does not prove image layout, native share-sheet completion, or recipient content. Save the actual simulator PNG and a screenshot/operation record as the E2E artifact; record a cancelled share separately from success.
8. **Fixture fidelity:** The session uses the same synthetic owner identity and localhost port as the existing QA entry. The server applies filters relevant to calendar reads and logs HTTP method, path, and query only. It never logs headers, bearer tokens, or request bodies.

The fixture is intentionally limited to calendar-read endpoints and the existing native QA session/mode controls. It does not model full Supabase authorization or production storage.
