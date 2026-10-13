# Calendar share visual QA — 2026-10-13

Reference: artifacts/design/2026-10-12-calendar-share/selected-peach-diary.png. Final native Photos output: artifacts/qa/2026-10-12-calendar-share/oct13-photos-saved.png.

Passed: soft peach/cream palette, rounded calendar cells, quiet spacing, distinct explicit rest days, readable date/shift/time hierarchy and real IShift footer. User-directed changes: monthly gentle/toxic/none quote replaces the sample heading; download URL/QR omitted before launch; actual month/shift data replaces mock content. Long-name stress fixture expands its week without cropping.

Found and fixed: native modal title overlapped Dynamic Island; parent safe-area insets now protect header and footer. Runtime proof: october-preview-inset-fixed.png.

Native share and Photos readback passed on isolated iOS26.5 simulator. See native-acceptance.md for reproducible fixture instructions and limitations. 28/29-day, overnight/missing-time and unknown-offline-month paths were not separately exercised natively in this run.
