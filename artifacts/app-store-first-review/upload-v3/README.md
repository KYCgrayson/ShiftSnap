# IShift 上架截圖 v3（2026-11-09）

iPhone 6.9 吋（`zh-Hant/iPhone-6.9/`，1320 × 2868）傳到大尺寸 iPhone 欄位，Apple 會自動縮給較小的 iPhone。iPad 13 吋（`zh-Hant/iPad-13/`，2064 × 2752）傳到 iPad 欄位。兩組都是 RGB JPG，各 5 張。資料全部來自合成 fixture（`scripts/qa/store-screenshot-fixture.mjs`）。

1. 01-welcome：歡迎頁（沿用 v2）
2. 02-home：首頁今天的班
3. 03-calendar：日曆打開「顯示班別代碼」，每天標出 A／B／N／休
4. 04-share：分享預覽，短句選「毒舌」、勾選「顯示班別名稱」
5. 05-shift-codes：班別代碼

重拍方式同 `upload-v2/README.md`，腳本已更新（`scripts/qa/store-screenshots/StoreShotsTests.swift`）。重拍前要先移除再重裝 App，不然舊的登入狀態會讓 App 進入離線模式。時間顯示是修正後的「07:00」，要搭配 Build 16 送審。
