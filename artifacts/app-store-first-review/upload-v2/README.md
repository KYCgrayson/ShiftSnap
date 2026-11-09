# IShift 上架截圖 v2（2026-11-09）

取代 `upload/` 的舊截圖。全部是 iOS 27 模擬器上的真實 App 畫面，資料來自本機合成 fixture（`scripts/qa/store-screenshot-fixture.mjs`，使用者「王小明」、群組「示範團隊」），沒有用到任何正式帳號或資料。

| 欄位 | 資料夾 | 尺寸 | 張數 |
|---|---|---|---:|
| iPhone 6.9 吋（必要） | `zh-Hant/iPhone-6.9/` | 1320 × 2868 | 4 |
| iPad 13 吋（必要） | `zh-Hant/iPad-13/` | 2064 × 2752 | 4 |

順序：01 歡迎頁（三步驟）→ 02 首頁（今天的班）→ 03 月曆與當日班次 → 04 班別代碼。全部是 RGB JPG，沒有透明通道。

## 怎麼重拍

1. `node scripts/qa/store-screenshot-fixture.mjs`（綁定 127.0.0.1:55439）
2. 在 `apps/mobile/ios` 用 QA 入口 build 模擬器版本：`ENTRY_FILE=<repo>/apps/mobile/tests/native-reliability.entry.js EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55439 EXPO_PUBLIC_SUPABASE_ANON_KEY=local-qa-only EXPO_PUBLIC_QA_RUN_ID=<新值> EXPO_PUBLIC_QA_LOCALE=zh-TW xcodebuild -workspace ShiftSnap.xcworkspace -scheme ShiftSnap -configuration Release -sdk iphonesimulator -derivedDataPath <dir> IPHONEOS_DEPLOYMENT_TARGET=15.1 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build`
3. 安裝到 iPhone 18 Pro Max 和 iPad Pro 13 吋（M5）模擬器，系統語言設成 zh-Hant-TW，狀態列設成 `simctl status_bar … --time 9:41`。
4. 把 `scripts/qa/store-screenshots/` 複製到暫存資料夾，執行 `ruby project.rb`，再跑 `xcodebuild test -project StoreShots.xcodeproj -scheme StoreShots -destination id=<UDID>`，最後用 `xcrun xcresulttool export attachments` 匯出截圖。
5. 歡迎頁沿用 `artifacts/qa/2026-11-06-scene-welcome/iphone-welcome-zh.png`、`ipad-welcome-zh.png`（未登入的一般入口才看得到）。

## 注意

- 02、03、04 的時間顯示成「07:00」，是 2026-11-09 修正後的畫面。**Build 15 顯示的是「07:00:00」**，所以這組截圖要搭配包含時間修正的 Build 16 送審。
- 04 班別頁下方的「常用代碼」建議清單是英文說明（`packages/shared/src/constants/config.ts:52`，App 本身的在地化缺口）。不想讓審查員看到的話，可以只上傳 01–03。
- iPad 版面留白很多，這是 App 目前的實際樣子。
- 分享預覽畫面這次沒有拍到（自動化測試點錯按鈕），之後可以補。
