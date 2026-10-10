# Reliability verification

All fixtures are synthetic. Never point these runners at a production database.
These commands run from the repository root unless stated otherwise.

## Fast checks

```sh
pnpm typecheck
git diff --check
node --experimental-strip-types --test apps/mobile/tests/shiftImages.test.mjs packages/shared/tests/rosterIdentity.test.ts supabase/functions/ocr-process/generationConfig.test.ts
node apps/mobile/tests/calendar-reconcile.integration.mjs
node apps/mobile/tests/offline-auth-coldstart.integration.mjs
node apps/mobile/tests/offline-read.integration.mjs
```

The calendar integration runner invokes the real reconciliation implementation,
with only the Expo Calendar boundary replaced. It writes a JSON artifact under
`apps/mobile/tests/artifacts/`. It does not prove EventKit behavior on a device.
The repository's current lint command is a placeholder, not a quality check.

## PostgreSQL migration, RLS and rollback scenarios

Requires PostgreSQL 17 command-line tools. Start a dedicated, local-only cluster
on **55438**; do not reuse a normal development or production database.

```sh
mkdir -p /tmp/ishift-qa-pg/socket
initdb -D /tmp/ishift-qa-pg/data -A trust --no-locale
pg_ctl -D /tmp/ishift-qa-pg/data -l /tmp/ishift-qa-pg/server.log -o '-k /tmp/ishift-qa-pg/socket -p 55438 -h 127.0.0.1' start
python3 scripts/qa/database-integration.py
pg_ctl -D /tmp/ishift-qa-pg/data stop
```

Skip initdb when reusing this dedicated QA cluster. The runner recreates only
`ishift_reliability_qa`, installs the repository migrations and exercises the
authenticated database role. It supplies local Auth/Storage schema stand-ins.
The historical initial schema's invalid expression-UNIQUE syntax is converted to
an equivalent expression index in the test copy only. Thus this is functional
migration/RLS validation, not proof of a pristine Supabase stack replay.
Results: `artifacts/qa/2026-10-10/database-integration.json`.

## Native simulator scenarios

Use a dedicated simulator without personal data. The QA entry is separate from
the production Expo entry and refuses to run without the localhost fixture URL.
It seeds a synthetic local session once; subsequent launches do not reseed it.
The real app screens, Zustand stores, SecureStore and AsyncStorage execute.

Start the fixture server:

```sh
node scripts/qa/native-fixture-server.mjs
```

Build from `apps/mobile/ios` (requires the generated workspace and installed Pods):

```sh
EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55439 EXPO_PUBLIC_SUPABASE_ANON_KEY=local-qa-only ENTRY_FILE="$PWD/../tests/native-reliability.entry.js" xcodebuild -workspace ShiftSnap.xcworkspace -scheme ShiftSnap -configuration Release -sdk iphonesimulator -destination 'id=YOUR_QA_SIMULATOR_ID' ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO build
```

Install the resulting IShift.app on the QA simulator. Record these UI steps:

1. Load Home and Calendar online; verify synthetic Alex QA shifts.
2. Toggle the fixture backend to unavailable:
   `curl -X POST -H 'Content-Type: application/json' -d '{"offline":true}' http://127.0.0.1:55439/qa/mode`.
3. Terminate and reopen the app. Verify cached month, offline/read-only status,
   saved timestamp, and unavailable-month indication for a never-loaded month.
4. Attempt edits; verify no successful mutation and a clear read-only explanation.
5. Set `offline` to `false`, retry/foreground, and verify normal refresh resumes.
6. Check all three title preferences, persistence after restart, and same-month
   calendar resync without duplicate events. Use a disposable device calendar.
7. Sign out while backend unavailable; relaunch must not restore prior identity.

Record screenshots and observations in `artifacts/qa/2026-10-10/`. The HTTP
artifact records method/path only, not authentication headers or tokens.
This verifies a real native app against a controlled HTTP backend; it is not a
production OAuth, real Supabase outage, or physical-device acceptance test.
