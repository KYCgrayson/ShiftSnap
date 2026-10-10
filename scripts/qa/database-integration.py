#!/usr/bin/env python3
"""Local-only migration/RLS/transaction regression runner; never targets production.

Requires private QA PostgreSQL on port 55438. Uses a disposable database and
Supabase infrastructure stand-ins. Does not prove hosted Storage/Auth behavior.
Failure cases are authored before the new replace RPC implementation.
"""
import json
import pathlib
import subprocess
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
DB = 'ishift_reliability_qa'
BASE = ['psql', '-X', '-h', '127.0.0.1', '-p', '55438', '-v', 'ON_ERROR_STOP=1', '-At']
results = []

def sql(source, db=DB, check=True):
    p = subprocess.run(BASE + ['-d', db], input=source, text=True, capture_output=True)
    if check and p.returncode:
        raise RuntimeError(p.stderr)
    return p

def check(name, source):
    p = sql(source)
    if not p.stdout.strip().endswith('t'):
        raise AssertionError(name + ': ' + p.stdout)
    results.append({'scenario': name, 'passed': True})

sql(f'DROP DATABASE IF EXISTS {DB}; CREATE DATABASE {DB};', db='postgres')
sql((ROOT/'scripts/qa/database-bootstrap.sql').read_text())
for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
    source = path.read_text()
    if path.name.startswith('20260129'):
        # Existing historical schema uses expression UNIQUE table syntax, which
        # PostgreSQL rejects. Equivalent expression index is test-bootstrap only.
        constraint = "    UNIQUE(user_id, code, COALESCE(person_id, '00000000-0000-0000-0000-000000000000'::UUID), COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::UUID))"
        source = source.replace("    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,\n    -- Unique constraint", "    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL\n    -- Unique constraint")
        source = source.replace(constraint, '')
        source += "\nCREATE UNIQUE INDEX shift_codes_qa_unique ON shift_codes (user_id, code, COALESCE(person_id, '00000000-0000-0000-0000-000000000000'::UUID), COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::UUID));"
    sql(source)
    results.append({'migration': path.name, 'passed': True})

def uid(n): return f'00000000-0000-4000-8000-{n:012d}'
A,B,C = [uid(n) for n in (1,2,3)]
G,H = uid(10),uid(11)
OLD,NEW,OTHER,NEXT,FOREIGN = [uid(n) for n in (20,21,22,23,24)]
P,Q = uid(30),uid(31)
sql(f"""
INSERT INTO auth.users(id,email) VALUES ('{A}','qa-a@example.invalid'),('{B}','qa-b@example.invalid'),('{C}','qa-c@example.invalid');
INSERT INTO groups(id,name,invite_code,created_by) VALUES ('{G}','QA G','QA-G','{A}'),('{H}','QA H','QA-H','{A}');
INSERT INTO group_members(group_id,user_id,role) VALUES ('{G}','{A}','admin'),('{G}','{B}','member'),('{H}','{A}','admin');
INSERT INTO persons(id,owner_id,group_id,name) VALUES ('{P}','{A}','{G}','QA Person'),('{Q}','{A}','{H}','Other Person');
INSERT INTO schedules(id,owner_id,group_id,image_url,year_month) VALUES
('{OLD}','{A}','{G}','qa-old','2026-10'),('{NEW}','{A}','{G}','qa-new','2026-10'),
('{OTHER}','{A}','{H}','qa-other','2026-10'),('{NEXT}','{A}','{G}','qa-next','2026-11'),('{FOREIGN}','{B}','{G}','qa-foreign','2026-10');
INSERT INTO shifts(schedule_id,user_id,date,shift_code) VALUES
('{OLD}','{A}','2026-10-10','OLD'),('{OTHER}','{A}','2026-10-10','OTHER'),
('{NEXT}','{A}','2026-11-10','NEXT'),('{FOREIGN}','{B}','2026-10-10','FOREIGN');
""")

def payload(**kw):
    row = dict(user_id=A,person_id=P,date='2026-10-10',shift_code='D',start_time='09:00',end_time='17:00',is_day_off=False,source='self_scan',name_on_schedule='QA Person')
    row.update(kw)
    return row

def call(rows, caller=A, schedule=NEW, month='2026-10'):
    raw=json.dumps(rows).replace("'", "''")
    return f"SET ROLE authenticated; SET request.jwt.claim.sub='{caller}'; SET statement_timeout='5s'; SELECT public.replace_schedule_shifts('{schedule}','{month}','{raw}'::jsonb);"

def rejected(name, rows, **kw):
    before=sql('SELECT md5(string_agg(row_to_json(s)::text,\'\' ORDER BY id)) FROM shifts s;').stdout
    p=sql(call(rows, **kw),check=False)
    after=sql('SELECT md5(string_agg(row_to_json(s)::text,\'\' ORDER BY id)) FROM shifts s;').stdout
    assert p.returncode and before==after, name
    results.append({'scenario':name,'passed':True})

check('replacement RPC is installed', "SELECT to_regprocedure('public.replace_schedule_shifts(uuid,text,jsonb)') IS NOT NULL;")
rejected('empty OCR cannot erase existing month', [])
rejected('invalid second row preserves entire original month', [payload(),payload(date='2026-10-99')])
rejected('foreign person rejected without deleting originals', [payload(person_id=Q)])
rejected('non-member target rejected', [payload(user_id=C)])
rejected('other uploader schedule rejected', [payload()], caller=B)
rejected('anonymous caller rejected', [payload()], caller='')
sql(call([payload(),payload(date='2026-10-11',user_id=B)]))
check('valid replacement inserts complete payload and removes old scoped rows',f"SELECT (SELECT count(*) FROM shifts WHERE schedule_id='{NEW}')=2 AND NOT EXISTS(SELECT 1 FROM shifts WHERE schedule_id='{OLD}');")
check('other group next month and other uploader survive',"SELECT count(*)=3 FROM shifts WHERE shift_code IN ('OTHER','NEXT','FOREIGN');")
sql(call([payload(),payload(date='2026-10-11',user_id=B)]))
check('retry does not duplicate rows',f"SELECT count(*)=2 FROM shifts WHERE schedule_id='{NEW}';")
rejected('invalid source rolls back valid first row', [payload(),payload(source='invalid')])
sql("""
CREATE FUNCTION qa_reject_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.shift_code='FAIL' THEN RAISE EXCEPTION 'injected insert failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER qa_reject_insert BEFORE INSERT ON shifts FOR EACH ROW EXECUTE FUNCTION qa_reject_insert();
""")
rejected('database insert failure after deletion rolls back all rows', [payload(),payload(shift_code='FAIL')])
sql('DROP TRIGGER qa_reject_insert ON shifts; DROP FUNCTION qa_reject_insert();')

# Two different uploads replace one month concurrently; the final month must
# contain one complete payload, never mixed or duplicated data.
first = subprocess.Popen(BASE+['-d',DB],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
first.stdin.write('BEGIN;'+call([payload(shift_code='FIRST'),payload(date='2026-10-11',shift_code='FIRST')])+"SELECT pg_sleep(0.5); COMMIT;")
first.stdin.close()
time.sleep(0.1)
second=sql(call([payload(shift_code='SECOND'),payload(date='2026-10-11',shift_code='SECOND')],schedule=OLD))
first.wait(timeout=10)
assert first.returncode==0, first.stderr.read()
check('concurrent uploads leave one complete winning month', f"SELECT count(*)=2 AND count(DISTINCT shift_code)=1 AND min(shift_code)='SECOND' FROM shifts WHERE schedule_id IN ('{OLD}','{NEW}');")

CORRECTED=uid(25)
sql(f"INSERT INTO schedules(id,owner_id,group_id,image_url,year_month) VALUES ('{CORRECTED}','{A}','{G}','qa-corrected','2026-09'); INSERT INTO shifts(schedule_id,user_id,date,shift_code) VALUES ('{CORRECTED}','{A}','2026-09-15','WRONG_MONTH');")
sql(call([payload(date='2026-10-15')],schedule=CORRECTED))
check('corrected OCR month updates schedule and removes its old-month rows', f"SELECT (SELECT year_month FROM schedules WHERE id='{CORRECTED}')='2026-10' AND NOT EXISTS(SELECT 1 FROM shifts WHERE schedule_id='{CORRECTED}' AND date<'2026-10-01');")
check('month correction still preserves unrelated scopes', "SELECT count(*)=3 FROM shifts WHERE shift_code IN ('OTHER','NEXT','FOREIGN');")

# Exercise the pre-existing roster feature through the actual authenticated RPCs.
resolved=sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{A}'; SELECT resolve_roster_person('{G}','Alex0','#4A9DAD');").stdout.strip().splitlines()[-1]
alias=sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{A}'; SELECT resolve_roster_person('{G}','Alex1','#4A9DAD');").stdout.strip().splitlines()[-1]
merge=sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{A}'; SELECT merge_roster_people('{resolved}','{alias}');").stdout.strip().splitlines()[-1]
check('existing roster merge assigns canonical identity',f"SELECT canonical_person_id='{resolved}' FROM persons WHERE id='{alias}';")
sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{A}'; SELECT undo_roster_people_merge('{merge}');")
check('existing roster merge undo restores independent identity',f"SELECT canonical_person_id=id FROM persons WHERE id='{alias}';")
sql(f"DELETE FROM group_members WHERE group_id='{G}' AND user_id='{A}';")
rejected('removed membership cannot replace', [payload()])

out=ROOT/'artifacts/qa/2026-10-10/database-integration.json'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'boundary':'Real PostgreSQL 17; local Supabase Auth/Storage schema stand-ins; historical expression-index adapter', 'results':results},indent=2)+'\n')
print(f'PASS: {len(results)} migration/scenario checks. Artifact: {out.relative_to(ROOT)}')
