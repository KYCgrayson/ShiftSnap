# Group visibility QA — 2026-11-06

## Controlled-boundary flow checks

Run from the repository root:

```bash
node artifacts/qa/2026-11-06-group-visibility/flow.integration.cjs
```

Expected: `{"scenarios":14,"passed":14}`. Detailed evidence is `flow-results.json`.

This executes the actual `ScanScreen` JSX and recognize callback, actual photo-consent service, actual schedule store, actual image-path builder and localized text. The settings bulk-share callback is loaded from the actual TypeScript AST and calls the actual schedule-store share mutation. React hooks, native controls/Alert, file reads and Supabase transport are controlled test boundaries. This is flow integration, not native UI E2E.

Covered:
- Group and personal preview, including when camera permission is denied.
- Named group + original-photo visibility in Chinese and English consent.
- Cancel/dismiss yield no OCR or storage/database writes.
- Rapid repeated recognition taps produce one consent.
- Auth changes during consent abort the flow.
- Group changes before the tap are disclosed; changes after the tap do not silently redirect saved group or photo storage path.
- Bulk share cancel/dismiss/auth-change abort. Accepted share remains pinned to the disclosed group after active-group change and includes original-photo and cross-group move disclosure.

See acceptance.md for the failure matrix written before verification. No production data or services are used.

## Native build

A real iOS Simulator Release QA build completed with exit 0 using the repository QA entry, synthetic localhost backend and Chinese locale. The current runtime is iOS 27.0, iPhone 18 Pro Max `06EADD5D-D601-42D2-9A6C-84996426C650`. App installed; simctl launch returned a PID, but the controller then found a UIKit scene-lifecycle crash before JavaScript on iOS 27. This is not startup acceptance. Only iOS 27 runtime is currently installed; the earlier iOS 26 QA device is unavailable. No production app code was changed for this unrelated runtime issue. Bundle SHA256:

`d9404d1df204b30d60ecfbc32dce391889fa6c224a5bfce9581288f56aef770e`

```bash
cd apps/mobile/ios
env EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55439 EXPO_PUBLIC_SUPABASE_ANON_KEY=local-qa-only EXPO_PUBLIC_QA_RUN_ID=visibility-20261106-1 EXPO_PUBLIC_QA_LOCALE=zh-TW ENTRY_FILE=/Users/grayson/Code-development/GitHub/ShiftSnap/apps/mobile/tests/native-reliability.entry.js xcodebuild -workspace ShiftSnap.xcworkspace -scheme ShiftSnap -configuration Release -sdk iphonesimulator -destination 'id=06EADD5D-D601-42D2-9A6C-84996426C650' -derivedDataPath /private/tmp/ishift-consent-derived ONLY_ACTIVE_ARCH=YES IPHONEOS_DEPLOYMENT_TARGET=15.0 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -quiet build
```

The first `startup.png` was taken during launch animation and is **not** Home or consent acceptance evidence. The headless XCTest native verification is owned by the separate controller; its results must be attached separately. CUA could not find a Simulator app surface.

The localhost fixture is `fixture.mjs`; run it from repo root with Node before the QA app. `/qa/reset` clears the synthetic request record, `/qa/evidence` returns it. No API keys or real accounts are needed. Synthetic OCR response/date differ from live Gemini; this does not verify AI correctness or production RLS.
