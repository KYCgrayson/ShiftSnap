# Calendar reconciliation integration scenarios

This scenario list was created before implementation changes. The harness exercises the real `calendarSync.ts` reconciliation code and replaces only the Expo Calendar native boundary.

1. **Ownership-key parsing:** a valid `IShift:v2:user-a:shift-1` event is recognized as an IShift event owned by `user-a`; stale `user-a` events in the target month can be removed.
2. **Idempotent retry/title change:** syncing a shift twice in one month updates the same event ID and leaves one event. Changing title mode updates that event in place.
3. **Account isolation:** reconciling user A must not update or delete an otherwise stale event owned by user B.
4. **Day-off semantics:** a rest shift remains all-day on its source date.
5. **Overnight semantics:** a 22:00–06:00 shift ends the following day at 06:00.
6. **Time validation:** valid `HH:mm:ss` is stored at calendar minute precision; seconds above 59 are rejected and the code's valid default time is used.
7. **Failure preservation:** when native event creation/update fails, reconciliation reports failure without deleting unrelated users' events.

Passing criteria: all scenarios pass against the real reconciliation implementation, and the harness writes a JSON result artifact with scenario names, counts, and event snapshots. It does not claim device or production-calendar acceptance.
