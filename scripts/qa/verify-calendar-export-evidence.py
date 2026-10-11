"""Compare recorded native E2E snapshots; does not drive or mock the app."""
import json
from pathlib import Path
root = Path('artifacts/qa/2026-10-11-calendar-export')
def read(name):
    return json.loads((root / (name + '.json')).read_text())
def state(item):
    return item['calendars'], item['managedEvents']
before, cancelled, renamed, repeated, offline, final = map(read, ['baseline', 'after-cancel', 'renamed-blue', 'repeated-sync', 'offline-export-blocked', 'final'])
assert state(before) == state(cancelled), 'Cancel mutated native state'
assert len(before['calendars']) == len(renamed['calendars']), 'Unexpected calendar creation'
original = next(c for c in before['calendars'] if c['title'] == 'IShift')
updated = next(c for c in renamed['calendars'] if c['UUID'] == original['UUID'])
assert updated['title'] == '工作' and updated['color'].lower() == '#4a90e2'
assert [c for c in before['calendars'] if c['UUID'] != original['UUID']] == [c for c in renamed['calendars'] if c['UUID'] != original['UUID']]
assert len(renamed['managedEvents']) == 3
assert {e['UUID'] for e in before['managedEvents']} == {e['UUID'] for e in renamed['managedEvents']}
assert all(e['calendar_uuid'] == original['UUID'] and e['summary'] == 'Day shift (D) · Alex QA' for e in renamed['managedEvents'])
assert state(renamed) == state(repeated) == state(offline) == state(final)
result = {'passed': True, 'boundary': 'Recorded native E2E snapshot comparison; UI observations documented in README', 'checks': ['cancel preserves native state', 'rename and recolor preserve calendar UUID', 'unrelated calendars unchanged', 'three event UUIDs preserved', 'shift-first titles applied', 'repeat sync is idempotent', 'offline export and logout leave native events unchanged']}
(root / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
