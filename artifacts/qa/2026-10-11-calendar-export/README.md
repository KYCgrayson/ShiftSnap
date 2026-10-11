# 班表日曆匯出驗收 — 2026-10-11

## 結果

本次實作完成：設定 → 班表日曆，可改名（新使用者預設 IShift）、選八種色票、選班次內容/標題/提醒；檢查摘要後才套用。既有同步入口共用確認流程。同一目的地以 ID 保存，改名改色不建立另一個日曆。舊目的地若可能是個人日曆，不會默默接管；沿用須明確確認整本日曆影響。

## 實際驗證

| 情境 | 結果與證據 |
|---|---|
| 修改草稿、摘要後取消 | `baseline.json` 與 `after-cancel.json` 的全部日曆/測試事件完全相同；重開顯示舊 IShift/藍綠色/姓名在前 |
| 正式改名改色 | `renamed-blue.json`：工作、#4a90e2；日曆 UUID 4BC88A19-8B84-437D-903E-C9A5BB2ECF54 沿用；總日曆數 10 不變 |
| 班別在前 | 3 筆均為 `Day shift (D) · Alex QA`；原本事件 UUID 保留 |
| 重複確認同步 | `repeated-sync.json` 與改名後相同，無重複事件 |
| 確認後冷啟動 | UI 顯示工作、藍色、班別在前；未重置儲存或重灌 |
| 後端 503 冷啟動 | `03-offline-coldstart.png` 顯示離線唯讀與已儲存班次 |
| 離線匯出 | `04-offline-export-blocked.png` 顯示恢復連線提示；原生資料快照完全不變 |
| 離線登出再冷啟動 | `05-offline-logout-restart.png` 顯示歡迎頁，未還原舊帳號；測試 run ID 不變，未重新注入身份 |

截圖：`01-confirmation.png` 是真實原生摘要；`02-settings-blue.png` 是套用後設定（截圖包含文字選取浮層）。`artifacts/design/` 是較早設計探索，不是實機驗收。

驗證發現並修正 SecureStore 身份/登出標記含冒號的問題。原生 SecureStore 只接受字母數字、點、連字號和底線；改為點分隔後上述離線冷啟動/登出流程通過。AsyncStorage keys 未變。

## 可重跑證據

從 repo root 執行：

```sh
python3 scripts/qa/verify-calendar-export-evidence.py
pnpm typecheck
node apps/mobile/tests/calendar-reconcile.integration.mjs
node apps/mobile/tests/offline-auth-coldstart.integration.mjs
node apps/mobile/tests/offline-read.integration.mjs
```

快照比較 `verification.json` 全通過。既有整合檢查 7 日曆 + 7 身份 + 8 快取 = 22 項通過，結果位於 `apps/mobile/tests/artifacts/`；其原生/網路邊界為 mock，不能替代上方原生 E2E。`pnpm typecheck` 通過；lint script 是 placeholder，未宣稱 lint 通過。

重跑原生流程：使用專用模擬器 C03ECA22-BBD2-4CA9-837B-330A788CADF7、`scripts/qa/native-fixture-server.mjs`（port 55439）及 `apps/mobile/tests/native-reliability.entry.js`。另選新的 QA_RUN_ID 可開始新一輪；同一輪所有重啟必須維持相同 ID。用 CUA 操作設定、摘要取消/確認，逐段執行 `python3 scripts/qa/snapshot-native-calendar.py LABEL` 取得唯讀快照。fixture `/qa/mode` 設定 `{"offline":true}` 回傳 503，再重開、嘗試匯出、登出、重開。HTTP 請求證據在 `native-http-boundary.json`，只包含合成資料與路徑。

本輪 JS bundle SHA-256：`cbb9d869079cfe30d7eb779e48938fee08cba3cf15dafefe69e7b19a89567dc6`。

## 驗證邊界

- 真實 iOS 26.5 模擬器 EventKit/Calendar 資料、SecureStore、AsyncStorage 與 UI；使用合成 localhost 後端，並非正式 Supabase 停機測試。
- 使用既有相容 Release 原生殼搭配本次新 bundle（2075 modules），未新增原生依賴；不宣稱重新完成 Xcode 原生編譯。
- 本輪重點是舊 IShift 目的地明確沿用、改名改色與無重複；全新建立、OS 寫入拒絕、權限拒絕、所有色票、零筆清理未逐一做原生操作。
- iOS 提供選色；Android 既有日曆改色受供應者限制，UI 停用此功能。沒有 Android/實體手機驗收。
- 未發布 TestFlight。
