# Android Compatibility QA

This checklist is the release gate for IShift Android internal testing. It also
contains the iOS regression checks required by the shared authentication and UI
changes.

## 1. Automated release gate

Run from the repository root with the same Node and pnpm versions used by EAS:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
cd apps/mobile
npx expo-doctor
npx expo export --platform android --output-dir /tmp/ishift-android-export
npx expo export --platform ios --output-dir /tmp/ishift-ios-export
```

Pass criteria:

- No TypeScript or lint errors.
- Expo Doctor passes all checks.
- Both platform bundles finish without missing-module or Metro resolution errors.
- No OAuth callback URL, access token, refresh token, URL fragment, query string,
  email address, API key, or credential is printed in application logs.

## 2. Build gate

Create a clean Android internal-distribution build using the EAS `preview`
profile. Install the resulting APK on at least one physical device. Before Play
Internal Testing, create the production AAB and confirm its application id is
`com.shiftsnap.app`.

Check the generated Android manifest:

- Camera and calendar permissions are present.
- Notification permission is present when required; exact-alarm special access
  is not requested.
- Microphone permission is absent.
- No obsolete broad storage permission is added by app configuration.

## 3. Device matrix

Required:

- Pixel or Android Emulator on Android 16 / API 36.
- Samsung device on Android 14 or newer.
- A device or emulator using gesture navigation and one using three-button
  navigation.
- iPhone on iOS 17 or newer for regression coverage.

Recommended before production:

- Android 10 or older supported-device smoke test.
- Large-font accessibility setting and dark mode on both platforms.
- Traditional Chinese and English device locales.

## 4. Authentication

### Android

1. Launch from a clean install.
2. Confirm Google is the only non-guest sign-in option.
3. Confirm no email/password, password reset, or Apple sign-in controls appear.
4. Complete Google sign-in and verify the `shiftsnap://` redirect returns to
   IShift.
5. Cancel the Google browser flow and confirm the app remains usable.
6. Sign out and sign back in; verify the same IShift user and schedules return.

### iOS

1. Confirm Apple and Google are the only non-guest sign-in options.
2. Test Apple sign-in with normal email sharing and Hide My Email.
3. Test Google sign-in and cancellation.
4. Verify signing in with a linked Apple/Google identity reaches the same IShift
   account rather than creating a duplicate.

## 5. Schedule ownership and sharing

1. Account A uploads and recognizes a multi-person monthly schedule.
2. Account A claims one person's row.
3. Confirm Account A cannot claim a second row in that schedule.
4. Account B joins through the supported sharing/group flow and claims another
   row from the same schedule.
5. Confirm both accounts can access the same schedule while each sees their own
   claimed shifts.
6. Confirm both accounts may claim the same row, while replacing a claim changes
   only the caller's selection.
7. Attempt a direct membership update of either claim field through the data API;
   verify it is rejected and does not grant shift-edit access.
8. Confirm an uploader adding or editing a shift for another member does not
   change that member's existing claim.
9. Test an OCR schedule with duplicate display names mapped to different people;
   verify the claim is rejected as ambiguous and the previous claim remains.
10. Cancel a claim. Confirm personal views refresh, no canonical shifts are
    deleted, and existing device-calendar events remain until manually removed.

## 6. Device calendar

Run on both Google Calendar and Samsung Calendar providers when available:

1. Grant calendar access and list only writable destination calendars.
2. Select a local calendar; sync the current month and confirm events appear.
3. Select a Google-backed calendar; sync and confirm the events reach the
   selected account after provider synchronization.
4. Relaunch IShift and confirm the destination selection persists for the same
   signed-in user.
5. Test each content filter: all days, workdays only, and days off only.
6. Change a shift and confirm the current month's event is updated rather than
   duplicated.
7. Remove synchronized events for the current month. Confirm other months,
   unrelated calendar events, and the in-app schedule are unchanged.
8. Revoke calendar access and confirm IShift shows a recoverable permission
   error without deleting its schedule data.

## 7. Notifications

1. Enable reminders on Android 13+ and confirm the permission prompt appears.
2. Confirm the `IShift shift reminders` notification channel exists.
3. Schedule a reminder a few minutes ahead and verify delivery and sound.
4. Verify reminder delivery is treated as best-effort; the app must not request
   Android exact-alarm special access.
5. Change reminder lead time and confirm old reminders are cancelled before new
   ones are scheduled.
6. Disable reminders and verify pending IShift reminders are removed.
7. Reboot the device and verify expected future reminders remain scheduled.

## 8. Camera and image picker

1. Deny, then grant, camera permission and scan a schedule.
2. Select JPEG, PNG, HEIC/HEIF, portrait, landscape, and rotated images.
3. Enable Android developer option **Don't keep activities**, pick an image, and
   verify IShift recovers the pending result exactly once.
4. Cancel camera and gallery flows; confirm no stale preview or duplicate OCR
   request appears.
5. Confirm Android never requests microphone permission.

## 9. Android UI and lifecycle

1. Inspect every auth, tab, scan, review, modal, and legal screen with gesture
   navigation. No control may sit under the status or navigation bars.
2. Rename a group as an admin using the text-input modal; confirm non-admins
   cannot rename it.
3. Open calendar filter, reminder lead-time, calendar destination, and group
   switch lists. Every option must be reachable on Android.
4. Exercise Android Back from camera, review, modal, authentication browser, and
   each tab. It must dismiss the topmost surface without losing saved work.
5. Test keyboard opening/closing, rotation handling, dark mode, large text, and
   both supported languages.

## 10. Schedule photo authorization and scope races

1. Upload a roster as Account A and confirm its Storage object is under
   `Account A user id/schedule_...`; a different signed-in account must not be
   able to open or sign that object by guessing its path.
2. Verify Account A, an accepted schedule-sharing recipient, and a member of
   the schedule's group can open the monthly roster photo. Verify a user who is
   none of these receives no image.
3. Confirm an old flat-path image remains visible only while an authorized
   schedule references that exact path; an unreferenced legacy object must not
   be readable.
4. Open the calendar image, then rapidly change month, group scope, and account.
   The viewer must close or show only the final scope's photo—never a late image
   or signed URL from the previous scope.
5. Repeat with a historical signed/public/authenticated Supabase Storage URL in
   a schedule record. The app must obtain a new signed URL and must not write
   that temporary URL back to the schedule record.
6. Upload a new roster and verify the upload returns successfully before its
   schedule row is created; the uploader may read only their own prefixed
   object during this short interval.
7. As Account B, create a forged schedule reference to Account A's object path
   (or legacy Storage URL). Confirm it cannot make Account B read or sign
   Account A's object because the Storage object owner must match the schedule
   owner.

## 11. Release evidence

Record the following in the release task:

- Commit SHA and EAS build URL/ID.
- Android artifact type and version code.
- Device models and OS versions tested.
- Automated command results.
- Calendar providers tested.
- Known deviations, with owner and follow-up date.

Only promote the build to Play Internal Testing after every required section is
green or an explicit release exception is documented.
