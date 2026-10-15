"""Read-only snapshots of the dedicated synthetic QA simulator calendar."""
import argparse, json, pathlib, sqlite3
parser=argparse.ArgumentParser(); parser.add_argument('label'); args=parser.parse_args()
if not args.label.replace('-','').isalnum(): parser.error('alphanumeric and hyphen labels only')
device='C03ECA22-BBD2-4CA9-837B-330A788CADF7'
db=pathlib.Path.home()/'Library/Developer/CoreSimulator/Devices'/device/'data/Library/Calendar/Calendar.sqlitedb'
c=sqlite3.connect(db.as_uri()+'?mode=ro',uri=True); c.row_factory=sqlite3.Row
rows=[dict(r) for r in c.execute('SELECT ROWID,UUID,summary,description,start_date,end_date,all_day,calendar_id FROM CalendarItem WHERE description LIKE ? ORDER BY UUID',('%IShift-Sync-Key: IShift:v2:00000000-0000-4000-8000-000000000001:%',))]
for r in rows:
 r['alarms']=[dict(a) for a in c.execute('SELECT trigger_date,trigger_interval,type,disabled FROM Alarm WHERE calendaritem_owner_id=? ORDER BY ROWID',(r.pop('ROWID'),))]
out=pathlib.Path('artifacts/qa/2026-10-15-calendar-code-first')/(args.label+'.json'); out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'device':device,'boundary':'read-only dedicated synthetic simulator EventKit sqlite','events':rows},ensure_ascii=False,indent=2)+'\n')
print(str(out),len(rows),'synthetic events')
