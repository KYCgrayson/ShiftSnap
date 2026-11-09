# IShift 1.0 送審前，老闆本人要做的步驟（2026-11-09）

以下每一步都要用 Apple ID 登入或輸入密碼，所以 AI 不能代做。全部在 **MacBook Pro** 上做，在 `ShiftSnap/apps/mobile` 資料夾裡開 Terminal。

## 1. 出 Build 16 並送 TestFlight（約 25 分鐘）

```bash
cd ~/Code-development/GitHub/ShiftSnap/apps/mobile
eas build --platform ios --profile production --auto-submit
```

- 問到 Apple ID 就登入，並完成雙重認證。
- 問到「Provisioning Profile 過期，要不要重新產生」就選 **Yes**。原因是 EAS 上的發佈描述檔過期了，Build 16 卡在這裡。
- 問到 App Store Connect API Key 就選 **讓 EAS 自動建立並保存**。以後出包、送 TestFlight、填上架資料都不用再登入，AI 可以自己做完。
- 完成後 TestFlight 會出現 1.0.0 (16)。這個 build 包含時間不顯示秒數，以及「常用代碼」中文化這兩項修正。

## 2. 一鍵填 App Store Connect 文字資料

```bash
eas metadata:push
```

會從 `apps/mobile/store.config.json` 寫入以下欄位：
- 繁中和英文的名稱、副標題、推廣文字、關鍵字、說明
- 支援網址、隱私權網址
- 審查備註，並勾「需要登入」

填完後到 App Store Connect 看一遍，覺得沒問題再按儲存。

## 3. App Store Connect 網頁上只能手動做的事

1. **版本頁 → 建置版本**：選 **1.0.0 (16)**。選好之後 icon 就會出現，之前看不到 icon 就是因為還沒選 build。
2. **App 審查資訊**：
   - 填審查用帳號和密碼，以及聯絡人姓名和電話。
   - 附上示範班表 `apps/mobile/assets/ishift-demo-roster-september-2026.png`。
3. **App 隱私**：照 `docs/app-store-first-review/asc-paste-sheet.md` 第 2 節勾 6 種資料類型，然後按「發布」。
4. 截圖已經上傳完成（v3）。

## 4. 隱私權網頁（appai.info）

新內容已經寫好，在 appai repo 的 `ishift-privacy-2026-11-09` 分支（commit 2c51a62）。新增三項：
- Gemini 付費方案，Google 不會用這些圖片改善其產品
- 選取群組時，群組成員可以看原始班表照片
- 30 天內完成刪除，完成後只留一筆匿名紀錄

合併到 main 就會上線。AI 被安全規則擋下，不能直接發布到正式網站，所以要你或大管家按合併。
https://github.com/KYCgrayson/APPAI/pull/new/ishift-privacy-2026-11-09

## 5. 送審前建議再確認

- Resend 金鑰要修好，刪除帳號的確認信才寄得出去。
- 用 TestFlight 把 Build 16 裝到手機上，確認時間顯示、掃描和刪除帳號申請都正常。
- 全部確認後，在 App Store Connect 按「提交審查」。
