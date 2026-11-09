import XCTest

// Captures App Store screenshots from the QA build (tests/native-reliability.entry.js)
// running against scripts/qa/store-screenshot-fixture.mjs. Synthetic data only.
final class StoreShotsTests: XCTestCase {
    func shot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func element(_ app: XCUIApplication, _ pattern: String) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label MATCHES[c] %@", pattern)).firstMatch
    }

    func dismissSystemAlert() {
        let alert = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
        if alert.waitForExistence(timeout: 2) {
            let deny = alert.buttons.matching(NSPredicate(format: "label MATCHES[c] %@", "Don.t Allow|不允許")).firstMatch
            if deny.exists { deny.tap() }
        }
    }

    @MainActor func testStoreScreenshots() throws {
        continueAfterFailure = true
        let app = XCUIApplication(bundleIdentifier: "com.shiftsnap.app")
        app.launch()

        let calendarTab = element(app, "^日曆(,.*)?$")
        XCTAssertTrue(calendarTab.waitForExistence(timeout: 30), "App did not reach tabs")
        sleep(2)
        shot("02-home")

        calendarTab.tap()
        sleep(2)

        // Header toggle shows the first working shift code ("A"); turn codes on so
        // each day cell shows its shift instead of only colour bars.
        let codesOn = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", "A")).firstMatch
        if codesOn.exists { codesOn.tap(); sleep(4) } // let the toast fade

        let today = Calendar.current.component(.day, from: Date())
        let day = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH %@", "\(today)")).element(boundBy: 0)
        if day.exists { day.tap(); sleep(1) }
        shot("03-calendar")

        let share = element(app, "^分享本月班表$")
        if share.exists {
            share.tap()
            sleep(3)
            // Cycle quote style 溫柔 -> 毒舌.
            let mode = element(app, "^短句：溫柔$")
            if mode.exists { mode.tap(); sleep(2) }
            let names = element(app, "^顯示班別名稱$")
            if names.exists { names.tap(); sleep(2) }
            // Tapping the toggles auto-scrolls; bring the poster (with its quote) back to the top.
            let scroll = app.scrollViews.firstMatch
            if scroll.exists { scroll.swipeDown(); scroll.swipeDown(); sleep(2) }
            shot("04-share")
            let close = element(app, "^(關閉|取消|完成|Close|Cancel|Done)$")
            if close.exists { close.tap() } else { app.swipeDown() }
            sleep(1)
        }

        let codesTab = element(app, "^班別(,.*)?$")
        if codesTab.exists { codesTab.tap(); sleep(2); shot("05-shift-codes") }
    }
}
