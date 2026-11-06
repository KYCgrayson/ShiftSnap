import XCTest
final class VisibilityTests: XCTestCase {
    func snapshot(_ label: String, _ app: XCUIApplication) {
        let shot=XCTAttachment(screenshot: app.screenshot())
        shot.name=label
        shot.lifetime = .keepAlways
        add(shot)
        let tree=XCTAttachment(string: app.debugDescription)
        tree.name=label+"-tree"
        tree.lifetime = .keepAlways
        add(tree)
    }
    func matching(_ app: XCUIApplication,_ pattern: String)->XCUIElement {
        app.descendants(matching:.any).matching(NSPredicate(format:"label MATCHES[c] %@",pattern)).firstMatch
    }
    func localFixture(_ path: String) async throws -> Data {
        let (data, _) = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:55439/qa/" + path)!)
        return data
    }
    func resetEvidence() async throws { _ = try await localFixture("reset") }
    func writes() async throws -> [[String:Any]] {
        let json=try JSONSerialization.jsonObject(with: await localFixture("evidence")) as? [String:Any]
        return (json?["requests"] as? [[String:Any]] ?? []).filter {
            let p=$0["path"] as? String ?? ""
            return p.contains("/functions/v1/ocr-process") || p.contains("/storage/v1/object/shift-images/") || (p.hasSuffix("/rest/v1/schedules") && $0["method"] as? String == "POST")
        }
    }
    @MainActor func testRealRosterGroupWarning() async throws {
        let app=XCUIApplication(bundleIdentifier:"com.shiftsnap.app")
        app.launch()
        let scan=matching(app,"^(掃描|Scan)(,.*)?$")
        guard scan.waitForExistence(timeout:30) else {snapshot("startup",app);XCTFail("Scan tab missing");return}
        scan.tap()
        let sysAlert=XCUIApplication(bundleIdentifier:"com.apple.springboard").alerts.firstMatch
        if sysAlert.waitForExistence(timeout:2) && sysAlert.debugDescription.range(of:"Camera|相機",options:.regularExpression) != nil {
            let deny=sysAlert.buttons.matching(NSPredicate(format:"label MATCHES[c] %@", "Don.t Allow|不允許")).firstMatch
            if deny.exists { deny.tap() }
        }
        let sample=matching(app,"(^Demo$|.*(Demo 班表|範例班表|demo roster|demo schedule).*)")
        guard sample.waitForExistence(timeout:12) else {snapshot("scan-gate",app);XCTFail("Synthetic example button missing");return}
        sample.tap()
        let process=matching(app,"^(處理班表|Process Schedule|Recognize)(,.*)?$")
        guard process.waitForExistence(timeout:8) else {snapshot("after-example",app);XCTFail("Recognition preview missing");return}
        let notice=app.descendants(matching:.any)["scan-visibility-notice"].firstMatch
        XCTAssertTrue(notice.waitForExistence(timeout:5))
        XCTAssertTrue(notice.label.contains("QA Team"))
        snapshot("01-selected-group-preview",app)
        try await resetEvidence()
        process.tap()
        let alert=app.alerts.firstMatch
        guard alert.waitForExistence(timeout:10) else {snapshot("missing-consent",app);XCTFail("Consent missing");return}
        snapshot("02-selected-group-consent",app)
        XCTAssertTrue(alert.debugDescription.contains("QA Team"))
        alert.buttons.matching(NSPredicate(format:"label MATCHES[c] '取消|Cancel'")).firstMatch.tap()
        XCTAssertTrue(process.waitForExistence(timeout:5))
        let cancelled = try await writes()
        XCTAssertTrue(cancelled.isEmpty, "Cancelling sent a request")
        process.tap()
        guard alert.waitForExistence(timeout:5) else {XCTFail("Consent missing after retry");return}
        alert.buttons.matching(NSPredicate(format:"label MATCHES[c] '同意並辨識|Agree and recognize'")).firstMatch.tap()
        let review=matching(app,"^(你是誰？|Who are you[?])$")
        let found=review.waitForExistence(timeout:35)
        snapshot("03-after-accept",app)
        XCTAssertTrue(found, "Accepted result did not open the roster review")
        let accepted=try await writes()
        let events=accepted.compactMap { $0["path"] as? String }
        XCTAssertTrue(events.contains("/functions/v1/ocr-process"))
        XCTAssertTrue(accepted.contains { $0["method"] as? String == "POST" && ($0["body"] as? [String:Any])?["group_id"] as? String == "00000000-0000-4000-8000-000000000010" })
        XCTAssertTrue(events.contains { $0.contains("/storage/v1/object/shift-images/") && $0.contains("00000000-0000-4000-8000-000000000010") })
        let summary=XCTAttachment(string:"cancel writes: "+String(cancelled.count)+"; group QA Team; accepted paths: "+events.joined(separator:" "))
        summary.name="04-network-summary";summary.lifetime = .keepAlways;add(summary)
    }

    @available(iOS 16.4, *)
    @MainActor func testFreshWelcomeAndLifecycle() throws {
        let app = XCUIApplication(bundleIdentifier: "com.shiftsnap.app")
        app.launchArguments = ["-AppleLanguages", "(zh-Hant-TW)", "-AppleLocale", "zh_TW"]
        app.launch()
        let first = matching(app, ".*匯入班表.*")
        guard first.waitForExistence(timeout: 30) else {
            snapshot("missing-welcome", app)
            XCTFail("Fresh normal entry never reached welcome")
            return
        }
        XCTAssertTrue(matching(app, ".*(Check your shifts|核對班表).*").exists)
        XCTAssertTrue(matching(app, ".*(Export your schedule|匯出班表).*").exists)
        XCTAssertTrue(matching(app, ".*(phone calendar or share a monthly image|手機日曆.*月班表圖片).*").exists)
        snapshot("welcome-fresh", app)
        let start = matching(app, "^(Get Started|開始使用)(,.*)?$")
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        start.tap()
        let reg = matching(app,"^(Create account|建立帳號|建立帳戶)$")
        guard reg.waitForExistence(timeout: 6) else {snapshot("registration-navigation",app);XCTFail("Register CTA");return}
        app.terminate()
        app.launch()
        let login = matching(app,"^(Sign In|登入|Log in)$")
        XCTAssertTrue(login.waitForExistence(timeout:10))
        login.tap()
        let loginTitle = matching(app,"^(Welcome back|歡迎回來)$")
        guard loginTitle.waitForExistence(timeout: 8) else {snapshot("login-navigation",app);XCTFail("Login CTA");return}
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(loginTitle.waitForExistence(timeout: 8))
        snapshot("login-after-background", app)
        app.terminate()
        app.open(URL(string:"shiftsnap:///login")!)
        guard loginTitle.waitForExistence(timeout: 15) else {snapshot("cold-link-failed",app);XCTFail("Cold login deep link");return}
        snapshot("cold-login-link",app)
        app.open(URL(string:"shiftsnap:///register")!)
        guard reg.waitForExistence(timeout: 10) else {snapshot("warm-link-failed",app);XCTFail("Warm register deep link");return}
        snapshot("warm-register-link",app)
        app.terminate()
        app.launch()
        let guest = app.descendants(matching:.any)["welcome-guest"].firstMatch
        XCTAssertTrue(guest.waitForExistence(timeout:10))
        if !guest.isHittable { app.swipeUp() }
        guest.tap()
        let tab = matching(app,"^(Scan|掃描)(,.*)?$")
        guard tab.waitForExistence(timeout: 20) else {snapshot("guest-after-tap",app);XCTFail("Guest entry");return}
        snapshot("guest-home",app)
        app.terminate()
        app.launch()
        XCTAssertTrue(tab.waitForExistence(timeout: 15))
        XCTAssertFalse(guest.exists)
        snapshot("guest-home-after-cold-launch",app)
    }

    @MainActor func testEnglishPreferenceOnChineseDeviceAfterRelaunch() throws {
        let app = XCUIApplication(bundleIdentifier: "com.shiftsnap.app")
        app.launchArguments = ["-AppleLanguages", "(zh-Hant-TW)", "-AppleLocale", "zh_TW"]
        app.launch()
        let settings = matching(app, "^設定, tab.*$")
        guard settings.waitForExistence(timeout: 20) else { snapshot("before-preference",app); XCTFail("Chinese tab missing"); return }
        settings.tap()
        let language = matching(app, ".*語言.*")
        guard language.waitForExistence(timeout: 6) else { snapshot("settings-preference",app); XCTFail("Language row missing"); return }
        for _ in 0..<3 where !language.isHittable { app.swipeUp() }
        language.tap()
        let english = app.buttons["English"].firstMatch
        guard english.waitForExistence(timeout:5) else {snapshot("language-picker",app); XCTFail("English language choice missing"); return}
        english.tap()
        let englishTab = matching(app, "^Settings, tab.*$")
        guard englishTab.waitForExistence(timeout:8) else {snapshot("preference-immediate",app); XCTFail("Did not immediately switch to English"); return}
        app.terminate()
        app.launch()
        XCTAssertTrue(englishTab.waitForExistence(timeout:15))
        snapshot("english-preference-after-relaunch",app)
    }
}
