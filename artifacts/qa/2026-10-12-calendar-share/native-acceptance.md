# Calendar share native acceptance — 2026-10-12

Status: Native share acceptance PASSED on 2026-10-13; release build/upload tracked separately.

Environment: dedicated IShift Reliability QA simulator, iOS 26.5, synthetic HTTP backend 127.0.0.1:55439. No production account data or physical phone used. Repeat using scripts/qa/README.md and calendar-share-fixture-scenarios.md.

Observed through Simulator UI:
- Signed Release build starts and authenticates synthetic Alex QA; unsigned test build had SecureStore failure, resolved with Xcode-managed simulator signing.
- October PNG generated and native share sheet opened. `october-gentle.png` contains dates 1–31; 6/21 blank; explicit days off; both October 12 shifts; full long October 17 label and times; logo. No private notes, photos, coworker/reference entries, download link or QR.
- After simulator cold boot October gentle remained “按自己的步調就好”.
- Toxic October was “放假要好好珍惜，畢竟只是暫時不用上班。”; retapping selected mode kept share enabled.
- None mode showed “我的班表”; see october-none-preview.png.
- November preserved selected toxic mode and advanced to “薪水雖然不多，但工作很願意多給你一點。”; see november-toxic-preview.png.
- Switching November to gentle independently advanced to “認真工作，也好好休息”.
- Native sheet dismissal restored preview/share button without a success claim (twice).
- August six-week preview contained all 31 days, starting Saturday and ending Monday; August gentle “今天，留一點時間給自己”. See august-six-week-preview-before-inset-fix.png.

Found during QA: preview header intrudes on status bar/Dynamic Island. Fixed using parent safe-area insets on modal root; typecheck passed. Post-fix native build passed and live screenshot october-preview-inset-fixed.png confirms title/close below status bar and share button above home area. Poster scrolls within remaining viewport.

Save Image reached add-only permission before interruption. User explicitly authorized it on resumption, but system share controls currently cannot be clicked: coordinate CUA calls return noWindowsAvailable while AX actions and screenshots work. No Save Image success asserted. User asked to unlock/display simulator; pending.

Release follow-up: production build environment isolation and build/upload receipt. Existing automated checks (25) and typecheck passed earlier; those are not substitutes for native acceptance.

## October 13 final acceptance

The coordinate-control blocker cleared when the user returned. Settings showed Photos=None; after applying the explicitly authorized Only Add Photos permission in the dedicated simulator UI, Save Image reappeared. Tapped Save Image in the native share sheet. Read back DCIM/100APPLE/IMG_0007.PNG as oct13-photos-saved.png (1122 x 2100) and inspected the complete calendar and footer. No cropping or private fixture content. Native save passes.

The synthetic one-hour login expired overnight; restarted fixture server and used documented new run ID calendar-share-20261013, preserving quote preferences and native permissions. October quote remained unchanged. The HTTP boundary log is the current run only; earlier UI observations are preserved above and in screenshots.

Limits: simulator with synthetic backend, not physical-device or production-auth acceptance. The deliberately extreme long English label wraps and expands its week; no content is lost. Not every OS failure was force-injected. Existing 25 regression checks and typecheck passed; no fake lint script counted.
