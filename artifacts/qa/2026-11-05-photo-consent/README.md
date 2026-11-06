# Roster photo consent native QA attempt

## Result

The updated iOS QA Release build compiled, installed, and launched on dedicated Simulator `C03ECA22-BBD2-4CA9-837B-330A788CADF7`. `startup.png` is a genuine Simulator capture of the synthetic signed-in Home screen. The bundle contains `photoConsentRecognize` and `Send this roster photo for AI recognition`. The macOS UI was locked/unavailable when attempting native interactions, so the consent dialog itself was **not exercised**. This is build/install/startup evidence only, not acceptance of cancel/no-network or accept/network behavior.

`request-summary.json` is a startup baseline: 20 localhost fixture requests, zero OCR and zero storage requests. It must not be interpreted as a cancellation result.

## Reproduction

The synthetic fixture is `fixture.mjs` (copied from the repo QA fixture and extended with mocked OCR, schedule, and storage responses). Run it in an isolated temporary directory on port 55439; use only synthetic QA data. Then build from `apps/mobile/ios` with this entry point and public QA variables:

```bash
env EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55439 EXPO_PUBLIC_SUPABASE_ANON_KEY=local-qa-only EXPO_PUBLIC_QA_RUN_ID=consent-20261105-2309 EXPO_PUBLIC_QA_LOCALE=zh-TW ENTRY_FILE=/Users/grayson/Code-development/GitHub/ShiftSnap/apps/mobile/tests/native-reliability.entry.js xcodebuild -workspace ShiftSnap.xcworkspace -scheme ShiftSnap -configuration Release -sdk iphonesimulator -destination 'id=C03ECA22-BBD2-4CA9-837B-330A788CADF7' -derivedDataPath /private/tmp/ishift-consent-derived ONLY_ACTIVE_ARCH=YES IPHONEOS_DEPLOYMENT_TARGET=15.0 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -quiet build
xcrun simctl install C03ECA22-BBD2-4CA9-837B-330A788CADF7 /private/tmp/ishift-consent-derived/Build/Products/Release-iphonesimulator/IShift.app
xcrun simctl launch C03ECA22-BBD2-4CA9-837B-330A788CADF7 com.shiftsnap.app
```

The local build's `main.jsbundle` SHA256 was `fbf050a830523ca216f0a08d48a49d1006c9021697f1835f8e19ca31c149bced`. The first build needed `IPHONEOS_DEPLOYMENT_TARGET=15.0` at command line because current Xcode rejected older Pod target defaults; no project setting was changed.

## Remaining native checks

1. Start the fixture and clear its request log. On Scan, choose a synthetic roster photo, tap recognition, inspect the localized consent, then cancel. Verify zero OCR, schedule, and storage requests after cancellation.
2. Repeat and accept. Verify one mocked OCR request and expected synthetic review result; inspect the uploaded payload's data categories without recording private data.
3. From review, trigger reanalysis, cancel and accept in separate runs; verify the same boundaries.
4. Verify optional text hint and existing shift code definitions are disclosed and only transmitted after consent.

No production service or personal roster data was used. No TestFlight upload occurred.
