# IShift 1.0｜App Store Connect 貼上稿（2026-11-09）

給老闆在 App Store Connect 照順序貼上與點選。這份是草稿：所有欄位要由老闆親自儲存，「提交審查」也由老闆按。依據是 `artifacts/app-store-first-review/audit.md`（ops #48）。

## 1. 版本頁 → 說明（繁體中文）

貼 `docs/app-store-first-review/metadata.md` 的繁中 **Description** 區塊（只複製引用框裡的正文，不要複製 `>` 符號）。新版說明多了「有選取群組時，新班表會存入該群組，成員可查看班次和原始班表照片」，比後台的舊版更誠實。

## 2. App 隱私 → 資料收集

第一題「你或第三方合作夥伴是否會從此 App 收集資料？」選 **是**。

依序勾選下列 6 種，其他全部不勾：

| 類別 → 資料類型 | 用途（只勾這個） | 與使用者身分連結 | 用於追蹤 |
|---|---|---|---|
| 聯絡資訊 → 電子郵件地址 | App 功能 | 是 | 否 |
| 聯絡資訊 → 姓名 | App 功能 | 是 | 否 |
| 識別碼 → 使用者 ID | App 功能 | 是 | 否 |
| 使用者內容 → 照片或影片 | App 功能 | 是 | 否 |
| 使用者內容 → 客戶支援 | App 功能 | 是 | 否 |
| 使用者內容 → 其他使用者內容 | App 功能 | 是 | 否 |

不要勾的類別：位置、聯絡人、財務、健康、瀏覽紀錄、搜尋紀錄、購買項目、使用資料、診斷、敏感資訊、其他資料。

依據：
- 沒有廣告、分析或崩潰回報 SDK（`apps/mobile/package.json`），所以「使用資料」、「診斷」、「追蹤」都選否。
- 行事曆事件只寫到裝置上，伺服器不收集，所以不勾行事曆。
- Gemini 用付費方案（老闆 11/8 確認），Google 不會用送出的內容改善產品；這屬於「為提供 App 功能交給服務供應商處理」，不算追蹤。

## 3. 版本頁 → App 審查資訊 → 備註

登入資訊欄位：勾「需要登入」，**帳號和密碼由老闆自己填**，不要寫進這份檔案或 Git。

備註（英文，審查員看英文最快）：

```
IShift turns a photo of a paper work roster into shifts the user reviews before saving.

How to test:
1. Sign in with the demo account provided in the Sign-In Information fields.
2. Open the Scan tab and choose the attached sample roster (IShift-Demo-Roster-September-2026.png). It is fully synthetic.
3. Before any upload, IShift shows a consent dialog explaining that the image is sent to Google Gemini for recognition. Tap Agree to continue. Cancel sends nothing.
4. Review the recognized rows, save, then open the Calendar tab and switch to September 2026 to see the imported shifts.
5. Optional: Calendar > Export to sync selected shifts to the device calendar.

Guest mode (no sign-in) shows sample data but cannot scan.
Account deletion: Settings > Delete Account submits a deletion request; we complete it within 30 days and email a confirmation.
Privacy policy: https://appai.info/ishift/privacy.html
Support: appai@appai.info
```

## 4. 隱私權政策網頁建議補充（要老闆批准才能發布到 appai.info）

在「班表照片辨識」段落最後加一句：
- 繁中：「IShift 使用 Google Gemini 付費方案，Google 不會用這些圖片改善其產品。」
- 英文：“IShift uses a paid Google Gemini plan; Google does not use these images to improve its products.”

在「帳號與班表」段落最後加一句：
- 繁中：「選取群組時，新上傳的班表會存入該群組，群組成員可以查看原始班表照片與班次。」
- 英文：“When a group is selected, new rosters are saved to that group and its members can view the original roster photo and shifts.”

## 5. 截圖

新截圖放在 `artifacts/app-store-first-review/upload-v2/`，依尺寸分資料夾，直接拖進對應欄位。舊截圖先刪掉，再上傳新的。
