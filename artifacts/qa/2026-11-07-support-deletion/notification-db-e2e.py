#!/usr/bin/env python3
"""Real PostgreSQL integration E2E. No network/provider calls or production data.

Run: python3 artifacts/qa/2026-11-07-support-deletion/notification-db-e2e.py
Starts an isolated, Unix-socket-only PostgreSQL 17 cluster, applies all three
request migrations, exercises real SQL/RPC/concurrency, and always stops it.
Only case names/pass flags/counts are saved; synthetic addresses stay in memory.
"""
import concurrent.futures
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(__file__).with_name("notification-db-e2e-results.json")
PG = Path(os.environ.get("ISHIFT_QA_PG_BIN", "/opt/homebrew/opt/postgresql@17/bin"))
USER_A = "11111111-1111-4111-8111-111111111111"
USER_B = "22222222-2222-4222-8222-222222222222"
CASES = []


def main():
    started = time.monotonic()
    work = Path(tempfile.mkdtemp(prefix="ishift-mail-e2e-"))
    data, socket = work / "db", work / "socket"
    socket.mkdir()
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    env.update({"LC_ALL": "C", "LANG": "C"})
    running = False
    server_version = None

    def command(args, check=True):
        return subprocess.run(args, text=True, capture_output=True, env=env, check=check)

    def sql(statement, user=None, expect_error=None):
        prefix = ""
        if user is not None:
            prefix = f"set role authenticated; set request.jwt.claim.sub = '{user}'; "
        result = command([str(PG / "psql"), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                          "-h", str(socket), "-p", "55483", "-U", "ishiftqa", "-d", "postgres",
                          "-c", prefix + statement], check=False)
        if expect_error:
            assert result.returncode != 0 and expect_error in result.stderr, "expected_database_denial"
            return None
        if result.returncode:
            # SQL errors may include envelopes: keep them out of evidence/console.
            raise AssertionError("unexpected_database_error")
        return result.stdout.strip()

    def record(name, condition=True):
        assert condition, name
        CASES.append({"case": name, "passed": True})

    def rows(statement):
        return json.loads(sql(statement))

    def claim(limit=10, hold=0):
        statement = "select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) " \
                    f"from public.claim_request_notifications({limit}) q"
        if hold:
            statement = f"begin; {statement}; select pg_sleep({hold}); commit"
        return rows(statement)

    def finish(job, delivered=True, token=None, retry=False):
        return sql("select public.finish_request_notification("
                   f"'{job['id']}', '{token or job['claim_token']}', "
                   f"{'true' if delivered else 'false'}, "
                   f"{'null' if not delivered else chr(39) + 'qa-accepted-' + job['id'] + chr(39)}, "
                   f"{'null' if delivered else chr(39) + 'provider_unavailable' + chr(39)}, "
                   f"{'true' if retry else 'false'})") == "t"

    def drain():
        count = 0
        for _ in range(20):
            batch = claim()
            if not batch:
                return count
            for job in batch:
                assert finish(job)
                count += 1
        raise AssertionError("unexpected_queue_nontermination")

    def count(where="true"):
        return int(sql(f"select count(*) from request_mail.outbox where {where}"))

    try:
        command([str(PG / "initdb"), "-D", str(data), "-U", "ishiftqa", "-A", "trust",
                 "--encoding=UTF8", "--no-locale"])
        command([str(PG / "pg_ctl"), "-D", str(data), "-l", str(work / "postgres.log"),
                 "-o", f"-k {socket} -p 55483 -h ''", "-w", "start"])
        running = True
        server_version = sql("select current_setting('server_version')")
        sql("""
          create role anon; create role authenticated;
          create role service_role bypassrls;
          create schema auth;
          create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
          create function auth.uid() returns uuid language sql stable as $$
            select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
          create function public.update_updated_at() returns trigger language plpgsql as $$
            begin new.updated_at = now(); return new; end $$;
        """)
        paths = [ROOT / "supabase/migrations" / name for name in (
            "20261105000001_support_requests.sql", "20261105000002_account_deletion_requests.sql",
            "20261107000001_request_notifications.sql")]
        for migration in paths[:2]:
            sql(migration.read_text())
        sql(f"insert into auth.users values ('{USER_A}', 'a@example.test', now()), "
            f"('{USER_B}', 'b@example.test', now())")
        pre_support = sql("select public.submit_support_request('Synthetic pre-migration request')", USER_B)
        pre_deletion = json.loads(sql("select public.request_account_deletion()", USER_B))
        migration_text = paths[2].read_text()
        sql(migration_text)
        record("all_three_migrations_apply_to_isolated_postgresql17")
        record("existing_verified_contact_backfilled", sql(
            f"select email = 'b@example.test' from request_mail.contacts where request_id='{pre_deletion['request_id']}'") == "t")
        record("existing_support_and_open_deletion_received_backfill", count() == 4)
        backfill = migration_text[migration_text.index("with existing as ("):migration_text.index("-- RPC contract:")]
        sql(backfill)
        record("initial_backfill_repeat_is_idempotent", count() == 4)
        record("initial_backfill_deliverable", drain() == 4)

        for function in ("submit_support_request('test')", "request_account_deletion()",
                         "get_my_account_deletion_request()"):
            sql(f"set role authenticated; select public.{function}",
                expect_error="authentication required" if function.startswith("submit") else "NOT_AUTHENTICATED")
        record("unauthenticated_rpc_calls_denied")
        for statement in ("select * from public.support_requests", "select * from public.account_deletion_requests",
                          "select * from request_mail.contacts", "select * from request_mail.outbox",
                          "select * from public.claim_request_notifications(10)",
                          "select public.finish_request_notification(null,null,false)"):
            sql(statement, USER_A, expect_error="permission denied")
        record("mobile_role_denied_tables_and_worker_rpcs")
        record("service_role_worker_grants_present", sql(
            "select has_function_privilege('service_role', 'public.claim_request_notifications(integer)', 'EXECUTE') "
            "and has_function_privilege('service_role', 'public.finish_request_notification(uuid,uuid,boolean,text,text,boolean)', 'EXECUTE')") == "t")
        record("security_definer_search_paths_empty", sql(
            "select bool_and(prosecdef and proconfig @> ARRAY['search_path=\"\"']) from pg_proc "
            "where oid in ('public.claim_request_notifications(integer)'::regprocedure, "
            "'public.finish_request_notification(uuid,uuid,boolean,text,text,boolean)'::regprocedure, "
            "'request_mail.enqueue_request()'::regprocedure)") == "t")

        support = sql("select public.submit_support_request('Synthetic header-like text: Subject: harmless')", USER_A)
        record("build15_support_receipt_is_uuid", bool(re.fullmatch(r"[0-9a-f-]{36}", support)))
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            responses = list(executor.map(lambda _: json.loads(sql(
                "select public.request_account_deletion()", USER_A)), range(8)))
        deletion = responses[0]
        request_id = deletion["request_id"]
        record("build15_deletion_receipt_shape_unchanged", set(deletion) == {"request_id", "status", "requested_at"})
        record("eight_concurrent_deletion_submissions_one_request", all(r == deletion for r in responses)
               and sql(f"select count(*) from public.account_deletion_requests where user_id='{USER_A}'") == "1")
        record("duplicate_deletion_submissions_only_one_mail_pair", count(f"request_id='{request_id}'") == 2)
        other = json.loads(sql("select public.get_my_account_deletion_request()", USER_B))
        record("other_user_reads_only_own_receipt", other["request_id"] == pre_deletion["request_id"]
               and other["request_id"] != request_id)
        record("support_body_absent_from_customer_payload", sql(
            f"select not(payload ? 'message') from request_mail.outbox where request_id='{support}' and audience='customer'") == "t")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            first_worker = executor.submit(claim, 2, 0.3)
            time.sleep(0.05)
            second_worker = executor.submit(claim)
            first_jobs, second_jobs = first_worker.result(), second_worker.result()
        initial = first_jobs + second_jobs
        record("concurrent_workers_claim_disjoint_jobs", len(initial) == 4 and
               len({j["id"] for j in initial}) == 4)
        record("verified_recipient_and_reply_routes", len(initial) == 4 and all(
            (j["to_email"] == "a@example.test" and j["reply_to"] == "appai@appai.info")
            if j["audience"] == "customer" else
            (j["to_email"] == "appai@appai.info" and j["reply_to"] == "a@example.test") for j in initial))
        record("wrong_claim_token_cannot_finish", not finish(initial[0], token=USER_B))
        for job in initial:
            assert finish(job)
        record("support_contact_purged_after_receipt", sql(
            f"select count(*) from request_mail.contacts where request_id='{support}'") == "0")
        record("successful_operator_body_and_reply_snapshot_redacted", sql(
            f"select not(payload ? 'message') and operator_reply_to is null from request_mail.outbox "
            f"where request_id='{support}' and audience='operator'") == "t")

        def status(value, note=None, error=None):
            explanation = "null" if note is None else "'" + note.replace("'", "''") + "'"
            sql(f"update public.account_deletion_requests set status='{value}', operator_note={explanation} "
                f"where id='{request_id}'", expect_error=error)

        status("in_progress")
        status("action_required", error="OPERATOR_NOTE_REQUIRED")
        status("rejected", "   ", error="OPERATOR_NOTE_REQUIRED")
        status("completed", error="AUTH_ACCOUNT_STILL_EXISTS")
        status("unsupported", error="check constraint")
        record("invalid_status_missing_notes_and_false_completion_rejected")
        status("action_required", "Please confirm this synthetic case.")
        prior = count()
        status("action_required", "Updated synthetic explanation.")
        repeated = json.loads(sql("select public.request_account_deletion()", USER_A))
        record("note_only_update_and_repeated_request_do_not_notify", count() == prior and repeated["request_id"] == request_id)
        progress = claim()
        record("fifo_only_oldest_status_per_audience_claimed", len(progress) == 2 and
               all(j["event"] == "in_progress" for j in progress))
        record("parallel_claim_cannot_overtake_inflight_status", claim() == [])
        for job in progress:
            assert finish(job)
        action = claim()
        record("next_status_claims_after_prior_finished", len(action) == 2 and
               all(j["event"] == "action_required" for j in action))
        old = action[0]
        sql(f"update request_mail.outbox set lease_until=now()-interval '1 minute' where id='{old['id']}'")
        reclaimed = claim()
        record("expired_lease_reclaims_same_immutable_job", len(reclaimed) == 1 and
               reclaimed[0]["id"] == old["id"] and reclaimed[0]["claim_token"] != old["claim_token"])
        record("stale_previous_owner_cannot_finish", not finish(old))
        assert finish(reclaimed[0]) and finish(action[1])

        retry_support = sql("select public.submit_support_request('Synthetic retry case')", USER_A)
        retry_jobs = claim()
        retry_job = next(j for j in retry_jobs if j["audience"] == "operator")
        customer = next(j for j in retry_jobs if j["audience"] == "customer")
        assert finish(customer) and finish(retry_job, delivered=False, retry=True)
        record("provider_failure_schedules_backoff_without_request_loss", claim() == [] and sql(
            f"select state='pending' and attempts=1 and available_at>now() from request_mail.outbox where id='{retry_job['id']}'") == "t"
               and sql(f"select count(*) from public.support_requests where id='{retry_support}'") == "1")
        sql(f"update request_mail.outbox set available_at=now()-interval '1 second' where id='{retry_job['id']}'")
        retry = claim()[0]
        record("retry_keeps_uuid_and_rotates_owner_token", retry["id"] == retry_job["id"] and
               retry["claim_token"] != retry_job["claim_token"])
        sql(f"update request_mail.outbox set first_attempt_at=now()-interval '24 hours', "
            f"lease_until=now()-interval '1 minute' where id='{retry['id']}'")
        record("retry_window_expiry_terminal_no_resend", claim() == [] and sql(
            f"select state='failed' and failure_code='retry_exhausted' and claim_token is null "
            f"from request_mail.outbox where id='{retry['id']}'") == "t")
        record("expired_retry_token_cannot_finish", not finish(retry))

        sql(f"update auth.users set email_confirmed_at=null where id='{USER_B}'")
        unverified_support = sql("select public.submit_support_request('Synthetic unverified case')", USER_B)
        record("unverified_email_not_used_for_customer_receipt", sql(
            f"select state='failed' and failure_code='no_verified_contact' from request_mail.outbox "
            f"where request_id='{unverified_support}' and audience='customer'") == "t")
        unverified = claim()
        record("unverified_operator_mail_has_only_fixed_reply_address", len(unverified) == 1 and
               unverified[0]["to_email"] == "appai@appai.info" and unverified[0]["reply_to"] == "appai@appai.info")
        sql(f"update request_mail.outbox set attempts=8, lease_until=now()-interval '1 minute' "
            f"where id='{unverified[0]['id']}'")
        record("attempt_limit_becomes_terminal_failed", claim() == [] and sql(
            f"select state='failed' and failure_code='retry_exhausted' from request_mail.outbox "
            f"where id='{unverified[0]['id']}'") == "t")

        # This deletes only the synthetic auth row in this disposable cluster.
        sql(f"delete from auth.users where id='{USER_A}'")
        record("verified_deletion_contact_survives_auth_removal", sql(
            f"select email='a@example.test' from request_mail.contacts where request_id='{request_id}'") == "t")
        status("completed", "Synthetic isolated deletion completed.")
        completion = claim()
        record("completion_uses_own_snapshot_and_30_day_due_date", len(completion) == 2 and all(
            j["event"] == "completed" and j["request_id"] == request_id and
            j["to_email"] == ("a@example.test" if j["audience"] == "customer" else "appai@appai.info")
            for j in completion) and sql(
                f"select bool_and((payload->>'due_at')::timestamptz=(payload->>'requested_at')::timestamptz+interval '30 days') "
                f"from request_mail.outbox where request_id='{request_id}'") == "t")
        for job in completion:
            assert finish(job)
        record("completion_acceptance_purges_contact_snapshot", sql(
            f"select count(*) from request_mail.contacts where request_id='{request_id}'") == "0")
        record("other_user_contact_untouched", sql(
            f"select email='b@example.test' from request_mail.contacts where request_id='{pre_deletion['request_id']}'") == "t")
        record("outbox_failure_owner_lookup_survives_auth_removal", count(
            f"owner_id='{USER_A}' and state='failed'") == 1)
        record("queue_empty_after_terminal_jobs", claim() == [])
    except Exception as error:
        CASES.append({"case": "integration_execution", "passed": False, "error_type": type(error).__name__,
                      "reason": str(error) if isinstance(error, AssertionError) else "execution_failed"})
    finally:
        if running:
            command([str(PG / "pg_ctl"), "-D", str(data), "-m", "immediate", "-w", "stop"], check=False)
        shutil.rmtree(work, ignore_errors=True)
        report = {"suite": "IShift request notification database integration E2E",
                  "environment": "isolated PostgreSQL 17, synthetic users, Unix socket only",
                  "generated_at_utc": datetime.now(timezone.utc).isoformat(),
                  "postgres_version": server_version,
                  "auth_prerequisites": "minimal auth.users, auth.uid JWT-setting stub, update_updated_at",
                  "provider_delivery_tested": False, "mobile_build15_tested": False,
                  "passed": all(c["passed"] for c in CASES), "checks": CASES,
                  "elapsed_seconds": round(time.monotonic() - started, 2)}
        sources = [ROOT / "supabase/migrations" / name for name in (
            "20261105000001_support_requests.sql", "20261105000002_account_deletion_requests.sql",
            "20261107000001_request_notifications.sql")]
        report["source_sha256"] = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                                   for path in sources}
        OUTPUT.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"passed": report["passed"], "checks": len(CASES),
                          "evidence": str(OUTPUT.relative_to(ROOT))}))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
