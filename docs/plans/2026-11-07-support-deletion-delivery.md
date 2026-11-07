# Support and deletion request delivery

## Background / root cause
Build 15 contains authenticated request and status UI, receipt alerts, and a 30-day processing target. The two RPC migrations were absent from production. They were deployed on 2026-11-07. Neither migration includes email delivery, so database persistence alone is not a complete operator workflow.

## Scope
Keep Build 15 RPC responses compatible. Add a private transactional notification outbox for operator notifications, customer receipts, and deletion status updates. Use appai@appai.info for customer replies. Operators process actual deletion after checking owned/shared data; no automatic destructive deletion is introduced by this change. Users must not be required to explain their reason or contact support to initiate deletion.

## Checklist / progress
- [x] Inspect existing UI and migrations; dry-run lists exactly two migrations.
- [x] Deploy existing support and deletion RPC migrations.
- [x] Verify live authenticated submissions, duplicate request behavior, ownership and status reads (10 initial + 11 status checks).
- [x] Implement and deploy private outbox + worker with retries; 40 integration checks pass.
- [ ] Activate the prepared schedule after valid sender configuration.
- [ ] Configure authorized mail provider and verify real delivery.
- [x] Provide operator case lookup, verified reply contact, status update and delivery troubleshooting instructions.
- [ ] Verify actual Build 15 UI separately from API/simulator checks.
- [x] Update App Review readiness with remaining gaps and evidence.

## Failure cases defined before implementation
Unauthenticated callers, cross-user access, direct private-table access, concurrent duplicate deletion requests, unverified/missing email, failed mail provider, worker timeout after acceptance, expired delivery lease, duplicate cron workers, unsupported status values, false completion while auth identity exists, contact availability after deletion, user-controlled email/header/body injection, and missing provider credentials.

## QA / passing criteria
Authenticated production test accounts receive stable receipts; another account cannot access them. Duplicate deletion taps do not create duplicate initial notifications. Each real status change queues one notification. Request persistence never depends on a live mail call. Worker access is server-only; atomic claims and provider idempotency protect concurrent delivery. Retry/exhausted states are observable without logging message bodies or credentials. Real inbox delivery must be distinguished from provider acceptance. Actual Build 15 UI evidence must be distinguished from equivalent RPC checks. Completion email is tested after synthetic account removal in a nonproduction database. Production real accounts are never deleted as QA.

## Dependencies
User explicitly authorized shared Resend and an IShift-specific key. The existing local credential returns 401; Safari login remains pending. Physical device inventory confirms IShift 1.0.0 Build 15 installed, but iPhone Mirroring still requires Mac unlock, so actual UI acceptance remains pending. The existing 30-day target is an operational target, not proof that fulfillment has occurred.
