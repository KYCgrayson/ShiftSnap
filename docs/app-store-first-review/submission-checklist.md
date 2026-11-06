# IShift 首次上架交接｜2026-11-05

后台入口：[App Store Connect · IShift](https://appstoreconnect.apple.com/apps/6760009299/distribution)。本文件是离线工作表，不代表后台已储存、已选择构建或已送审。

## 产品修正优先级

1. 帐号删除：Build 14 对应代码的「删除帐号」处理函数在 apps/mobile/app/(tabs)/settings.tsx:362，只调用 signOut。必须让使用者能发起真实删除。验收：用专用测试帐号注册、上传合成班表、删除后，确认帐号与关联个人数据依已公开政策处理；不得用正式使用者验收。
2. 第三方 AI：scan.tsx:260 上传、:293 调用辨识；ocr-process/index.ts:166 传给 Google。当前检查未找到传送前针对 Google Gemini 的明确同意。建议在第一次传送前提示「这张班表（可能含姓名、日期、班别）会传给 Google Gemini 以辨识班次。请确认你有权分享图中资料。」提供「取消」和「同意并辨识」，拒绝不能上传；以网络请求验证。
3. 支援：settings.tsx:1723 的意见表单未发送，却显示成功。请接通并测试真实客服渠道，或改为已验证且有人收件的联系渠道。privacy.tsx:100 不应只指向未运作的表单。
4. 欢迎页的「隐私政策」实际打开服务条款（welcome.tsx:93），应修正链接，并验证未登入也能阅读正确政策。隐私承诺：privacy.tsx:70、79 的一年保留期限和 Google 不留存影像需核实实际定期删除、备份、Google 专案服务方案与日志设定，或同步修正公开政策和 App 内文。不要只改商店表单。
5. 以上涉及行为修正时，另建新版、回归测试，再在版本页面选新 build。先前 TestFlight 上传不等于 App Review 送审。

## Safari 填写顺序

| 页面 | 可以准备／填写 | 提交前要核实 |
|---|---|---|
| App 信息 | 名称 IShift；类别建议「工具程式」或「生产力」，主类别建议生产力；副标题见 metadata.md | 后台已有值优先保留；若同名由 Apple 验证 |
| iOS 1.0 版本 | 描述、关键字、推广文字和审核说明见 metadata.md。首版无须虚构更新日志 | 当前本地资料不等于线上已填 |
| 截图 | 分语言、iPhone/iPad 分开；第一张优先展示可读的月班表 | 只用合成数据。支持 iPad，不能用放大的手机截图替代平板画面 |
| URL | Support URL 和 Privacy Policy URL 必须可公开打开；Marketing URL 无合适页面可留空 | 需实际网址、有效联络渠道，匿名浏览实测，不以 Apple 登录信箱推断公开客服 |
| 隐私 | 下表供填写前核查；不要选「不收集资料」 | 线上 SDK、日志、第三方保留期限由负责人核实；公开标签与政策一致 |
| App 审核资料 | 使用合成班表，提供操作步骤；如需登录，提供专用、有效且不需人工验证码的审核帐号 | 用户本人姓名、可联系的电话和信箱；密码只填写苹果后台专用栏，不写进文档 |
| 版权与分级 | 建议以真实权利人填写 2026 年版权；依实际功能填分级问卷 | 不从账号名称推断权利人；群组分享／用户生成内容能力据实回答，分级由 Apple 计算 |
| 定价与销售范围 | 选定价格、国家地区、手动／自动发布 | 商业决策由负责人确认；欧盟上架时查交易者资料状态；后台提示协议由负责人处理 |
| 构建与加密 | 当前项目 com.shiftsnap.app；app.json 声明 ITSAppUsesNonExemptEncryption=false | 以实际候选构建和依赖复核；不要用上传回执代替后台可选择状态 |
| 发布 | 审核通过后若希望自己决定日期，选手动发布 | 最终「送出审核」留给负责人 |

## App Privacy 建议回答底稿（不是已提交的声明）

| 实际数据 | Apple 对应候选分类 | 建议用途／归属 |
|---|---|---|
| 登录电子信箱、显示名、帐号 ID | Contact Info: Email Address、Name；Identifiers: User ID | App Functionality；与帐号关联 |
| 上传的班表相片，可能含同事姓名 | User Content: Photos or Videos；核对姓名类别 | App Functionality；相片与帐号、群组关联。Supabase 储存、Google 辨识 |
| 班次、日期、代号、群组关系 | User Content: Other User Content 或 Other Data Types，依 Apple 最终定义 | App Functionality；与帐号关联 |
| 用户选择写入的系统行事历、保存的分享图 | 分别核查哪些内容仅在设备处理，哪些随同步回写（例如事件识别码） | 不能把系统授权自动等同于服务器收集全部手机行事历或整个相簿 |
| 诊断／追踪 | 未在 mobile/package.json 看到明显广告或分析 SDK，仅属初筛 | 核对正式服务日志、合作方、跨 App 追踪后再回答；不能以无广告界面代替查核 |

## 依据
- [Apple 审核规范：完整性与隐私](https://developer.apple.com/app-store/review/guidelines/#privacy)
- [Apple App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [Apple 截图规格](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)

## 已核对的版本证据
2026-11-05 直接读取远端：main 与 development 同为 065e89ac8b651f7394cdd9f055697fef460c7371。该提交与 Build 14 来源 5d12bb5 仅差上次上传回执和计划说明，没有运行时代码差异。Apple 于 2026-10-15 21:08（台北）向测试收件者寄出「IShift 1.0.0 (14) for iOS is now available to test.」。证明该测试者当时已获可测试通知；不代表 App Store 分发版本已选定该 build 或已送审。

## 审核附件（可选）
reviewer-attachment/IShift-Demo-Roster-September-2026.png 是 App 自带的合成测试班表，表头为 2026 年 9 月，内有 M / N / 特休。可作为 App Review Information 附件，让审核员不用提供真实员工资料。本地已打开核对；登录后从相簿导入，日期切到 2026 年 9 月看结果，不能把「本月没有班次」误判成导入失败。2026-11-05 配置的 Supabase Auth 健康端点回应 HTTP 200；这不验证审核凭证、登入、储存、辨识配额或全部后端权限。

## 11 月 6 日補充：班表存取、內容權利、隱私標籤

- 班表可見性：scheduleStore.ts 的 createSchedule 將當下的 currentGroup.id 寫入 schedules.group_id；無群組為 null。20260730000003_schedule_image_integrity.sql 的 shift_images_schedule_read 規則允許擁有人或該群組成員讀取相符照片。這是程式碼證據，尚非正式環境雙帳號實測。不可宣稱「每張班表永遠只有上傳者可見」。
- Apple 的 Content Rights 並非詢問「班表是否公開」。需分別核對 IShift 自行提供或外部取得的內容（包括範例、素材）與使用者自行提供的檔案；不能僅憑私人使用推定有或無全部授權。
- 隱私草稿：有收集資料。就帳號、雲端排班和客服而言，姓名、電子郵件、使用者 ID、班表相片、其他使用者內容、客服資料，對應實際用途「App 功能」，帳號內儲存者與身分關聯。第三方辨識服務為 Google Gemini；影像傳送不等同廣告追蹤。
- 可驗證的診斷路徑：ocr-process/index.ts 記錄模型、重試／錯誤、成功列數；解析失敗時會將部分模型回應寫入錯誤日誌，可能含班表內容。核實部署版本、正式日誌遮蔽、保留及存取，再定案診斷／內容標籤。未以此判定正式使用者已受影響。
