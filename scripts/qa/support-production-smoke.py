"""Production HTTP smoke using an explicitly provisioned synthetic QA account.
Usage: python3 scripts/qa/support-production-smoke.py --state /private/tmp/ishift-support-prod-qa.json
The mode-0600 state file is local only and contains temporary login credentials.
No new identity, mail, support message or deletion is created by this script.
It retries the existing deletion request to verify idempotency.
"""
import argparse
import datetime
import json
import pathlib
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--state', required=True, type=pathlib.Path)
args = parser.parse_args()
if args.state.stat().st_mode & 0o077:
    raise SystemExit('State file must be mode 0600')
state = json.loads(args.state.read_text())
assert len(state['accounts']) == 2 and state['run'].isdigit()
assert all('ishiftqa-' + state['run'] in a['email'] for a in state['accounts'])
checks = []


def call(path, data=None, token=None):
    req = urllib.request.Request(state['base'] + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={'apikey': state['anon'], 'Authorization': 'Bearer ' + (token or state['anon']),
                 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, None


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)


tokens = []
for account in state['accounts']:
    code, session = call('/auth/v1/token?grant_type=password',
        {'email': account['email'], 'password': account['password']})
    check('synthetic account signs in', code == 200)
    tokens.append(session['access_token'])

code, current = call('/rest/v1/rpc/get_my_account_deletion_request', {}, tokens[0])
check('customer reads operator-updated status', code == 200 and current['status'] == 'in_progress')
code, retry = call('/rest/v1/rpc/request_account_deletion', {}, tokens[0])
check('retry reuses current receipt', code == 200 and retry == current)
check('original receipt retained', current['request_id'] == state['deletion_receipt']['request_id'])
code, other = call('/rest/v1/rpc/get_my_account_deletion_request', {}, tokens[1])
check('other customer sees no request', code == 200 and other is None)
for table in ['support_requests', 'account_deletion_requests']:
    code, _ = call('/rest/v1/' + table + '?select=id', token=tokens[0])
    check('private table denied: ' + table, code in [401, 403])
for fn, data in [('submit_support_request', {'p_message': 'anonymous smoke'}),
                 ('request_account_deletion', {}), ('get_my_account_deletion_request', {})]:
    code, _ = call('/rest/v1/rpc/' + fn, data)
    check('anonymous denied: ' + fn, code in [401, 403])

output = {'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'boundary': 'Production authenticated HTTP; synthetic identities. Not actual Build 15 UI or inbox delivery.',
    'count': len(checks), 'checks': checks}
dest = pathlib.Path(__file__).resolve().parents[2] / 'artifacts/qa/2026-11-07-support-deletion/production-status.json'
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps(output, indent=2))
