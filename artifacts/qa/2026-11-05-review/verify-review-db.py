"""Integration acceptance: only connects to the dedicated synthetic local review cluster.
Start that cluster first, then run this file with Python 3. Uses a new random local
database each time; writes a redacted result, leaves the database for inspection.
"""
import pathlib, subprocess, uuid, json, re, concurrent.futures, datetime, hashlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
host = pathlib.Path('/tmp/ishift-review-active-pgdir').read_text().strip()
assert re.fullmatch(r'/tmp/ishift-review-pg\.[a-zA-Z0-9]+', host)
db = 'reviewqa_' + uuid.uuid4().hex[:12]
res = []
def run(s, database=None, ok=True):
    p = subprocess.run(['psql','-XqAt','-v','ON_ERROR_STOP=1','-h',host,'-p','55479','-U','reviewqa','-d',database or db],input=s,text=True,capture_output=True)
    if p.returncode and ok: raise RuntimeError(p.stderr)
    return p
def val(s): return run(s).stdout.strip()
def check(name, condition):
    if not condition: raise AssertionError(name)
    res.append(name)
def deny(query, err):
    a=run(query,ok=False)
    return a.returncode!=0 and err in a.stderr
run(f'CREATE DATABASE {db}', 'postgres')
run((ROOT/'scripts/qa/database-bootstrap.sql').read_text())
run("DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
for f in sorted((ROOT/'supabase/migrations').glob('*.sql')):
    src=f.read_text()
    if f.name.startswith('20260129'):
        # Same test-only expression index equivalence as scripts/qa/database-integration.py.
        unique=next(line for line in src.splitlines() if 'UNIQUE(user_id, code, COALESCE' in line)
        src=src.replace("    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,\n    -- Unique constraint","    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL\n    -- Unique constraint").replace(unique,'')
        src+='\nCREATE UNIQUE INDEX qa_shift_code_unique ON shift_codes '+unique.strip()[6:]+';'
    run(src)
A,B,C,D,E=[str(uuid.uuid4()) for _ in range(5)]
run("INSERT INTO auth.users (id,email) VALUES "+','.join("('%s','qa%s@example.invalid')"%(x,i) for i,x in enumerate((A,B,C,D,E)))+';')
def asuser(user):return "SET ROLE authenticated; SET request.jwt.claim.sub TO '%s'; "%user
support="SELECT public.submit_support_request('hello')"
request="SELECT public.request_account_deletion()->>'request_id'"
status="SELECT public.get_my_account_deletion_request()->>'request_id'"
for tbl in ('support_requests','account_deletion_requests'):
    for role in ('anon','authenticated'):
        for q in (f'SELECT * FROM public.{tbl}', f'DELETE FROM public.{tbl}', f'INSERT INTO public.{tbl} DEFAULT VALUES',f'UPDATE public.{tbl} SET id=id'):
            check(role+' cannot '+q.split()[0]+' '+tbl,deny('SET ROLE '+role+'; '+q,'permission denied'))
for q in (support,request,status):
    check('anonymous cannot '+q,deny('SET ROLE anon; '+q,'permission denied'))
    check('authenticated role without caller cannot '+q,deny('SET ROLE authenticated; '+q,'authentication required' if q==support else 'NOT_AUTHENTICATED'))
for expr in ("NULL","'   '","chr(9)||chr(10)","repeat('a',2001)"):
    check('support rejects '+expr,deny(asuser(A)+'SELECT public.submit_support_request('+expr+')','invalid message length'))
one=val(asuser(A)+"SELECT public.submit_support_request('  message  ')")
check('support derives sender and trims message',val(f"SELECT user_id='{A}' AND message='message' FROM public.support_requests WHERE id='{one}'")=='t')
check('support permits exactly 2000 chars',bool(val(asuser(A)+"SELECT public.submit_support_request(repeat('x',2000))")))
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    attempts=list(ex.map(lambda _:run(asuser(A)+support,ok=False),range(8)))
check('concurrent submissions stop at five in rolling window',sum(not a.returncode for a in attempts)==3 and all(not a.returncode or 'limit exceeded' in a.stderr for a in attempts))
check('other customer has separate quota',bool(val(asuser(B)+support)))
run(f"UPDATE public.support_requests SET created_at=now()-interval '61 minutes' WHERE id='{one}'")
check('expired receipt frees one quota slot',bool(val(asuser(A)+support)))
check('deletion status initially empty',val(asuser(C)+status)=='')
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex: ids=list(ex.map(lambda _:val(asuser(C)+request),range(8)))
rc=ids[0]
check('eight concurrent deletion requests receive same receipt',bool(rc) and len(set(ids))==1 and val(f"SELECT count(*) FROM account_deletion_requests WHERE user_id='{C}'")=='1')
check('other customer cannot see request',val(asuser(D)+status)=='')
rd=val(asuser(D)+request)
check('separate authenticated receipts',rd!=rc and val(asuser(C)+status)==rc and val(asuser(D)+status)==rd)
for st in ('in_progress','action_required'):
    run(f"SET ROLE service_role; UPDATE account_deletion_requests SET status='{st}' WHERE id='{rc}'")
    check('repeat in '+st+' returns same ID',val(asuser(C)+request)==rc)
run(f"UPDATE account_deletion_requests SET status='rejected' WHERE id='{rc}'")
check('new request after rejection gets new receipt',val(asuser(C)+request)!=rc)
g=str(uuid.uuid4())
run(f"INSERT INTO groups(id,name,invite_code,created_by) VALUES ('{g}','Synthetic shared group','QA-X','{D}'); INSERT INTO group_members(group_id,user_id,role) VALUES ('{g}','{C}','admin') ON CONFLICT DO NOTHING;")
run(f"INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('shift-images','{D}/nested/roster.png','{D}'),('note-images','{D}/note.png','{D}'),('shift-images','{C}/nested/other.png','{C}')")
run(asuser(D)+support)
report=val((ROOT/'scripts/admin/account-deletion-dry-run.sql').read_text().replace('REPLACE_WITH_REQUEST_UUID',rd))
lines=dict(line.split('|',1) for line in report.splitlines())
check('operator identifies seeded shared group among all owned groups',g in json.loads(lines['owned_groups'])['group_ids'] and 'Synthetic shared group' in report)
check('operator dry run scopes both storage buckets to requester',json.loads(lines['storage_objects'])=={'shift_images':1,'note_images':1})
# Simulate explicitly approved decisions and Storage API result using fake storage table.
run(f"UPDATE groups SET created_by='{C}' WHERE id='{g}'; DELETE FROM storage.objects WHERE name LIKE '{D}/%' AND bucket_id IN ('shift-images','note-images'); DELETE FROM auth.users WHERE id='{D}'; UPDATE account_deletion_requests SET status='completed' WHERE id='{rd}'")
check('transferred shared group and remaining admin survive deletion',val(f"SELECT count(*) FROM groups g JOIN group_members m ON m.group_id=g.id WHERE g.id='{g}' AND g.created_by='{C}' AND m.user_id='{C}'")=='1')
check('other account storage remains, requester objects removed',val(f"SELECT count(*)=1 AND bool_and(owner_id='{C}') FROM storage.objects WHERE owner_id IN ('{D}','{C}')")=='t')
check('requester support inbox entries cascade',val(f"SELECT count(*) FROM support_requests WHERE user_id='{D}'")=='0')
check('leftover JWT cannot open a new deletion request',deny(asuser(D)+request,'ACCOUNT_NOT_FOUND'))
check('leftover JWT sees own completed receipt only',val(asuser(D)+"SELECT get_my_account_deletion_request()->>'status'")=='completed')
check('completion receipt survives deletion of auth identity',val(f"SELECT count(*) FROM account_deletion_requests WHERE id='{rd}' AND status='completed'")=='1')
check('other identity unaffected by deletion',val(f"SELECT count(*) FROM auth.users WHERE id='{C}'")=='1')

out={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'boundary':'Local PostgreSQL; simulated Supabase auth, storage schema and service role. No production or external systems. Historical first migration expression index shim. No hosted API or Apple OAuth test.', 'migrations_sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted((ROOT/'supabase/migrations').glob('20261105*.sql'))},'checks':res,'count':len(res)}
(HERE/'db-acceptance.json').write_text(json.dumps(out,indent=2)+'\n')
print('PASS',len(res),'scenario checks')
