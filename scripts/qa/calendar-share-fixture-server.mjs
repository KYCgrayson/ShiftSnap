// Synthetic Supabase HTTP boundary for native calendar PNG share QA.
// Uses the existing native-reliability.entry.js and fixed, invented identities.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = 55439;
const ownerId = '00000000-0000-4000-8000-000000000001';
const coworkerId = '00000000-0000-4000-8000-000000000002';
const groupId = '00000000-0000-4000-8000-000000000010';
const ownerPersonId = '00000000-0000-4000-8000-000000000030';
const coworkerPersonId = '00000000-0000-4000-8000-000000000031';
const referencePersonId = '00000000-0000-4000-8000-000000000032';
const scheduleIds = {
  '2026-08': '00000000-0000-4000-8000-000000000018',
  '2026-10': '00000000-0000-4000-8000-000000000020',
  '2026-11': '00000000-0000-4000-8000-000000000021',
};
const createdAt = '2026-10-01T00:00:00.000Z';
const artifact = path.resolve('artifacts/qa/2026-10-12-calendar-share/native-http-boundary.json');
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const group = { id: groupId, name: 'QA Team', invite_code: 'QA-ONLY', created_by: ownerId, settings: {}, created_at: createdAt };
const persons = [
  { id: ownerPersonId, name: 'Alex QA', owner_id: ownerId, group_id: groupId, canonical_person_id: ownerPersonId, color: '#4A9DAD', avatar_url: null, notes: null, created_at: createdAt },
  { id: coworkerPersonId, name: 'Casey Coworker', owner_id: coworkerId, group_id: groupId, canonical_person_id: coworkerPersonId, color: '#9765C9', avatar_url: null, notes: null, created_at: createdAt },
  { id: referencePersonId, name: 'Taylor Reference', owner_id: ownerId, group_id: groupId, canonical_person_id: referencePersonId, color: '#43A66A', avatar_url: null, notes: null, created_at: createdAt },
];

const codes = [
  ['E', 'Early', '07:00:00', '15:00:00', false],
  ['L', 'Late', '15:00:00', '23:00:00', false],
  ['OFF', 'Rest day', null, null, true],
  ['EXTENDED-SUPERVISORY-SHIFT', 'Extended supervisory and training shift with a deliberately long label', '08:30:00', '19:30:00', false],
].map(([code, meaning, start_time, end_time, is_day_off], index) => ({
  id: uuid(40 + index), user_id: ownerId, group_id: groupId, code, meaning, start_time, end_time,
  is_day_off, is_confirmed: true, is_group_shared: true,
}));

const shifts = [];
function addShift(number, date, code, options = {}) {
  const codeInfo = codes.find((item) => item.code === code);
  const personal = options.personal !== false;
  const coworker = options.coworker === true;
  const personId = coworker ? coworkerPersonId : personal ? ownerPersonId : referencePersonId;
  const userId = coworker ? coworkerId : ownerId;
  shifts.push({
    id: uuid(1000 + number), schedule_id: scheduleIds[date.slice(0, 7)], user_id: userId, person_id: personId,
    date, shift_code: code, start_time: codeInfo?.start_time ?? null, end_time: codeInfo?.end_time ?? null,
    is_day_off: codeInfo?.is_day_off ?? false,
    source: personal ? 'self_scan' : 'group_scan',
    name_on_schedule: options.name || (coworker ? 'Casey Coworker' : personal ? 'Alex QA' : 'Taylor Reference'),
    comparison_status: 'pending', calendar_event_id: null, synced_at: null,
    created_at: `${date}T00:00:00.000Z`, schedules: { group_id: groupId },
    // Not a database column. Native month state derives this from the personal RPC ID set.
    is_personal: personal && !coworker,
  });
}

// October is the current QA month. Two blank dates distinguish no row from OFF.
for (let day = 1; day <= 31; day += 1) {
  if (day === 6 || day === 21) continue;
  const code = day % 5 === 0 ? 'OFF' : day % 2 === 0 ? 'L' : 'E';
  addShift(day, `2026-10-${String(day).padStart(2, '0')}`, code);
}
addShift(112, '2026-10-12', 'E'); // Same date as the normal late shift.
addShift(117, '2026-10-17', 'EXTENDED-SUPERVISORY-SHIFT', {
  name: 'Alexandria Quality Assurance Long Roster Name',
});
addShift(191, '2026-10-02', 'L', { coworker: true });
addShift(192, '2026-10-12', 'E', { coworker: true });
addShift(193, '2026-10-31', 'OFF', { coworker: true });
addShift(194, '2026-10-17', 'L', { personal: false });

// Adjacent month has different codes and an explicit last-day row.
for (const [day, code] of [[1, 'OFF'], [3, 'E'], [7, 'L'], [12, 'E'], [18, 'OFF'], [24, 'L'], [30, 'E']]) {
  addShift(300 + day, `2026-11-${String(day).padStart(2, '0')}`, code);
}
addShift(391, '2026-11-12', 'L', { coworker: true });

// August 2026 starts on Saturday and its 31st is Monday: six Sunday-first rows.
for (const [day, code] of [[1, 'E'], [2, 'L'], [8, 'OFF'], [15, 'E'], [22, 'L'], [29, 'OFF'], [31, 'E']]) {
  addShift(500 + day, `2026-08-${String(day).padStart(2, '0')}`, code);
}
addShift(591, '2026-08-31', 'L', { coworker: true });

const notes = [{
  id: uuid(700), user_id: ownerId, date: '2026-10-12',
  content: 'QA_NOTE_SENTINEL_NEVER_IN_SHARED_PNG',
  image_urls: ['calendar-share/QA_NOTE_PHOTO_SENTINEL_NEVER_IN_SHARED_PNG.jpg'],
  created_at: createdAt, updated_at: createdAt,
}];
const schedules = Object.entries(scheduleIds).map(([year_month, id]) => ({
  id, owner_id: ownerId, group_id: groupId, year_month,
  image_url: `calendar-share/${year_month}_QA_SCHEDULE_PHOTO_SENTINEL_NEVER_IN_SHARED_PNG.jpg`,
  image_status: 'uploaded', created_at: createdAt,
}));
const personalIds = new Set(shifts.filter((item) => item.is_personal).map((item) => item.id));
const databaseShift = ({ is_personal, ...row }) => row;
const rpcShift = ({ is_personal, schedules, ...row }) => row;
const byDate = (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
const requests = [];
let offline = false;

function save() {
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, JSON.stringify({
    boundary: 'Synthetic localhost Supabase HTTP; real iOS app, storage, and views',
    fixture: 'calendar share 2026-10-12', requests,
  }, null, 2));
}

function matchesDate(row, url, start, end) {
  if (start && row.date < start) return false;
  if (end && row.date > end) return false;
  for (const filter of url.searchParams.getAll('date')) {
    const [operator, value] = filter.split(/\.(.*)/s);
    if (operator === 'gte' && row.date < value) return false;
    if (operator === 'lte' && row.date > value) return false;
    if (operator === 'eq' && row.date !== value) return false;
  }
  return true;
}

function matchesUser(row, url) {
  const filter = url.searchParams.get('user_id');
  if (!filter) return true;
  if (filter.startsWith('eq.')) return row.user_id === filter.slice(3);
  if (filter.startsWith('neq.')) return row.user_id !== filter.slice(4);
  return true;
}

function matchesGroup(row, url) {
  const filter = url.searchParams.get('schedules.group_id');
  if (!filter) return true;
  if (filter.startsWith('in.(') && filter.endsWith(')')) {
    return filter.slice(4, -1).split(',').includes(row.schedules.group_id);
  }
  if (filter.startsWith('eq.')) return row.schedules.group_id === filter.slice(3);
  return true;
}

save();
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* Unexpected bodies are not logged. */ }
  res.setHeader('Content-Type', 'application/json');

  if (url.pathname === '/qa/mode') {
    offline = body.offline === true;
    res.end(JSON.stringify({ offline }));
    return;
  }
  if (url.pathname === '/qa/session') {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    res.end(JSON.stringify({
      access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: ownerId, exp, role: 'authenticated' })}.qa-only`,
      refresh_token: 'qa-only-local-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp,
      user: { id: ownerId, email: 'qa@example.invalid', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: { display_name: 'Alex QA' }, created_at: createdAt },
    }));
    return;
  }

  // The query contains only fixed fixture IDs and dates. Never persist headers or bodies.
  requests.push({ at: new Date().toISOString(), method: req.method, path: url.pathname, query: url.search, offline });
  save();
  if (offline) {
    res.statusCode = 503;
    res.end(JSON.stringify({ message: 'QA simulated backend unavailable' }));
    return;
  }

  let data = [];
  if (url.pathname.endsWith('/group_members')) data = [{ group_id: groupId, user_id: ownerId, role: 'admin', groups: group }];
  else if (url.pathname.endsWith('/groups')) data = [group];
  else if (url.pathname.endsWith('/persons')) data = persons;
  else if (url.pathname.endsWith('/shift_codes')) data = codes;
  else if (url.pathname.endsWith('/rpc/get_group_member_profiles')) data = [
    { membership_id: uuid(810), user_id: ownerId, display_name: 'Alex QA', role: 'admin', claimed_person_id: ownerPersonId },
    { membership_id: uuid(811), user_id: coworkerId, display_name: 'Casey Coworker', role: 'member', claimed_person_id: coworkerPersonId },
  ];
  else if (url.pathname.endsWith('/rpc/get_my_schedule_shifts')) {
    data = shifts.filter((item) => personalIds.has(item.id) && matchesDate(item, url, body.p_start_date, body.p_end_date)).sort(byDate).map(rpcShift);
  } else if (url.pathname.endsWith('/shifts')) {
    data = shifts.filter((item) => matchesUser(item, url) && matchesGroup(item, url) && matchesDate(item, url)).sort(byDate).map(databaseShift);
    const limit = Number(url.searchParams.get('limit'));
    if (Number.isInteger(limit) && limit > 0) data = data.slice(0, limit);
    if (url.searchParams.get('select') === 'shift_code') data = data.map(({ shift_code }) => ({ shift_code }));
  } else if (url.pathname.endsWith('/daily_notes')) {
    data = notes.filter((item) => matchesUser(item, url) && matchesDate(item, url));
  } else if (url.pathname.endsWith('/schedules')) {
    const month = url.searchParams.get('year_month');
    data = schedules.filter((item) => !month || month === `eq.${item.year_month}`);
  } else if (url.pathname.endsWith('/auth/v1/user')) {
    data = { id: ownerId, email: 'qa@example.invalid', user_metadata: { display_name: 'Alex QA' } };
  }
  res.end(JSON.stringify(data));
}).listen(port, '127.0.0.1', () => console.log(`Isolated calendar-share QA fixture listening on ${port}`));
