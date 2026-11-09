// Synthetic Supabase HTTP boundary for App Store screenshots. No production data.
// Same endpoints as native-code-first-fixture.mjs, but with a full month of
// Traditional Chinese shifts so store screenshots look like real use.
// Run: node scripts/qa/store-screenshot-fixture.mjs  (binds 127.0.0.1:55439)
import http from 'node:http';

const userId = '00000000-0000-4000-8000-000000000001';
const groupId = '00000000-0000-4000-8000-000000000010';
const personId = '00000000-0000-4000-8000-000000000030';
const displayName = '王小明';
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth();
const lastDay = new Date(year, month + 1, 0).getDate();
const day = (n) => `${year}-${String(month + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;

const group = { id: groupId, name: '示範團隊', invite_code: 'QA-ONLY', created_by: userId, settings: {}, created_at: now.toISOString() };
const person = { id: personId, name: displayName, owner_id: userId, group_id: groupId, canonical_person_id: personId, color: '#4A9DAD', created_at: now.toISOString() };

// code, meaning, start, end, isDayOff
const defs = [
  ['A', '早班', '07:00:00', '15:00:00', false],
  ['B', '小夜', '15:00:00', '23:00:00', false],
  ['N', '大夜', '23:00:00', '07:00:00', false],
  ['/', '休假', null, null, true],
];
const codes = defs.map(([code, meaning, start_time, end_time, is_day_off], i) => ({
  id: `00000000-0000-4000-8000-${String(40 + i).padStart(12, '0')}`,
  user_id: userId, group_id: groupId, code, meaning, start_time, end_time,
  is_day_off, is_confirmed: true, is_group_shared: true,
}));

// Rotation: two early, two evening, rest, two night, rest.
const rotation = ['A', 'A', 'B', 'B', '/', 'N', 'N', '/'];
const shifts = Array.from({ length: lastDay }, (_, i) => {
  const def = defs.find(([code]) => code === rotation[i % rotation.length]);
  return {
    id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`,
    schedule_id: '00000000-0000-4000-8000-000000000020',
    user_id: userId, person_id: personId, date: day(i + 1),
    shift_code: def[0], start_time: def[2], end_time: def[3], is_day_off: def[4],
  };
});

let offline = false;
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1:55439');
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  res.setHeader('Content-Type', 'application/json');
  if (u.pathname === '/qa/mode') { offline = body.offline === true; res.end(JSON.stringify({ offline })); return; }
  if (u.pathname === '/qa/session') {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const enc = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
    res.end(JSON.stringify({
      access_token: `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: userId, exp, role: 'authenticated' })}.qa-only`,
      refresh_token: 'qa-only-local-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp,
      user: { id: userId, email: 'qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { display_name: displayName }, created_at: now.toISOString() },
    }));
    return;
  }
  if (offline) { res.statusCode = 503; res.end(JSON.stringify({ message: 'QA simulated backend unavailable' })); return; }
  let data = [];
  if (u.pathname.endsWith('/group_members')) data = [{ group_id: groupId, user_id: userId, role: 'admin', groups: group }];
  else if (u.pathname.endsWith('/groups')) data = [group];
  else if (u.pathname.endsWith('/persons')) data = [person];
  else if (u.pathname.endsWith('/shift_codes')) data = codes;
  else if (u.pathname.endsWith('/rpc/get_group_member_profiles')) data = [{ user_id: userId, display_name: displayName, role: 'admin', claimed_person_id: personId }];
  else if (u.pathname.endsWith('/shifts') || u.pathname.endsWith('/rpc/get_my_schedule_shifts')) {
    data = shifts.filter((s) => {
      if (u.searchParams.get('user_id')?.startsWith('neq.')) return false;
      for (const filter of u.searchParams.getAll('date')) {
        const [op, ...v] = filter.split('.');
        if (op === 'gte' && s.date < v.join('.')) return false;
        if (op === 'lte' && s.date > v.join('.')) return false;
      }
      if (body.p_start_date && s.date < body.p_start_date) return false;
      if (body.p_end_date && s.date > body.p_end_date) return false;
      return true;
    });
  } else if (u.pathname.endsWith('/auth/v1/user')) data = { id: userId, email: 'qa@example.invalid', user_metadata: { display_name: displayName } };
  res.end(JSON.stringify(data));
}).listen(55439, '127.0.0.1', () => console.log('Store screenshot fixture listening on 127.0.0.1:55439'));
