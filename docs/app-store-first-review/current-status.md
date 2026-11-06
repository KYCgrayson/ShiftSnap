# IShift 送審交接：2026-11-06
這是目前狀態；submission-checklist.md 的產品問題是 **Build 14 的查核基線**，不是新版驗收結論。

## 已驗證的聯絡資料（11 月 6 日）
- 公開客服及 App Review 聯絡信箱：appai@appai.info。個人 Gmail 與此地址已實測雙向收發。
- Support URL：https://appai.info/ishift/support.html
- Privacy Policy URL：https://appai.info/ishift/privacy.html
- 兩頁均可匿名存取，HTTP 200，內容與 AppAI 主線 1f95319 的發布檔案一致。已在 App Store Connect 另一分頁讀回 Support URL，並在隱私頁重新載入後讀回 Privacy Policy URL。

## Apple 草稿（11 月 6 日 Safari 實查）
- Apple ID 6760009299，繁中，iOS 1.0「準備提交」。未選建置，未送審。勿使用先前未儲存的分頁覆蓋現況。
- 審查聯絡人依使用者授權沿用 ChefChef 的姓名、電話；信箱 appai@appai.info。重新載入後四欄逐一比對相符。備註（訪客、掃描 2026 年 9 月合成班表、同步）亦從版本頁重新讀回。專用 IShift 登入資料未填。
- 名稱「IShift 班表掃描與輪班日曆」、副標題「拍下紙本班表，用原始代號看班次」：Apple 顯示已儲存。主要類別「生產力工具」。已讀回繁中宣傳文字、原描述、關鍵字、支援網址；新版描述定稿見 metadata.md。
- Apple 媒體管理：必填中型 iPhone 欄列出 01-Calendar-detail.jpg、02-Share-preview.jpg；大型 iPhone 沿用既有素材。13 吋 iPad 欄列出 01-IShift-Home.jpg（1 張）。審查附件為 IShift-Demo-Roster-September-2026.png。
- 年齡分級依負責人逐項確認，Apple 計算並儲存 4+（部分地區可能不同），非兒童類別。公開版權 2026 IShift 已填並按儲存。初始定價 0.00，已確認；供應頁已列 175 個國家或地區、於發佈時供應。已選取核准後手動發佈並按儲存；畫面仍顯示手動選中，尚未完成跨分頁讀回。新版描述未確認已貼入 Apple。
- 內容權利聲明與 App 隱私標籤另行審閱。公開政策 URL 與標籤是獨立欄位。
首版群組行為已決定：保留目前目的地，送出前清楚顯示群組名稱及成員可見的班次、原始照片。新版提示不在 Build 14。

## 已修正、尚未在商店建置中
- 不再把登出當刪除：使用者可在 App 提出本人刪除申請、取得編號、查詢處理狀態。非即時抹除；實際處理須由營運人員依 account-deletion-operations.md 執行，並通知完成。
- 每次辨識或重新分析前說明圖像、提示、班別資料和 Google Gemini；取消時不進入該次傳送流程。
- 真實客服收件與回執、失敗保留草稿、登入前的隱私連結修正、中英政策更新；移除未證實的一年與零留存保證。
## 你需要準備
1. App Review 私人欄位：專用 IShift 審核帳號，確認可登入、不需人工協助驗證。密碼只填 Apple 專用欄。
2. 核實內容權利及正式環境隱私揭露（包括客服資料、診斷、第三方與追蹤）。
3. 指定客服及刪除申請處理人，確認可遵守介面寫的最長 30 日、案件保留期限、通知方式及正式服務的資料處理政策。
## 工程待辦
兩份 migration 尚未部署到正式環境。先在非正式 Supabase 走一次完整處理（含 Storage API、群組轉移、Apple 登入權杖處理、通知），完成手機端驗收，取得新版 TestFlight 核准後建置、上傳。選修復後的新 build，不選只有舊行為的 14。最後由負責人送審。

## 本次验证记录
- pnpm typecheck、git diff --check：通过。正常 expo-router 入口 iOS release JS/Hermes bundle：成功输出（隔离测试环境；非 IPA 上传证明）。
- 47 项 PostgreSQL 整合验证通过，涵盖两份 migration、本人权限、并发处理、限流、移交群组与完成收据。可重复执行的结果在 artifacts/qa/2026-11-05-review/。

## iOS 27 啟動驗證（11 月 6 日）
修正前，本機 SDK 27 模擬器版本 1.0.0 (1) 兩次在 UIKit 建立第一個畫面時觸發 SIGTRAP。使用者貼出的報告來自其中一次，堆疊指向缺少 scene lifecycle。使用者另確認其 iOS 27 實體 iPhone 可開啟 TestFlight Build 14。

本機候選版本已改用 UIWindowScene 啟動 React Native。使用一般 App 入口的 iPhone 模擬器測試已完成冷啟動、註冊及登入入口、背景返回、冷啟動及前景的自訂連結、訪客進入及重開。首次歡迎頁包含匯入、核對、匯出三步。這份驗證的範圍及截圖在 [QA 紀錄](../../artifacts/qa/2026-11-06-scene-welcome/)。新版實體手機驗收及 TestFlight 上傳仍待辦。

iOS 27 iPhone 和 iPad 模擬器均已實際顯示繁中歡迎頁。iPhone 在設定切換為英文後，重開仍顯示英文。[iPhone 截圖](../../artifacts/qa/2026-11-06-scene-welcome/iphone-welcome-zh.png) · [iPad 截圖](../../artifacts/qa/2026-11-06-scene-welcome/ipad-welcome-zh.png)

審查範例圖片在同意辨識後曾停在讀檔。現在直接讀取本機照片，並用同一份內容辨識及儲存。iPhone 原生流程已實測群組提示、取消零寫入、同意後送往指定群組，以及開啟人員核對頁。合成測試使用 localhost 模擬 Supabase 與 OCR 回應，正式服務及新版實機仍待驗收。[重現步驟](../../artifacts/qa/2026-11-06-scene-welcome/reproduction.md)
