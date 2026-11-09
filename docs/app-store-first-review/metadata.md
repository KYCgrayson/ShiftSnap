# IShift App Store listing draft

Prepared from the current repository on 2026-11-05. For the fields actually saved in App Store Connect, see current-status.md. This file contains copy candidates.

## Traditional Chinese (Taiwan)

| Field | Draft | Length |
|---|---|---:|
| Name | `IShift 班表掃描與輪班日曆` | 16 / 30 characters |
| Subtitle | `拍下紙本班表，用原始代號看班次` | 15 / 30 characters |
| Promotional text | `掃描紙本班表後先核對辨識結果，再查看輪班、休假，並選擇要同步到手機日曆的班次。` | 39 / 170 characters |
| Keywords | `班表,護理師,輪班,排班,休假,值班,大夜,小夜,月曆,掃描` | 72 / 100 UTF-8 bytes |

**Description** (draft; 4,000-character limit):

> 下週三上 A 班還是 B 班？拍下紙本班表，核對辨識結果，就能在手機月曆查看每天的班次與休假。
>
> 保留你熟悉的班別代號
> IShift 協助辨識日期、人員和班別。儲存前可以對照原圖，把看錯的代號改回來。
>
> 讓手機日曆一眼就看懂
> 選要匯出的工作日或休假日。事件標題可以只寫「B」，也可以加上班別名稱或姓名。確認摘要後，班次才會寫入你選的班表日曆。
>
> 分享一張月班表
> 把整個月的班次和休假排成圖片。想讓家人知道哪天有空，可以只顯示代號；需要交班時，再加上班別時間或備註。
>
> 與群組一起排班
> 有選取群組時，新班表會存入該群組，成員可查看班次和原始班表照片。
>
> 不登入也能先看示範班表。掃描與雲端儲存需要登入和網路。

## English

| Field | Draft | Length |
|---|---|---:|
| Name | `IShift Shift Calendar` | 21 / 30 characters |
| Subtitle | `Scan Paper Work Schedules` | 26 / 30 characters |
| Promotional text | `Scan a paper roster, check the recognized shifts, then view or sync the shifts you choose.` | 90 / 170 characters |
| Keywords | `schedule,roster,work,planner,rota,staff,timetable,OCR,days off` | 62 / 100 UTF-8 bytes |

**Description** (draft; 4,000-character limit):

> Turn a paper work roster into a digital schedule you can review and manage.
>
> **Scan and review**  Take or choose a roster photo. IShift helps recognize dates, people rows, and shift codes. Review and correct the result before saving. Recognition may be inaccurate, so check against the original roster.
>
> **View shifts in a calendar**  See work shifts and days off by date. View schedules shared by invited group members, and open a date to read its shifts and notes.
>
> **Sync selected shifts**  Choose workdays, days off, or all shifts. Set the schedule calendar name and color. Exported event titles start with the original shift code; choose whether to add the shift name or person's name. Review the export summary before writing events to the selected device calendar.
>
> **Share a monthly image**  Export a calendar image and choose whether to show shift names and times. Add a short message and schedule notes.
>
> Guest mode includes sample data. Sign in to use cloud features, create groups, and share schedules with invited members. When a group is selected, new rosters are saved to that group; its members can view shifts and the original roster photo. Cloud features require sign-in and an internet connection.
## Before submission

- Verified public Support URL: https://appai.info/ishift/support.html
- Verified public Privacy Policy URL: https://appai.info/ishift/privacy.html
- Public support and App Review contact email: appai@appai.info. App Review requires a first name, last name and international phone number to save contact details.
- Enter current App Review contact details and a dedicated, working demo account through App Store Connect’s separate fields. No contact details or credentials are included in this draft.
- Verify App Privacy answers against the live services and actual data handling. The in-app policy says schedule images are sent to Google Gemini and describes account, schedule, usage, and device data; this draft does not substitute for the privacy disclosures.
- Review localization, screenshots, category, age rating, pricing, and any version-specific “What’s New” text in App Store Connect before submitting.

## Repository and release evidence

- App display name and iOS bundle identifier in `apps/mobile/app.json`: `IShift`, `com.shiftsnap.app`.
- Local `HEAD` on 2026-11-05: `065e89ac8b651f7394cdd9f055697fef460c7371`; local branches `development`, `main`, `origin/main`, and `origin/development` all pointed to this commit. The two live GitHub branch tips were independently checked with ls-remote and matched.
- Latest EAS upload receipt present in the repository: iOS `1.0.0 (14)`, build `c9c02a2e-475d-4496-ac5a-413ef5d1b706`, created 2026-10-15, source commit `5d12bb5951bd3f6a1e04638179d09a020cee553a`. The receipt records successful upload to App Store Connect; Apple processing and tester availability were not independently verified in that receipt.
- On 2026-11-05 EAS independently returned Build 14 as the newest iOS store build. Apple emailed the test recipient on Oct 15 that Build 14 was available to test. App Store submission status has not been verified.

## Character limits and references

Apple currently documents a 30-character app name and subtitle, 170-character promotional text, 4,000-character description, and 100-byte keyword field. The review-notes field maximum is 4,000 characters. Keyword fields are counted in UTF-8 bytes; the table includes the encoded byte counts.

- [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
- [Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/)
- [App Store search and keyword guidance](https://developer.apple.com/app-store/search/)
- [App Review guidelines and review information](https://developer.apple.com/app-store/review/)
- [App Store review details and notes field](https://developer.apple.com/documentation/appstoreconnectapi/app-store-review-details)
