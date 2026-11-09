# ops #48｜iShift 送 App Store 審查前盤點（2026-11-08）

- 範圍：只盤點，不修改程式、不上傳、不動 App Store Connect。
- 儲存位置：這台 MacBook（`MacBookPro`）沒有 `~/GitHub/ops`（`ls: /Users/grayson/GitHub/ops: No such file or directory`），所以 run log 依規定放在這裡。市調檔 `ops/runs/2026-11-08-ishift-market-research.md` 在這台電腦讀不到，本次沒有引用。**環境缺口：MacBook 沒有安裝 ops**。為了能用手機遙控所有機器，需要另外把 ops 裝到 MacBook，再把這份 log 搬到 ops 的 `runs/`。
- 盤點對象：`development` = `main` = `origin/*` = `8abf513`。Build 15 的來源是 `c218649`。`git diff --stat c218649 8abf513` 只改了 `supabase/`、`scripts/`、`docs/`、`artifacts/`，**`apps/mobile` 沒有任何變更**，所以 Build 15 就是目前要送審的 binary。
- 工具限制：Supabase、Sentry、Mixpanel MCP 都因 keychain 鎖住而無法連線；`security find-identity` 回傳 `0 valid identities found`（同樣是 keychain 鎖住）。正式資料庫設定與 App Store Connect 後台沒有即時讀回；後台狀態引用 `docs/app-store-first-review/current-status.md`（11/6–11/7 Safari 實查紀錄）。

## 結論

共 11 項，每項只標一個主狀態：**（11/9 更新）好了 6 項（#1、#2、#3、#5、#9、#11）、缺 5 項（#4、#6、#7、#8、#10）、要老闆決定 0 項**。11/8 初版是好了 3、缺 8（11/8 老闆已決定 Gemini 方案、刪除期限、處理人與紀錄保留方式，見下方）。有些「缺」的項目也需要老闆配合決定，列在表格最後一欄。

最該先做的三件事：
1. **修 OCR「處理中」等很久的問題，再出新 build**（第 11 項）。審查員一定會掃描範例班表；如果一直轉圈或逾時，很可能被以 2.1（App 完整性）退件。修好後要出 Build 16，並重新驗收實機。**已另開 ops #51，由總窗口在 Studio 處理。**
2. **在 App Store Connect 填審查專用測試帳號，並完成 App Privacy 問卷**（第 7、6 項）。掃描必須登入，目前沒有測試帳號。問卷完全沒填，就不能送審。Gemini 方案已確認為付費方案（見下方「11/8 老闆決定」），可以照付費方案填寫。
3. **刪除帳號：規則都已決定（30 日內、老闆本人處理、只留匿名收據）；剩下修好通知信，並用測試帳號完整跑一次刪除流程**（第 8 項）。

### 11/8 老闆決定（由總窗口轉達，已記進 ops backlog #48）

老闆原話：「我的 Gemini 是付費方案，删除账号要三十天内处理。」
- Gemini API 用付費方案：App Privacy 問卷和隱私權政策照付費方案寫。依 Gemini API 付費服務條款，Google 不會用送出的內容改善產品。帳單頁沒有由 agent 獨立核對，這點依老闆口述。
- 刪除帳號承諾 30 日內處理：已核准，與 App 內文字（`en.ts:299`「up to 30 days」）一致。
- **紀錄保留已決定（11/8 老闆原話）：「只留匿名收據」**。完成刪除後，只保留 `account_deletion_requests` 的案件編號、狀態與時間。依 migration `20261105000002_account_deletion_requests.sql:3–4`，這張表本來就不存 email 或訊息，只留下已刪除帳號、無法再對應到任何人的 `user_id`。處理時還要清空 `operator_note`，並在完成通知送出後清除 `request_mail.outbox` 裡的聯絡快照（`docs/support-and-deletion-guide.zh-TW.md:40`）。
- **處理人已決定（11/8 老闆原話）**：「现在申请是用户申请，然后他会发信给我自己去手动去 Superbase…因为现在也没有用户，我预设应多有用户的情况不太好。」由老闆本人處理：用戶在 App 申請 → 管理通知寄到 appai@appai.info → 老闆照 `docs/support-and-deletion-guide.zh-TW.md` 在 Supabase 手動刪除，並把 `status` 改成完成。這跟 11/7 的設計（`docs/plans/2026-11-07-support-deletion-delivery.md:7`、`:31`）一致，不另外設計多人分工。
- **前提缺口**：通知信目前還寄不出去（Resend 金鑰 401，排程未啟用）。修好之前，老闆收不到申請通知，只能定期在 SQL Editor 執行 `scripts/admin/request-inbox.sql` 查看有沒有新申請。
- 掃描太慢：另開 ops #51，由總窗口在 Studio 測試，本 run log 不處理。
- **自家 App 推廣（11/9 老闆決定：「等 1.0.1 再加」）**：首版送審不放。1.0.1 在設定頁加「我的其他 App」區塊，點了開 App Store 頁面，不接廣告 SDK、不追蹤用戶，所以 App Privacy 問卷不用改。前提是被推廣的 App 已經上架。老闆提到「鑑寶快追蹤」與「shift shift」，正式名稱與 App Store 連結到 1.0.1 再確認。

## 11/9 進度（老闆要求「把還沒做完的事情做一做」）

在 MacBook 上完成、沒有動到任何正式資料：
- **#1 本機 archive**：`xcodebuild … archive CODE_SIGNING_ALLOWED=NO IPHONEOS_DEPLOYMENT_TARGET=15.1` → `** ARCHIVE SUCCEEDED **`。原本的錯誤只是 Pods 的部署目標太舊，用命令列覆寫就好；`ios/` 被 gitignore，所以沒改檔案。正式簽章仍走 EAS。
- **App 修正（新發現）**：日曆詳細頁、班別頁、首頁今日卡片、首頁「即將到來的班次」都把資料庫時間直接顯示成「07:00:00」。新增 `formatShiftTimeRange`（`packages/shared/src/utils/index.ts`），改顯示「07:00 - 15:00」。`pnpm typecheck` 通過，模擬器畫面已確認。**這需要出 Build 16 才會到用戶手上。**
- **#3 截圖**：`artifacts/app-store-first-review/upload-v2/` 有 iPhone 6.9 吋 4 張、iPad 13 吋 4 張（歡迎頁、首頁、月曆、班別），尺寸符合規格，RGB JPG。使用中文合成資料（王小明、早班／小夜／大夜／休假）。重拍工具在 `scripts/qa/store-screenshot-fixture.mjs` 和 `scripts/qa/store-screenshots/`。
- **#4、#6、#7 貼上稿**：`docs/app-store-first-review/asc-paste-sheet.md` 照 App Store Connect 的頁面順序整理了說明文字、App 隱私問卷逐格答案、英文審查備註，以及隱私權政策建議補充的兩句話。實際貼上和儲存要老闆自己來，所以這三項仍標「缺」。
- 新發現、未修：班別頁的「常用代碼」建議清單只有英文說明（`packages/shared/src/constants/config.ts:52`）。

## 逐項清單

| # | 項目 | 狀態 | 一句話 | 需老闆決定或配合的事 |
|---|---|---|---|---|
| 1 | Xcode archive | 好了（11/9） | 加上 `IPHONEOS_DEPLOYMENT_TARGET=15.1` 後，本機 archive 成功；正式出包仍走 EAS | 是否需要能在本機 archive |
| 2 | Bundle ID／版本／build／簽章 | 好了 | `com.shiftsnap.app` 1.0.0 (15)，由 EAS 遠端管理憑證 | — |
| 3 | 截圖 | 好了（11/9） | `upload-v2/` 每個必要尺寸 4 張，要搭配 Build 16 | 是否上架英文版 |
| 4 | 名稱／副標／說明／關鍵字／支援網址 | 缺 | 已存在後台；新版說明文字還沒確認貼入 | — |
| 5 | 隱私權政策網址 | 好了 | HTTP 200，內容如實寫出 Gemini | 營運者名稱、保存期限（建議補） |
| 6 | App Privacy 問卷 | 缺 | 還沒填；下方有建議答案 | 已確認付費方案（11/8），只剩實際填寫 |
| 7 | 審查備註與測試帳號 | 缺 | 備註已填，專用登入帳號未填 | 建立帳號，並親自把密碼填進 Apple |
| 8 | 刪除帳號流程 | 缺 | 規則已全部決定（11/8）；還缺通知信（Resend 401）與完整刪除演練 | 已決定：30 日內、老闆本人處理、只留匿名收據 |
| 9 | 群組分享隱私說明 | 好了 | App 內上傳前有明確提示；網站政策可以再寫清楚 | — |
| 10 | 首次啟動畫面 | 缺 | 模擬器已驗證；Build 15 的實機畫面還沒驗收 | 需要有人拿實機開一次 |
| 11 | 已知問題：OCR 處理很久 | 好了（11/9，ops #51） | 正式環境改用 gemini-3.6-flash 加 thinking low，每次 8～12 秒；不需要新 build | — |

---

### 1. Xcode archive｜缺

證據：
```
cd apps/mobile/ios && xcodebuild -workspace ShiftSnap.xcworkspace -scheme ShiftSnap \
  -configuration Release -destination 'generic/platform=iOS' archive CODE_SIGNING_ALLOWED=NO
→ Pods.xcodeproj: error: The iOS deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to 12.4,
  but the range of supported deployment target versions is 15.0 to 27.0.x. (target 'RNSVG-RNSVGFilters')
  （另有 RNCAsyncStorage 13.4、SDWebImage 9.0）
** ARCHIVE FAILED **  EXIT=65（Xcode 27.0 / 27A266a，9.5 秒內失敗）
```
- `apps/mobile/ios/` 在 `.gitignore` 裡（`apps/mobile/.gitignore:2:ios/`），是舊的本機 prebuild 產物。Pods 的 resource bundle target 還停在舊的部署目標，Xcode 27 不接受。
- 正式出包走 EAS 雲端（`apps/mobile/eas.json` 的 `production`，`appVersionSource: remote`，`autoIncrement`）。Build 15（EAS `e8dc9e42-…`，來源 `c218649`）已成功上傳，並出現在 TestFlight 內部測試群組（`current-status.md`）。
- 影響：如果只用 EAS 出包，**不會擋送審**。但如果老闆要在本機用 Xcode archive，需要先 `npx expo prebuild --clean` 並重新 `pod install`（或在 Podfile `post_install` 裡把 Pods 的部署目標統一設為 15.1），再加上解鎖 keychain。
- 小缺口：Build 12–14 都有回執 JSON（`artifacts/qa/*/testflight-build1x-receipt.json`），Build 15 只有文件紀錄，沒有回執 JSON。

### 2. Bundle ID、版本號、build 號、簽章與 provisioning｜好了

- `apps/mobile/app.json`：`bundleIdentifier: com.shiftsnap.app`、`version: 1.0.0`、`appleTeamId: R9CKAABL8D`、`ITSAppUsesNonExemptEncryption: false`、`usesAppleSignIn: true`。
- `apps/mobile/eas.json:28` submit：`ascAppId 6760009299`（repo 根目錄另有一份 `eas.json`，它的 `submit.production` 是空的，沒有 ascAppId），團隊 R9CKAABL8D。build 號由 EAS 遠端遞增，目前最新是 15（git tag `testflight-1.0.0-15`）。
- 本機 `project.pbxproj` 顯示 `CURRENT_PROJECT_VERSION = 1`、`CODE_SIGN_STYLE = Automatic`、`Apple Development`，這只是本機 prebuild 的值，**不代表上傳的版本**，不用理會。
- 本機 provisioning：只有 `iOS Team Provisioning Profile: com.shiftsnap.app`（開發用，2027-03-03 到期），沒有 App Store 發佈用 profile。發佈憑證由 EAS 遠端管理，Build 15 能上傳，就表示簽章可用。
- 提醒：`ShiftSnap.entitlements` 裡有 `aps-environment: development`（expo-notifications 加的）。EAS 出 production build 時會依發佈 profile 處理；如果日後改用本機 archive，要檢查這一項。

### 3. 各尺寸截圖｜缺

| 欄位 | 檔案 | 尺寸 | 判定 |
|---|---|---|---|
| iPhone 6.9"（必要） | `upload/zh-Hant/iPhone-large/01-IShift-Home.jpg` | 1320×2868 | 規格正確，只有 1 張首頁 |
| iPad 13"（必要，因為 `supportsTablet: true`） | `upload/zh-Hant/iPad-13/01-IShift-Home.jpg` | 2064×2752 | 規格正確，只有 1 張；README 說「iPad 大量留白」 |
| iPhone 6.3"（選填） | `iPhone-medium-optional/01-Calendar-detail.jpg`、`02-Share-preview.jpg` | 1206×2622 | 已在後台 |

- 實際看過 `01-Calendar-detail.jpg`：繁中介面裡出現英文「Afternoon shift」，時間顯示成「09:00:00 - 17:00:00」（多了秒數，而且「下午班」配 9–17 點，看起來不合理），最下方還有被切掉的「• 一」。首頁截圖也有合成的「Alex QA」，以及中英混雜的班別（`artifacts/app-store-first-review/README.md`）。
- 都是 Build 14 以前拍的，沒有拍到 Build 15 新的三步歡迎頁（`artifacts/qa/2026-11-06-scene-welcome/iphone-welcome-zh.png` 可以作為素材）。
- 只有繁中，沒有英文版。如果英文在地化也要上架，就需要另一組截圖。
- 至少一張就能送審，但建議每個必要尺寸都補到 3–5 張：歡迎頁、核對頁、月曆、匯出、分享，全部用合成資料。

### 4. App 名稱、副標、說明、關鍵字、支援網址｜缺

- 後台已儲存（`current-status.md`，11/6 Safari 讀回）：名稱「IShift 班表掃描與輪班日曆」、副標「拍下紙本班表，用原始代號看班次」、類別「生產力工具」、繁中宣傳文字、原本的說明、關鍵字、Support URL。
- 稿件：`docs/app-store-first-review/metadata.md`，有繁中與英文，字數都在限制內。
- 缺：`current-status.md` 寫「新版描述未確認已貼入 Apple」。新版說明裡有群組成員可以看到原始照片的句子，比較誠實，應該貼進去。
- Support URL `https://appai.info/ishift/support.html`：`curl` 回 `200 1156B`，頁面有不需登入的聯絡信箱 appai@appai.info。

### 5. 隱私權政策網址｜好了

- `https://appai.info/ishift/privacy.html`：`curl` 回 `200 4278B`，中英雙語，更新日期 2026-11-05。
- 誠實要求有達到：「當你同意辨識，IShift 會透過 Supabase 服務將所選班表圖片傳送給 Google Gemini。」網站、App 內的 `apps/mobile/src/content/privacy.json` 都有寫，兩邊內容一致。
- `grep -rnE "不上傳|不會上傳|never upload|zero retention…"` 只在內部文件找到「已移除不實承諾」的紀錄，**對外文字沒有寫「班表不上傳」**。
- 建議補充（不擋送審）：營運者名稱、班表與照片的保存期限，以及一句「選取群組時，群組成員可以看到你上傳的原始照片」（見第 9 項）。

### 6. App Privacy 問卷｜缺（Gemini 付費方案已於 11/8 確認）

後台還沒填（`current-status.md`：「內容權利聲明與 App 隱私標籤另行審閱」）。建議依程式碼這樣填：

| Apple 類別 | 收集？ | 用途 | 與身分連結 | 追蹤 | 依據 |
|---|---|---|---|---|---|
| Contact Info → Email Address | 是 | App Functionality | 是 | 否 | Supabase Auth |
| Contact Info → Name | 是 | App Functionality | 是 | 否 | 顯示名稱；班表上的同事姓名 |
| Identifiers → User ID | 是 | App Functionality | 是 | 否 | 帳號 ID |
| User Content → Photos or Videos | 是 | App Functionality | 是 | 否 | 班表照片存在 Supabase Storage，並送 Gemini 辨識 |
| User Content → Other User Content | 是 | App Functionality | 是 | 否 | 班次、班別代號、筆記、群組 |
| User Content → Customer Support | 是 | App Functionality | 是 | 否 | 設定 → 幫助與支援（`support_requests`） |
| Diagnostics／Usage／Location／Contacts／Financial | 否 | — | — | — | `apps/mobile/package.json` 的 dependencies 沒有分析、廣告或崩潰回報 SDK（沒有 Sentry、Firebase、Mixpanel 等）。本機的 `ios/ShiftSnap/PrivacyInfo.xcprivacy` 是被 gitignore 的舊 prebuild 產物，只供參考，**沒有用 Build 15 的 IPA 驗證** |

- **Tracking：否**。沒有廣告 SDK，也沒有跨 App 追蹤。
- 行事曆：事件寫入裝置行事曆，伺服器不收集使用者的整本行事曆，所以不勾 Calendar 類別。
- **已決定（11/8）**：Gemini API 用付費方案。依付費服務條款，Google 不會用送出的內容改善產品，所以問卷與隱私權政策照付費方案寫。Gemini 仍然是處理資料的第三方服務，政策中「圖片會傳給 Google Gemini」的揭露必須保留。帳單頁沒有由 agent 核對，依老闆口述。建議在隱私權政策補一句「Google 不會用這些圖片改善其產品」，但要等網站更新，屬於對外發布，需要老闆批准。
- 另外要確認：`ocr-process/index.ts:250` 解析失敗時，會把最多 2000 字的模型回應寫進 log，可能含班表內容。如果正式 log 會保留，可以考慮在 Diagnostics 誠實揭露，或改成遮蔽後再記錄（這次不修）。

### 7. 審查備註與測試帳號｜缺

- 備註已填並讀回：訪客模式、掃描 2026 年 9 月合成班表、同步流程（`current-status.md`）。附件 `docs/app-store-first-review/reviewer-attachment/IShift-Demo-Roster-September-2026.png` 已在後台。
- 審查聯絡人：沿用 ChefChef 的姓名與電話，信箱 appai@appai.info，已讀回。
- **缺：專用 IShift 審查帳號**（`current-status.md`：「專用 IShift 登入資料未填」）。訪客模式不能掃描（metadata：「掃描與雲端儲存需要登入」），所以一定要提供。帳號要登入時不需要驗證碼，密碼只填在 Apple 專用欄，不能進 Git。
- 建議在備註補一句：「辨識約需 N 秒」，以及「辨識前會跳出 Gemini 同意視窗，請按同意」。

### 8. 刪除帳號流程｜缺（規則已於 11/8 全部決定，還缺下方的工作）

- App 內入口：`apps/mobile/app/(tabs)/settings.tsx:454–470` 會呼叫 RPC `request_account_deletion`，`:190` 用 `get_my_account_deletion_request` 查詢狀態。確認文字：「…may take up to 30 days」（`src/i18n/locales/en.ts:299`）。
- 後端：migration `20261105000002_account_deletion_requests.sql` 已部署到正式環境，並用 10 項正式 HTTP 檢查驗證（`artifacts/qa/2026-11-07-support-deletion/production-rpc.json`）。
- 這是「提出申請，再由人工處理」，Apple 允許這種做法，前提是要說明處理時間並通知完成（Apple「Offering account deletion in your app」）。
- 已核准（11/8）：30 日內處理（`docs/account-deletion-operations.md:9`、`:29` 要求的核准）。
- 處理人已決定（11/8）：老闆本人收通知，並在 Supabase 手動處理。
- 紀錄保留已決定（11/8）：只留匿名收據（做法見前面的「11/8 老闆決定」）。
- **缺**：
  - 完整刪除演練（Storage 照片、群組移交、Apple 登入 token 撤銷、完成通知）還沒做。
  - 完成通知信目前不能寄：Resend 金鑰回 401，排程也還沒啟用（`current-status.md`）。
  - Apple 登入 token 撤銷沒有實作（`account-deletion-operations.md:18`、`:31`），目前只能寄手動撤銷說明。

### 9. 群組分享功能的隱私說明｜好了

- 上傳前提示（`src/i18n/locales/zh-TW.ts:173`）：「將儲存至「{{group}}」。群組成員可查看原始班表照片及儲存的班次，不只你選取的個人班次。」`:420`、`:421` 在分享或移動班表時也有同樣的說明。
- Gemini 同意視窗（`zh-TW.ts:170`）有寫出 Supabase 儲存原始照片，以及傳給 Google Gemini。
- 模擬器證據：`artifacts/qa/2026-11-06-scene-welcome/02-selected-group-consent.png`（群組提示）、`04-network-summary.txt`（取消時沒有寫入任何資料）。
- 建議：網站隱私政策只寫了「群組成員關係…顯示及分享你管理的班表」，可以直接補上「群組成員能看到原始照片」。
- 風險：政策寫著「持有筆記照片檔案連結的人也可能開啟該照片」，表示筆記照片是用公開連結存取。這有如實揭露，但建議日後改成簽名網址（這次不修）。

### 10. 首次啟動畫面｜缺（實機驗收）

- Build 15 有三步歡迎頁（匯入、核對、匯出），另有「開始使用」、「登入」、「不建立帳號試用」，以及服務條款和隱私權政策連結（`app/(auth)/welcome.tsx:84–91`，隱私連結已改指向 `/(auth)/privacy`）。
- 證據：`artifacts/qa/2026-11-06-scene-welcome/iphone-welcome-zh.png`（這次實際看過）、`ipad-welcome-zh.png`。在 iOS 27 模擬器上，冷啟動、背景返回、訪客模式、切換英文都測過（`results.md`）。
- 修正了 iOS 27 缺少 scene lifecycle 導致的 SIGTRAP 閃退（`plugins/with-ios-scene-lifecycle`）。
- 還沒做：Build 15 的實機畫面驗收（`current-status.md`：iPhone 鏡像需要 Mac 解鎖）。需要老闆或負責人拿實機開一次。

### 11. 已知問題：掃描時「處理中」很久｜好了（11/9 由 ops #51 修好並上線）

- 11/9 10:58 經老闆批准上線：`ocr-process` v13 改用 `gemini-3.6-flash` 並設 thinking low；正式資料庫 `app_config.gemini_model` 從 `gemini-3-flash-preview` 改成 `gemini-3.6-flash`，`gemini_max_tokens` 維持 8192。程式在 PR #3（merge commit `4f06cff`）。
- 老闆用真實班表在正式環境跑 5 次：180 格每次 0 錯，每次 8.1～12.1 秒（以前 14～49 秒）。紀錄在 ops `runs/2026-11-09-51-scan-speed-deploy.md`。
- 這是伺服器端改動，不需要出新的 App build。資料一樣送給 Google Gemini 處理，隱私揭露不用改。
- 以下是 11/8 盤點時的原始紀錄：

根因證據：
- `supabase/functions/ocr-process/index.ts:13`：`const DEFAULT_MODEL = "gemini-3-flash-preview";`。也可以被資料庫 `gemini_model` 設定覆寫（`:57`、`:67`），但這次因 Supabase MCP 無法連線，**沒能確認正式環境的實際值**。
- `supabase/functions/ocr-process/generationConfig.ts:9–17`：預設模式沒有設 `thinkingConfig`，模型會用預設的思考程度（Gemini 3 預設是 high、動態）。只有 `accurate` 模式明確設了 `thinkingLevel: 'high'`，再加上 `MEDIA_RESOLUTION_HIGH`。
- `index.ts:166`：`fetch(geminiApiUrl…)` 沒有 `AbortSignal` 或逾時，只受 Edge Function 平台本身的時間上限約束。
- 重試會疊加：伺服器端最多 3 次（`index.ts:155` `MAX_RETRIES = 2`），客戶端 `app/(tabs)/scan.tsx:274–283` 也最多 3 次，所以最壞情況會呼叫 Gemini 9 次。客戶端的 `functions.invoke` 也沒有逾時。
- 另外，`gemini-3-flash-preview` 是 preview 模型，可能被調整或下架，正式上線用 preview 模型有風險。
- 建議修法（留給後續任務）：預設模式設 `thinkingLevel: 'low'` 或 `minimal`，Gemini fetch 加約 45–60 秒的逾時，客戶端加整體逾時並減少重複重試，改用正式版模型，然後出 Build 16 並實機量測辨識時間。

---

## 驗證方式（這次實際跑的指令）

- `git rev-parse origin/main origin/development HEAD` → 三者都是 `8abf513…`
- `git diff --stat c218649 HEAD` → 16 個檔案，沒有 `apps/mobile`
- `xcodebuild … archive CODE_SIGNING_ALLOWED=NO` → `ARCHIVE FAILED`，EXIT=65（log 在本機 scratchpad，沒有提交）
- `security find-identity -v -p codesigning` → 0 valid identities（keychain 鎖住）
- 解析 `~/Library/Developer/Xcode/UserData/Provisioning Profiles/*.mobileprovision` → com.shiftsnap.app 只有開發用 profile
- `curl -sSL` support、privacy 頁 → 都是 200，並讀出全文
- `sips -g pixelWidth -g pixelHeight` 截圖 → 尺寸如第 3 項表格
- 用 grep 和 sed 讀 OCR、刪除、同意視窗、歡迎頁的程式碼，行號如上

## 獨立審查

另一個沒看過盤點過程的 agent 對照 11 項清單審查。第一輪結果是 FAIL：抽查 11 處引用，9 處相符；必須修改的有混合狀態、第 10 項分類錯誤、`index.ts` 行號差 1、引用了舊 `ios/` 的 privacy manifest，以及 `eas.json` 路徑不明確。這 5 點都已照建議修正，並把第 1、4 項的可選建議一起改掉。第二輪審查 **PASS**。

## 這次沒做／做不到

- 沒有登入 App Store Connect 讀回目前後台狀態，後台狀態以 11/6–11/7 的文件為準。
- 沒有讀正式 Supabase 的 `gemini_model` 設定與 log（MCP 無法連線）。
- 沒有看 Gemini 帳單方案（需要老闆）。
- 沒有讀 ops 的市調檔（這台電腦沒有 ops）。

## 11/9 MacBook Codex CLI（D52）

- 這台 MacBook 沒有另外裝 Codex。用的是 ChatGPT.app 附的 CLI：`/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`。
- 已經在 `~/.local/bin/codex` 建 symlink，這個資料夾本來就在 PATH 裡（`~/.bashrc`、`~/.bash_profile`）。
- 版本：`codex-cli 0.167.0-alpha.3.2`。沿用既有的 `~/.codex/` 登入，沒有重新登入，也沒有讀取 auth.json。
- 實測：`codex exec --sandbox read-only --skip-git-repo-check -c model_reasoning_effort="xhigh" "Reply with exactly: ok"` 回傳 `ok`。輸出顯示 model gpt-6-astra、sandbox read-only、reasoning effort xhigh。
- 之後 iShift 的程式照 D52 交給 Codex（xhigh）寫。Claude 只做規劃和驗證。

## 11/9 送審準備（老闆要求「補完、送 TestFlight、填好資料」）

- 截圖：v3 已由老闆上傳完成。iPhone 6.9 吋和 iPad 13 吋各 5 張（`upload-v3/`）。
- App Store Connect 看不到 icon：IPA 裡有 icon（Assets.car 有 1024 的 AppIcon，CFBundleIcons 也正確），原因是版本頁還沒選 build。選了 Build 16 之後就會出現。
- 常用代碼中文化：Codex（xhigh）寫，Claude 驗證，`pnpm typecheck` 通過，commit 810d764。
- 隱私權網頁：Codex 改好、Claude 驗證 diff。appai 分支 `ishift-privacy-2026-11-09`（2c51a62）已推上去。直接推到 main 會上線正式網站，被安全規則擋下，等老闆或大管家合併。
- Build 16：EAS 已把 buildNumber 從 15 升到 16，但 production 的 Provisioning Profile 已過期，非互動模式沒辦法重新產生。這台 MacBook 沒有簽章身分，Xcode 也沒有登入 Apple 帳號。**要老闆本人登入 Apple ID 跑 `eas build --auto-submit`**。
- App Store Connect 文字資料：已做好 `apps/mobile/store.config.json`，老闆登入後跑 `eas metadata:push` 就能寫入。AI 自己跑時，EAS 會要求輸入 Apple ID。
- 老闆要做的完整步驟：`docs/app-store-first-review/boss-final-steps.md`（a940562）。
