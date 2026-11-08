# IShift first-review screenshot candidates — 2026-11-05

The two PNGs in this folder are actual IShift app screens captured with `xcrun simctl io screenshot` on isolated iOS 26.5 Simulators. The app session and shift rows came only from the repository's localhost synthetic QA fixture (`scripts/qa/native-code-first-fixture.mjs`). No production account or calendar data was used.

| Upload candidate | Simulator | Pixels | Color mode |
| --- | --- | ---: | --- |
| `iphone-6.9-home.png` | iPhone 17 Pro Max | 1320 × 2868 | RGB PNG, no alpha |
| `ipad-13-home.png` | iPad Pro 13-inch (M5) | 2064 × 2752 | RGB PNG, no alpha |

Both sizes match [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/). The untouched native captures are in `source-native/`; Simulator wrote an all-opaque alpha channel, so the upload candidates remove that channel without changing any RGB pixel values. Pixel-for-pixel equality was checked after conversion.

Visual review: both images clearly show the real Home screen and have clean status bars. They also visibly show synthetic `Alex QA` and mixed Chinese/English shift labels. The iPad layout leaves substantial unused space. Treat these as first-review candidates, not polished final marketing artwork. The installed signed QA app originated from an earlier dedicated Simulator build; this capture does not prove parity with a later App Store binary. No calendar-tab or other screen is included because a deep-link prompt blocked a clean capture while the Mac UI was locked.
