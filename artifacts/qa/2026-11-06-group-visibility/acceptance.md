# Group visibility acceptance — defined before verification

Scope: preserve group access; clearly disclose selected destination before any roster-photo transmission and keep consented destination stable through OCR, schedule creation, and photo storage.

Failure cases:
1. Group selected but notice omitted, wrong name, or photo visibility not disclosed.
2. No group selected but UI claims a group can see the roster.
3. Consent cancelled but OCR, schedule POST, or storage write occurs.
4. Active group changes after consent; saved group or storage path changes silently.
5. Direct/manual share confirmation omits group name or original-photo visibility.
6. Chinese or English text missing or rendering raw translation keys.

Passing criteria:
- Group and personal scan previews identify accurate audience.
- Consent names the group and includes original roster photo + shifts.
- Cancel produces no OCR, schedule, or storage write.
- Accept reaches review with synthetic result; group identity matches disclosure through requests.
- Stable captured destination verified for group switch race.
- Repeatable transcript + native screenshots and request evidence; any untested boundary named explicitly.

No production account, photo, database or Calendar is used. Native entry must reject non-localhost backend.

Additional boundaries selected before execution:
- Native dialog dismissed without a choice must abort.
- A rapid repeated recognize tap while consent pending must open one dialog only.
- Account changes while consent pending must abort before OCR.
- A group change between preview render and recognize tap must be disclosed using the latest chosen group, then pinned.
- Bulk share cancel/dismiss writes nothing; accept pins disclosed group and original-photo visibility, including the warning that existing group rosters move. A changed signed-in account aborts the share.
