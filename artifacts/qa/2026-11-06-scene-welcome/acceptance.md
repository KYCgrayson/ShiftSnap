# Native candidate acceptance
Compare the working Build 14 report with two iOS 27 SDK simulator launches that trapped before Home. Exercise the same iOS 27 runtime after repair using only synthetic data.

Failure cases and passing criteria fixed before implementation:
- The process starts but returns to SpringBoard, stays on splash, or has no React root. A clean normal-entry install must present the three localized steps and a working continuation.
- A fresh user cannot enter the ordinary auth flow, or the walkthrough repeats after completion. Reopen the app, enter a guest session and relaunch to observe each state.
- A background/foreground transition replaces the active view or crashes. Verify the chosen screen remains usable.
- A valid custom URL fails to route when cold or warm. Verify a known route with visible destination; this does not prove a provider's OAuth handshake.
- The group warning remains unverified because consent is unreachable. Use the separate synthetic authenticated QA entry and localhost transport to open the scanner, cancel (no write), accept (OCR + pinned group + photo path), and reach review.
- Evidence: XCTest results, labeled screenshots, captured fixture traffic without credentials or photo bytes, SDK/runtime/build identification. Keep normal-entry, fixture, and device acceptance distinct.
