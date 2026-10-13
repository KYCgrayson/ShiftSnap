# Calendar share shift labels

## Background and finding

The calendar share preview previously mapped a shift to `meaning || code`, so the original code disappeared whenever a meaning existed. The modal also replaced every rest-shift label with a generic localized “Day Off” label. The completed label change shows code before meaning (for example, `D 早班`) and preserves a rest code and its meaning. The new approved time preference is off by default, with an optional checkbox to include the stored shift times in the exported image.

## Failure cases to prevent

- A shift with both code and meaning hides the code or reverses their order.
- An empty meaning produces an empty non-rest label instead of retaining its code.
- Rest shifts lose their code or configured meaning.
- A rest shift with no meaning loses the localized fallback label.
- Equal code and meaning are printed twice.
- A multiline or clipped label makes the narrow calendar cell harder to read.
- Shift times or unrelated calendar/share behavior change as a side effect.
- A newly opened preview inherits the prior preview's show-times choice instead of defaulting off.
- Enabling times changes values, adds time to rest shifts, or changes code/name/day-off/privacy behavior.
- The image is captured before the show-times layout has rendered.
- The show-times choice is missing from one locale or is inaccessible to screen readers.

## Checklist

- [x] Add the shift code to the share-modal data shape and pass it from the calendar.
- [x] Keep meaning empty when no configured meaning exists.
- [x] Render code first, then meaning; use localized rest text only when a rest meaning is absent.
- [x] Avoid duplicate text when code and label match.
- [x] Keep the label change limited to share-label mapping and rendering.
- [x] Add a session-only show-times state that resets to off when the preview closes.
- [x] Add a localized, accessible show-times checkbox beside the quote controls.
- [x] Show the existing stored times only when enabled and only for work shifts.
- [x] Invalidate capture readiness when the checkbox changes and restore it after the next layout frame.

## QA and passing criteria

- [x] `pnpm typecheck` succeeds.
- [x] `git diff --check` succeeds.
- [x] Source review confirms code precedes meaning, rest meaning is retained, fallback labels remain localized, and duplicate equal strings are suppressed.
- [x] No unit tests are added or run; native E2E is handled separately.
- [x] Native QA confirms default-off, toggle-on stored times, reset to off, and exported-image layout; see the artifacts below.

## Native verification — 2026-10-13

Signed iOS26.5 QA build succeeded. Actual Save Image exports read back from isolated simulator Photos as artifacts/qa/2026-10-13-share-labels/no-times.png and with-times.png. Both contain code-first work/rest labels, all dates, multiple shifts and full footer. Off state has no times; on state has stored times. Closed/reopened preview and AX checkbox returned unchecked. Long synthetic code/name wraps and expands the row without clipping. No production user data was inspected.

The user approved both a shift-code legend and a user-entered sharing note. This follow-up is now implemented in the current working tree; native QA for the follow-up is pending. This change is not in uploaded TestFlight build 12.

## Approved follow-up: legend and custom share note

The user selected both a below-calendar shift legend and a user-entered note. The legend belongs inside the captured image and uses only the current-month personal shifts already passed to this modal. It lists unique code/meaning labels; when optional times are enabled, it lists distinct time pairs actually stored for each label. The custom note is a separate optional, session-only field outside the captured card; its trimmed text is added inside the image, preserving line breaks. No private diary content is imported.

### Failure cases to prevent

- The legend includes shifts from adjacent months, coworkers, or other private data.
- Duplicate code/meaning entries appear more than once, or the legend label differs from the calendar cell label.
- Turning on times invents defaults, hides distinct stored time pairs, or silently omits unset times and implies a schedule has one uniform time when its stored values differ.
- Rest shifts incorrectly gain time pairs.
- The custom note appears in the image while empty, imports private diary text, or persists into a later preview.
- Note edge trimming removes internal line breaks or the image clips/won't wrap the note.
- The capture begins before a note edit has laid out, or captures while the keyboard remains open.
- The note field remains editable during sharing, exceeds 300 characters, or lacks localized/accessibility text.
- An accessibility `setValue` action bypasses the TextInput maxLength and places more than 300 Unicode code points in React state or the exported image.
- Repeated input that clamps to the already stored 300-code-point note invalidates capture readiness without changing the note, leaving sharing disabled.
- On iOS, the software keyboard covers the note field and fixed share button, making the note flow difficult to use.
- After keyboard avoidance moves the share button above the keyboard, the focused note field can remain below the visible ScrollView viewport.
- If note focus occurs after the keyboard is already visible, no `keyboardDidShow` event arrives to reveal the focused field.

### Follow-up checklist

- [x] Extract the shared code/meaning label formatter and use it in both cells and the legend.
- [x] Add a unique current-month personal-shift legend below the grid and above the logo.
- [x] When show-times is on, add distinct stored time pairs grouped by code/meaning, explicitly label fully unset times, use an em dash for a missing endpoint in a partial pair, and mark overnight pairs with the existing localized next-day label.
- [x] Add an optional, empty-by-default, 300-character multiline note field outside the capture; include only its trimmed nonempty text in the card while preserving internal line breaks.
- [x] Reset the note on close/unmount; disable editing while sharing; dismiss the keyboard before capture.
- [x] Make capture readiness wait for note edits to render.
- [x] Add Traditional Chinese and English labels and placeholder text.
- [x] Clarify that only the user-entered share note is included; private diary notes remain excluded.
- [x] Enforce the 300 Unicode code point limit in the state update handler as well as TextInput maxLength.
- [x] Invalidate capture readiness only when the clamped note value actually changes.
- [x] Avoid the iOS keyboard while keeping the full share card captured; let the form scroll and dismiss the keyboard by dragging.
- [x] After the keyboard finishes showing for a focused note field, scroll the form to reveal the field and remove the keyboard listener on cleanup; if focus occurs while the keyboard is already visible, scroll on the next animation frame.
- [x] `pnpm typecheck` and `git diff --check` pass; no unit tests added or run.
- [ ] Native QA validates unique legend/time variants and note empty, multiline, close/reset, keyboard-dismiss, and captured-image behavior; remains pending.

### Latest execution status

Final focus-scroll simulator Release build succeeded and installed on 2026-10-13. Mac locked at the final UI check; user unlock requested. Unique legend/time variants, multiline note, close/reset, 300-code-point cap and repeated-overlimit export have passed, with real PNG evidence in `artifacts/qa/2026-10-13-share-labels`. The final focused-input visibility and PNG regression check remain pending. No new TestFlight upload performed.

### Gate resolved in display revision
Native keyboard/focused-note check and actual full PNG passed on 2026-10-13 in the display revision. See `artifacts/qa/2026-10-13-share-display/keyboard-options.png` and `codes-with-note.png`. The newer display revision defaults cells to codes only and keeps meanings in the legend, superseding the earlier always-matching labels criterion. User subsequently requested compact inline legend layout; that final layout is being verified separately.
