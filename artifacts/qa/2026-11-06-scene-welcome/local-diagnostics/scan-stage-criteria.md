# Accepted scan diagnostics

This matrix was recorded before any scan-reading patch. Synthetic localhost only.

Failing stages to distinguish

1. Consent fails to settle after tap. Preview remains, no processing state.
2. Auth changes or becomes offline read-only. User receives a visible error and no image transmission.
3. Local image fetch never settles. Processing appears, file fetch begins, no blob or OCR.
4. Blob conversion never settles. File response completes, blob starts, no FileReader or OCR.
5. FileReader never settles. Read starts, no load/error/end and no OCR.
6. Supabase session lock stalls before invoke transport. FileReader finishes, no OCR request reaches fixture.
7. OCR response or retry hangs. OCR request reaches fixture but no schedule insert.
8. Schedule insertion, private image upload/download or status update fails. Recorded writes identify exact boundary.
9. Review cannot render. Schedule/image operations finish and navigation is attempted, but no review screen.

Acceptance

- Cancel yields zero OCR, schedule or storage writes.
- Accept reaches review using the synthetic roster, recording one OCR, one schedule create and its image storage writes.
- Group selected in confirmation is preserved in schedule row and image path.
- Picker photos, demo asset and reanalysis read successfully from their supported local/remote URI forms.
- Native evidence must identify the stalled stage before changing production logic.
