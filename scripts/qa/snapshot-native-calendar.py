"""Read-only evidence from the dedicated synthetic IShift QA simulator.

Never pass a real device or personal simulator. This fixed device was created
for QA; the script never mutates Calendar data. Run before/after UI scenarios.
"""
import argparse
import datetime
import json
import pathlib
import sqlite3

DEVICE = 'C03ECA22-BBD2-4CA9-837B-330A788CADF7'
parser = argparse.ArgumentParser()
parser.add_argument('label', help='Evidence filename without extension')
args = parser.parse_args()
if not args.label.replace('-', '').replace('_', '').isalnum():
    parser.error('Use letters, digits, hyphens and underscores only')
db = pathlib.Path.home() / 'Library/Developer/CoreSimulator/Devices' / DEVICE / 'data/Library/Calendar/Calendar.sqlitedb'
connection = sqlite3.connect(db.as_uri() + '?mode=ro', uri=True)
connection.row_factory = sqlite3.Row
calendars = [dict(r) for r in connection.execute('SELECT ROWID AS row_id, UUID, title, color FROM Calendar ORDER BY ROWID')]
events = [dict(r) for r in connection.execute('''SELECT i.UUID, i.summary, i.start_date, i.end_date, i.calendar_id, c.UUID AS calendar_uuid, c.title AS calendar_title
 FROM CalendarItem i JOIN Calendar c ON c.ROWID=i.calendar_id
 WHERE i.description LIKE ? ORDER BY i.start_date, i.UUID''', ('%IShift-Sync-Key: IShift:v2:00000000-0000-4000-8000-000000000001:%',))]
out = pathlib.Path('artifacts/qa/2026-10-11-calendar-export') / (args.label + '.json')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'device': DEVICE, 'boundary': 'Read-only synthetic simulator Calendar database', 'calendars': calendars, 'managedEvents': events}, indent=2, ensure_ascii=False) + '\n')
print(f'{out}: {len(calendars)} calendars, {len(events)} synthetic managed events')
