# Calendar code-first sync — 2026-10-15

## Background and root cause
Current native event title is meaning (code) plus optional person; old shift_only still includes meaning. Share PNG already defaults to raw code. Selected-day detail card uses meaning without code. User approved making original code the default/first visible text everywhere relevant.

## Approved implementation
New per-account independent include-meaning/include-person options default false. Use a versioned options key; legacy title-mode preferences do not silently enable new toggles. Existing external events change only on confirmed sync, not settings read. Title forms: B; B · Afternoon shift; B · Alex; B · Afternoon shift · Alex. Raw rest codes retained. Full configured meaning belongs in event notes. Keep event timing, alarms, calendar destination, ownership and IShift sync marker unchanged. Detail cards show code first with meaning. Existing image-share functionality unchanged. No TestFlight or production calendar/database write.

## Failure cases BEFORE implementation
- Code lost or appended after name; raw rest code replaced; absent/duplicate labels produce malformed title.
- Legacy mode silently enables new toggles; saved new choices fail reload; settings summary and actual event differ.
- Notes omit original marker, breaking reconciliation; unrelated calendar events altered; repeat sync duplicates events.
- Rename changes start/end/allDay/alarms, or adds person to notes despite disabled person option.
- Preview/cancel writes events; two toggles not independent; card loses contextual meaning.

## Checklist and passing criteria
- [x] Inspect source and screenshot discrepancy; align scope.
- [x] Implement via smaller agent with independent advanced controller review.
- [x] Typecheck and diff check; no new unit tests after code.
- [x] Native E2E synthetic-only: default B, both independent options and all combinations, preview cancel, repeat sync stable event IDs/count, preserved times/alarms/markers/notes, code-first card.
- [x] Save repeatable native screenshots and calendar snapshots; document limitations.
- [ ] Backup/sync verified changes; no TestFlight without fresh approval.
