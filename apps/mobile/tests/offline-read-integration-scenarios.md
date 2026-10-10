# Offline-read integration failure scenarios

These scenarios define the failure modes to check before relying on cached schedule data. The harness should exercise actual Zustand stores and `offlineReadCache.ts`, mocking only Supabase, SecureStore, and AsyncStorage boundaries.

1. A complete online fetch for three adjacent months persists exact rows, group metadata, and month timestamps; a fresh module/store instance with network unavailable hydrates those values before the read times out.
2. Switching from group/view scope A to B while A's query is pending must not show A's rows under B or persist B's query result under A's key.
3. Failure of either own, personal, or group shift query must preserve the last complete cached month; a partial query result must not overwrite it.
4. A successful empty month is cached as `[]` with a timestamp, while an unvisited month has no cache entry/timestamp and is reported unavailable.
5. A local storage write failure after successful server reads must not claim the month is available offline or report that its phone copy was saved.
6. Parallel group/person/code/month cache patches must merge fields instead of losing updates.
7. An account switch during a pending read must prevent the previous account's result from entering the active store or writing to the new account's cache.

Passing criteria: every scenario produces a repeatable JSON artifact with pass/fail and the relevant cache/store state. This is a mocked-boundary integration harness, not native-device or production-Supabase acceptance.
