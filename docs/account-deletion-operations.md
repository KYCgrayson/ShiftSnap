# Account deletion request operations

## What the in-app action does

The Settings action submits an authenticated request and returns a stable receipt. The backend derives the account ID from `auth.uid()`; clients cannot submit a different account ID. A per-account transaction lock and partial unique index make repeat taps and network retries return the same open request. The user stays signed in while the request is pending. This flow does not delete data or claim that deletion has already happened.

Statuses are `pending`, `in_progress`, `action_required`, `completed`, and `rejected`. Only `pending`, `in_progress`, and `action_required` block another request. The queue stores the account UUID and request metadata, but no email, message, or OAuth credential. The UUID has no foreign key so the receipt survives auth-user deletion; set and enforce an owner-approved retention period before production use.

The app currently tells users processing may take up to 30 days. **The 30-day target is proposed and requires product/legal owner approval before release.** Apple permits manual account deletion if users are told the expected time and receive completion confirmation; this screen and process must stay truthful if the approved target changes.

## Operator workflow

1. In the restricted Supabase project console, open `public.account_deletion_requests` and claim one `pending` request by changing it to `in_progress`. Record the receipt ID in the internal work log. Do not copy the user UUID or email into a public issue, log, or chat.
2. Run [`scripts/admin/account-deletion-dry-run.sql`](../scripts/admin/account-deletion-dry-run.sql) in the restricted SQL editor after replacing its two request UUID placeholders with the queue receipt ID. Confirm that the first result is exactly one request and review every reported count plus the creator-owned group detail result. The SQL is read-only and intentionally does not execute deletion.
3. Before changing records, inspect affected group memberships and schedule sharing. A group row has `created_by REFERENCES users(id) ON DELETE CASCADE`; deleting its creator deletes the group and all memberships. If the group should remain, obtain an explicit transfer decision and assign `created_by` to a consenting existing member/admin before account removal. If it should close, notify remaining members first. Do not assume the requester owns the other members' schedules or data.
4. Inspect schedules owned by the requester that are shared with other users. Deleting the uploader's schedule cascades its shifts and removes the shared roster image. Give recipients notice and time to retain or re-upload information they are entitled to keep. Do not silently reassign a claim or a schedule to another user.
5. Inspect roster identities and reversible merge history. `roster_identity_merges` and its `previous_*_person_id` movement columns contain non-cascading foreign keys to people. These may block person deletion. Review each affected group history with its remaining admin; remove or safely resolve only the rows needed for the approved deletion, and record why. Do not disable constraints or run a blanket cascade.
6. Check the login provider. For Sign in with Apple, Apple recommends revoking the user's tokens through its REST API when a revocation credential is available. The current native sign-in path passes an identity token to Supabase but does not persist Apple's authorization code or refresh token for later revocation. If no revocation token exists, complete the data deletion anyway and send the user Apple's documented manual revocation guidance through the verified account email. For Google, remove the app's account data and do not retain provider credentials.
7. Remove the requester's objects from both `shift-images` and `note-images` using the owner UUID folder and verify removal. `note-images` is a public-read bucket, so verify its public objects are gone before finalizing. Do not delete objects from other owners' folders.
8. Resolve any recorded `action_required` items with the user through the verified account email. If deletion cannot proceed, change status to `rejected` only with a clear explanation sent to the user; do not leave a request silently in progress.
9. After dependencies are resolved, remove the user's remaining account rows and auth identity using the restricted administrative process. Let database cascades remove only the reviewed, requester-owned rows. Do not delete an owned group until the transfer/closure decision above is complete. If any FK blocks deletion, stop, return the request to `action_required`, and investigate rather than disabling the constraint.
10. Verify that the auth identity is gone, the dry-run counts for owned data are zero where applicable, and both owner-folder object listings are empty. Then mark the durable request `completed` and send a completion message to the verified account email, including the request receipt and any data retained under a documented legal requirement. Tell the user to reopen IShift while online so it can read the completed receipt and clear its local account cache; if the old session can no longer reach the backend, tell them to sign out or remove the app data on that device. This final message is part of fulfillment, not optional.

## Deployment and release gate

- Apply the account deletion request migration before building the app. Do not submit a build where the RPC is missing; submission must show either a confirmed receipt or an honest error.
- Product/legal owner must approve the displayed 30-day target and the request-record retention period.
- Assign a named operator and backup, verify their restricted console access, and dry-run the SQL report against synthetic local data before enabling the action for real accounts.
- Review whether to add secure Sign in with Apple token capture/revocation for future accounts. Current code cannot promise automatic revocation of existing Apple grants.
- Do not claim App Store readiness until a real request has been fulfilled end-to-end in a non-production environment and the completion communication has been checked. No production account or data was deleted as part of this implementation.

## References

- [Apple: Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Apple: TN3194 — Handling account deletions and revoking tokens for Sign in with Apple](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)
