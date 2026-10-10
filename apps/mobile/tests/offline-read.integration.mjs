import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const memory = new Map();
let failStorageWrites = false;
let failureMode = null;
let deferredGroupA = null;
let holdGroupA = false;
const records = [];
const nowDate = '2026-10-10';
const groups = [
  { id: 'group-a', name: 'A', invite_code: 'A', created_by: 'user-a', settings: {}, created_at: nowDate },
  { id: 'group-b', name: 'B', invite_code: 'B', created_by: 'user-a', settings: {}, created_at: nowDate },
];

const asyncStorage = {
  async getItem(key) { return memory.get(key) ?? null; },
  async setItem(key, value) {
    if (failStorageWrites && key.startsWith('ishift:offline-read:')) throw new Error('simulated local disk failure');
    memory.set(key, value);
  },
  async removeItem(key) { memory.delete(key); },
  async getAllKeys() { return [...memory.keys()]; },
  async multiRemove(keys) { keys.forEach((key) => memory.delete(key)); },
};
const secureStore = {
  async getItemAsync(key) { return memory.get(`secure:${key}`) ?? null; },
  async setItemAsync(key, value) { memory.set(`secure:${key}`, value); },
  async deleteItemAsync(key) { memory.delete(`secure:${key}`); },
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeQuery(table) {
  const query = { table, filters: {}, selected: '' };
  const builder = {
    select(value) { query.selected = value || ''; return this; },
    eq(key, value) { query.filters[key] = value; return this; },
    neq(key, value) { query.filters[`neq:${key}`] = value; return this; },
    or(value) { query.filters.or = value; return this; },
    in(key, value) { query.filters[`in:${key}`] = value; return this; },
    gte(key, value) { query.filters[`gte:${key}`] = value; return this; },
    lte(key, value) { query.filters[`lte:${key}`] = value; return this; },
    order() { return this; },
    single() { return this; },
    then(resolve, reject) { return execute(query).then(resolve, reject); },
  };
  return builder;
}

function shiftRows(query) {
  const start = query.filters['gte:date'] || '2026-10-01';
  const end = query.filters['lte:date'] || '2026-10-31';
  const month = start.slice(0, 7);
  if (query.filters['in:schedules.group_id']) {
    const targetGroups = query.filters['in:schedules.group_id'];
    if (failureMode === 'partial-group-failure') return { data: null, error: new Error('group read failed') };
    if (holdGroupA && targetGroups.includes('group-a')) {
      deferredGroupA ||= deferred();
      return deferredGroupA.promise;
    }
    if (failureMode === 'empty') return { data: [], error: null };
    return { data: targetGroups.map((groupId) => ({
      id: `${groupId}-${month}`, user_id: `member-${groupId}`, person_id: null,
      schedule_id: `schedule-${groupId}`, date: `${month}-12`, shift_code: groupId === 'group-a' ? 'A' : 'B',
      start_time: '09:00', end_time: '17:00', is_day_off: false, source: 'self_scan',
      name_on_schedule: groupId, comparison_status: null, calendar_event_id: null, synced_at: null,
      schedules: { group_id: groupId },
    })).filter((row) => row.date >= start && row.date <= end), error: null };
  }
  if (query.filters.user_id) {
    const rows = failureMode === 'empty' ? [] : [{
      id: `own-${month}`, user_id: 'user-a', person_id: null, schedule_id: 'own-schedule',
      date: `${month}-02`, shift_code: 'D', start_time: '08:00', end_time: '16:00',
      is_day_off: false, source: 'self_scan', name_on_schedule: 'Alex', comparison_status: null,
      calendar_event_id: null, synced_at: null, schedules: { group_id: 'group-a' },
    }];
    return { data: rows.filter((row) => row.date >= start && row.date <= end), error: null };
  }
  return { data: [], error: null };
}

async function execute(query) {
  if (query.table === 'group_members') return { data: groups.map((group) => ({ group_id: group.id, groups: group })), error: null };
  if (query.table === 'shifts') return shiftRows(query);
  if (query.table === 'shift_codes') return { data: [{ id: 'code-d', code: 'D', meaning: 'Day', start_time: '08:00', end_time: '16:00', is_day_off: false, is_confirmed: true, group_id: null, is_group_shared: false }], error: null };
  if (query.table === 'persons') return { data: [{ id: 'person-1', owner_id: 'user-a', group_id: 'group-a', name: 'Alex', color: '#123456', avatar_url: null, notes: null, created_at: nowDate, canonical_person_id: null }], error: null };
  return { data: [], error: null };
}

const supabase = {
  from: (table) => makeQuery(table),
  rpc: async (name, args) => {
    if (name === 'get_my_schedule_shifts') {
      if (failureMode === 'partial-personal-failure') return { data: null, error: new Error('personal read failed') };
      return { data: [], error: null };
    }
    return { data: [], error: null };
  },
  auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
};

const originalLoad = Module._load;
const require = Module.createRequire(import.meta.url);
async function main() {
require.extensions['.ts'] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  mod._compile(output, filename);
};
Module._load = function(request, parent, isMain) {
  if (request === '@react-native-async-storage/async-storage') return { __esModule: true, default: asyncStorage };
  if (request === 'expo-secure-store') return secureStore;
  if (request === '../services/supabase' && parent?.filename?.includes('/src/stores/')) return { supabase, signOut: async () => ({ error: null }), getCurrentSession: async () => ({ session: null }) };
  if (request === '@shiftsnap/shared') return {
    formatDateISO: (date) => date.toISOString().slice(0, 10),
    formatYearMonth: (date) => date.toISOString().slice(0, 7),
    reviewedRowPersonId: () => null,
    getNextPersonColor: () => '#123456',
    canSuggestRosterMatch: () => false,
    rosterNameSimilarity: () => 0,
  };
  if (request === '../i18n') return { __esModule: true, default: { t: (key) => key } };
  return originalLoad.call(this, request, parent, isMain);
};

const { setOfflineReadUserId, invalidateOfflineReadRequests, readOfflineSnapshot, readLatestOfflineSnapshot, hasOfflineSnapshotForUser, saveOfflineSnapshotPatch } = require(path.join(root, 'src/services/offlineReadCache.ts'));
const { useAuthStore } = require(path.join(root, 'src/stores/authStore.ts'));
const { useGroupStore } = require(path.join(root, 'src/stores/groupStore.ts'));
const { useShiftStore } = require(path.join(root, 'src/stores/shiftStore.ts'));
const { useShiftCodeStore } = require(path.join(root, 'src/stores/shiftCodeStore.ts'));
const { usePersonStore } = require(path.join(root, 'src/stores/personStore.ts'));

const scopeAll = { groupIds: ['group-a', 'group-b'], viewScope: 'all' };
const account = { user: { id: 'user-a' }, session: { access_token: 'test' }, isGuest: false, isOfflineReadOnly: false };
const setup = (offline = false) => {
  for (const key of memory.keys()) if (key.startsWith('ishift:offline-read:')) memory.delete(key);
  invalidateOfflineReadRequests();
  setOfflineReadUserId('user-a');
  useAuthStore.setState({ ...account, isOfflineReadOnly: offline, offlineReadOnlyReason: offline ? 'offline' : null });
  useGroupStore.setState({ groups, currentGroup: groups[0], viewScope: 'all', members: [], loading: false, error: null });
  useShiftStore.getState().reset();
  useShiftCodeStore.getState().reset();
  usePersonStore.getState().reset();
};
const check = (name, fn) => fn().then(() => records.push({ name, passed: true })).catch((error) => records.push({ name, passed: false, error: String(error.stack || error) }));

await check('complete adjacent-month fetch persists rows, metadata, and timestamps then cold store state hydrates offline', async () => {
  setup();
  await useGroupStore.getState().fetchGroups('user-a');
  await Promise.all([
    usePersonStore.getState().fetchPersons('user-a'),
    useShiftCodeStore.getState().fetchShiftCodes('user-a'),
    useShiftStore.getState().fetchShiftsWindow('user-a', '2026-10'),
  ]);
  const saved = await readOfflineSnapshot('user-a', scopeAll);
  assert.deepEqual(Object.keys(saved.shiftsByMonth).sort(), ['2026-09', '2026-10', '2026-11']);
  assert.ok(saved.monthUpdatedAt['2026-10']);
  assert.equal(saved.groups.length, 2);
  assert.equal(saved.persons.length, 1);
  assert.equal(saved.shiftCodes.length, 1);
  useShiftStore.getState().reset();
  useGroupStore.setState({ groups: [], currentGroup: null, viewScope: 'all', members: [], loading: false, error: null });
  useAuthStore.setState({ ...account, session: null, isOfflineReadOnly: true, offlineReadOnlyReason: 'offline' });
  await useGroupStore.getState().fetchGroups('user-a');
  await useShiftStore.getState().fetchShiftsWindow('user-a', '2026-10');
  assert.equal(useGroupStore.getState().groups.length, 2);
  assert.equal(useShiftStore.getState().monthShifts.length, 3);
});

await check('scope A delayed response cannot overwrite scope B or persist into B scope', async () => {
  setup();
  useGroupStore.setState({ groups, currentGroup: groups[0], viewScope: 'group-a', members: [], loading: false, error: null });
  holdGroupA = true;
  const requestA = useShiftStore.getState().fetchShiftsForMonth('user-a', '2026-10');
  await new Promise((resolve) => setTimeout(resolve, 0));
  useGroupStore.getState().cycleViewScope();
  await useShiftStore.getState().fetchShiftsForMonth('user-a', '2026-10');
  deferredGroupA.resolve({ data: [{ id: 'late-a', user_id: 'member-a', person_id: null, schedule_id: 'late', date: '2026-10-12', shift_code: 'A', start_time: '09:00', end_time: '17:00', is_day_off: false, source: 'self_scan', name_on_schedule: 'A', comparison_status: null, calendar_event_id: null, synced_at: null, schedules: { group_id: 'group-a' } }], error: null });
  await requestA;
  holdGroupA = false;
  const active = useShiftStore.getState().monthShifts;
  assert.ok(active.some((row) => row.group_id === 'group-b'));
  assert.ok(active.every((row) => row.id !== 'late-a'));
  const a = await readOfflineSnapshot('user-a', { groupIds: scopeAll.groupIds, viewScope: 'group-a' });
  const b = await readOfflineSnapshot('user-a', { groupIds: scopeAll.groupIds, viewScope: 'group-b' });
  assert.equal(a, null);
  assert.ok(b.shiftsByMonth['2026-10'].some((row) => row.group_id === 'group-b'));
  assert.ok(b.shiftsByMonth['2026-10'].every((row) => row.id !== 'late-a'));
});

await check('account switch invalidates pending reads before they update state or cache', async () => {
  setup();
  useGroupStore.setState({ groups, currentGroup: groups[0], viewScope: 'group-a', members: [], loading: false, error: null });
  holdGroupA = true;
  deferredGroupA = null;
  const requestA = useShiftStore.getState().fetchShiftsForMonth('user-a', '2026-10');
  await new Promise((resolve) => setTimeout(resolve, 0));
  invalidateOfflineReadRequests();
  setOfflineReadUserId('user-b');
  useAuthStore.setState({ user: { id: 'user-b' }, session: { access_token: 'test-b' }, isOfflineReadOnly: false, isGuest: false });
  useShiftStore.getState().reset();
  deferredGroupA.resolve({ data: [{ id: 'late-account-a', user_id: 'member-a', person_id: null, schedule_id: 'late', date: '2026-10-12', shift_code: 'A', start_time: '09:00', end_time: '17:00', is_day_off: false, source: 'self_scan', name_on_schedule: 'A', comparison_status: null, calendar_event_id: null, synced_at: null, schedules: { group_id: 'group-a' } }], error: null });
  await requestA;
  holdGroupA = false;
  assert.equal(useShiftStore.getState().monthShifts.length, 0);
  assert.equal(await readOfflineSnapshot('user-a', { groupIds: scopeAll.groupIds, viewScope: 'group-a' }), null);
});

await check('partial query failure preserves complete cached month', async () => {
  setup();
  const scopeA = { groupIds: scopeAll.groupIds, viewScope: 'group-a' };
  const existing = [{ id: 'known-good', user_id: 'user-a', date: '2026-10-03', group_id: 'group-a' }];
  await saveOfflineSnapshotPatch('user-a', scopeA, { shiftsByMonth: { '2026-10': existing }, monthUpdatedAt: { '2026-10': '2026-10-01T00:00:00.000Z' } });
  useGroupStore.setState({ viewScope: 'group-a' });
  failureMode = 'partial-group-failure';
  await useShiftStore.getState().fetchShiftsForMonth('user-a', '2026-10');
  failureMode = null;
  const saved = await readOfflineSnapshot('user-a', scopeA);
  assert.deepEqual(saved.shiftsByMonth['2026-10'], existing);
  assert.equal(saved.monthUpdatedAt['2026-10'], '2026-10-01T00:00:00.000Z');
});

await check('successful empty month is cached separately from an unvisited month', async () => {
  setup();
  useGroupStore.setState({ groups: [], currentGroup: null, viewScope: 'all', members: [], loading: false, error: null });
  failureMode = 'empty';
  await useShiftStore.getState().fetchShiftsForMonth('user-a', '2026-10');
  failureMode = null;
  const saved = await readOfflineSnapshot('user-a', { groupIds: [], viewScope: 'all' });
  assert.deepEqual(saved.shiftsByMonth['2026-10'], []);
  assert.ok(saved.monthUpdatedAt['2026-10']);
  assert.equal(Object.hasOwn(saved.shiftsByMonth, '2026-12'), false);
  assert.equal(Object.hasOwn(saved.monthUpdatedAt, '2026-12'), false);
});

await check('local write failure does not claim offline month readiness', async () => {
  setup();
  useGroupStore.setState({ groups: [], currentGroup: null, viewScope: 'all', members: [], loading: false, error: null });
  await saveOfflineSnapshotPatch('user-a', { groupIds: [], viewScope: 'all' }, {
    shiftsByMonth: { '2026-10': [{ id: 'old-month', date: '2026-10-01' }] },
    monthUpdatedAt: { '2026-10': '2026-10-01T00:00:00.000Z' },
  });
  failStorageWrites = true;
  await useShiftStore.getState().fetchShiftsForMonth('user-a', '2026-10');
  failStorageWrites = false;
  assert.equal(useShiftStore.getState().offlineCacheWarning, true);
  assert.equal(useShiftStore.getState().lastMonthRefreshStatus.persisted, false);
  assert.equal(useShiftStore.getState().lastMonthRefreshStatus.refreshed, true);
  assert.equal(Object.hasOwn(useShiftStore.getState().monthUpdatedAt, '2026-10'), true);
});

await check('parallel resource patches merge without losing fields', async () => {
  setup();
  await Promise.all([
    saveOfflineSnapshotPatch('user-a', scopeAll, { groups }),
    saveOfflineSnapshotPatch('user-a', scopeAll, { persons: [{ id: 'p' }] }),
    saveOfflineSnapshotPatch('user-a', scopeAll, { shiftCodes: [{ code: 'D' }] }),
    saveOfflineSnapshotPatch('user-a', scopeAll, { shiftsByMonth: { '2026-10': [] } }),
  ]);
  const saved = await readOfflineSnapshot('user-a', scopeAll);
  assert.equal(saved.groups.length, 2);
  assert.equal(saved.persons[0].id, 'p');
  assert.equal(saved.shiftCodes[0].code, 'D');
  assert.deepEqual(saved.shiftsByMonth['2026-10'], []);
});

await check('corrupt snapshots are ignored without hiding valid snapshots', async () => {
  setup();
  await saveOfflineSnapshotPatch('user-a', scopeAll, { groups });
  memory.set('ishift:offline-read:v1:user-a:corrupt:', JSON.stringify({ version: 1, userId: 'user-a', groupIds: [null], viewScope: 'all', updatedAt: nowDate, shiftsByMonth: { '2026-10': [null] } }));
  assert.equal(await hasOfflineSnapshotForUser('user-a'), true);
  assert.ok((await readLatestOfflineSnapshot('user-a'))?.groups.length === 2);
  memory.set('ishift:offline-read:v1:user-a:bad-json:', '{');
  assert.equal(await hasOfflineSnapshotForUser('user-a'), true);
});

const failed = records.filter((item) => !item.passed);
const artifact = { harness: 'offline-read.integration.mjs', executedAt: new Date().toISOString(), scope: 'real Zustand stores and offlineReadCache; mocked Supabase and local storage boundaries', records };
const artifactPath = path.join(here, 'artifacts/offline-read-integration-results.json');
fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(artifact, null, 2));
Module._load = originalLoad;
if (failed.length) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
