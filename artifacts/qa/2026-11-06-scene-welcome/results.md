# IShift native QA, 6 November 2026

| Isolated iOS 27 simulator check | Observed result |
| --- | --- |
| Ordinary production router, clean English install, first run | Three steps, register, login, background/foreground, cold login URL, warm register URL, guest Home and guest cold relaunch all passed. |
| Ordinary router, clean final locale build, zh-Hant-TW launch preference | The same native flow passed in Traditional Chinese. 1 XCTest, 0 failures, 166.068 s. No synthetic session or app language was preloaded. |
| Explicit English preference on zh-Hant-TW setup | Changed Settings → 語言 → English. English remained selected at the next cold launch. 1 XCTest, 0 failures, 66.077 s. |
| Synthetic authenticated QA entry, final photo fix and plain test entry | Group warning named QA Team. Cancel sent zero writes. Accept reached 你是誰？ and the fixture OCR/schedule/object endpoints. 1 XCTest, 0 failures, 27.692 s. |
| Image integrity verification | 83,412 bytes. SHA-256 e398ffa245e991bc9509ca449c765780cb3865e7dd7abfda56c4313ef4f92f9a for the bundled sample, OCR payload, uploaded file and read-back. Final image status uploaded. |

Xcode Release simulator SDK 27.0, iOS 27.0 (24A434), iPhone 18 Pro Max. Normal-route evidence and authenticated fixture evidence come from separate builds. The screenshot, test sources, accessibility snapshots, sanitized traffic, digest verifier and reproduction instructions are in this directory. Physical-device acceptance, distribution signing, production Supabase, and live OCR provider were outside these runs. The fixture and QA app were stopped afterward.
