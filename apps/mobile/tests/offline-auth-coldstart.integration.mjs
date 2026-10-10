import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

async function run() {
  const require = Module.createRequire(import.meta.url);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const authPath = path.resolve(here, '../src/stores/authStore.ts');
  const cachePath = path.resolve(here, '../src/services/offlineReadCache.ts');
  const secureValues = new Map();
  const secureAuthStorageKey = `sb-${new URL(process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://invalid.local').hostname.split('.')[0]}-auth-token`;
  const asyncValues = new Map();
  let authCallback = null;
  let currentSessionBehavior = () => new Promise(() => {});
  let signOutBehavior = () => new Promise(() => {});
  let googleBehavior = () => new Promise(() => {});
  let deferSecureWrite = false;
  let finishDeferredSecureWrite = null;
  let appleBehavior = async () => ({ data: { user: user('user-b'), session: session('user-b') }, error: null });
  const fakeAsyncStorage = {
    getItem: async (key) => asyncValues.get(key) ?? null,
    setItem: async (key, value) => { asyncValues.set(key, value); },
    removeItem: async (key) => { asyncValues.delete(key); },
    getAllKeys: async () => [...asyncValues.keys()],
    multiRemove: async (keys) => keys.forEach((key) => asyncValues.delete(key)),
  };
  const fakeSecureStore = {
    getItemAsync: async (key) => secureValues.get(key) ?? null,
    setItemAsync: async (key, value) => {
      if (deferSecureWrite) {
        deferSecureWrite = false;
        await new Promise((resolve) => {
          finishDeferredSecureWrite = () => { secureValues.set(key, value); resolve(); };
        });
        return;
      }
      secureValues.set(key, value);
    },
    deleteItemAsync: async (key) => { secureValues.delete(key); },
  };
  const fakeSupabase = {
    auth: {
      onAuthStateChange: (callback) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  };
  const resetStore = { getState: () => ({ reset() {}, disconnectCalendar: async () => {} }) };
  const fakeGroupStore = { getState: () => ({ reset() {}, fetchGroups: async () => {} }) };
  const originalLoad = Module._load;
  const originalSetTimeout = globalThis.setTimeout;
  const results = [];
  const user = (id) => ({ id, email: `${id}@example.invalid`, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-10T00:00:00.000Z' });
  const session = (id) => ({ access_token: `token-${id}`, refresh_token: `refresh-${id}`, expires_at: 1, user: user(id) });
  const record = (name, details = {}) => results.push({ name, passed: true, ...details });

  require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    module._compile(output, filename);
  };
  Module._load = function(request, parent, isMain) {
    if (request === '@react-native-async-storage/async-storage') return fakeAsyncStorage;
    if (request === 'expo-secure-store') return fakeSecureStore;
    if (request === '../services/supabase') {
      return {
        supabase: fakeSupabase,
        getCurrentSession: () => currentSessionBehavior(),
        clearLocalSupabaseSession: async () => { secureValues.delete(secureAuthStorageKey); },
        persistLocalSupabaseSession: async (value) => {
          if (value) secureValues.set(secureAuthStorageKey, JSON.stringify(value));
        },
        signOut: () => signOutBehavior(),
        signInWithGoogle: () => googleBehavior(),
        signInWithApple: () => appleBehavior(),
      };
    }
    if (parent?.filename === authPath) {
      if (request === './shiftStore' || request === './shiftCodeStore' || request === './scheduleStore' || request === './personStore' || request === './dailyNoteStore') return { useShiftStore: resetStore, useShiftCodeStore: resetStore, useScheduleStore: resetStore, usePersonStore: resetStore, useDailyNoteStore: resetStore };
      if (request === './groupStore') return { useGroupStore: fakeGroupStore };
      if (request === './calendarStore') return { useCalendarStore: resetStore };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  const accelerateTimeouts = async (action) => {
    globalThis.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, delay >= 3000 ? 1 : delay, ...args);
    try { return await action(); } finally { globalThis.setTimeout = originalSetTimeout; }
  };
  const expect = async (name, action) => {
    try { await action(); record(name); }
    catch (error) { results.push({ name, passed: false, failure: error instanceof Error ? error.message : String(error) }); }
  };
  const loadAuth = () => {
    delete require.cache[authPath];
    delete require.cache[cachePath];
    return require(authPath).useAuthStore;
  };

  try {
    let cache = require(cachePath);
    const userId = 'user-a';
    cache.setOfflineReadUserId(userId);
    await cache.saveLastAuthenticatedUser(userId);
    await cache.saveOfflineSnapshotPatch(userId, { groupIds: ['group-a'], viewScope: 'all' }, {
      groups: [{ id: 'group-a', name: 'Group A' }],
      shiftsByMonth: { '2026-10': [{ id: 'cached-shift', user_id: userId, date: '2026-10-10' }] },
      monthUpdatedAt: { '2026-10': '2026-10-09T15:00:00.000Z' },
    });
    // Supabase's Expo adapter persists the session JSON under this key. Model
    // the real storage boundary so local logout removal is reflected on the
    // next module/process initialization.
    secureValues.set(secureAuthStorageKey, JSON.stringify(session(userId)));

    currentSessionBehavior = () => new Promise(() => {});
    let store = loadAuth();
    await accelerateTimeouts(() => store.getState().initialize());
    await expect('hung session restore falls back to cached identity and schedule', async () => {
      const seededSnapshot = await cache.readLatestOfflineSnapshot(userId);
      assert.equal(store.getState().user?.id, userId);
      assert.equal(store.getState().isOfflineReadOnly, true);
      assert.equal(store.getState().offlineLastUpdatedAt, seededSnapshot?.updatedAt);
      assert.equal(seededSnapshot?.shiftsByMonth?.['2026-10']?.[0]?.id, 'cached-shift');
    });

    await expect('INITIAL_SESSION with null preserves offline identity', async () => {
      assert.equal(typeof authCallback, 'function');
      authCallback('INITIAL_SESSION', null);
      assert.equal(store.getState().user?.id, userId);
      assert.equal(store.getState().isOfflineReadOnly, true);
      assert.equal(await cache.getLastAuthenticatedUser(), userId);
    });

    signOutBehavior = () => new Promise(() => {});
    await accelerateTimeouts(() => store.getState().signOut());
    await expect('offline logout immediately clears local identity and snapshots', async () => {
      assert.equal(store.getState().user, null);
      assert.equal(await cache.getLastAuthenticatedUser(), null);
      assert.equal(await cache.hasOfflineSnapshotForUser(userId), false);
    });

    // Simulate a new JS process: modules and in-memory stores are re-created,
    // while native storage maps and a stale Supabase client session survive.
    currentSessionBehavior = async () => {
      const persisted = secureValues.get(secureAuthStorageKey);
      return { session: persisted ? JSON.parse(persisted) : null, error: null };
    };
    store = loadAuth();
    await accelerateTimeouts(() => store.getState().initialize());
    await expect('fresh process does not restore stale session after local logout', async () => {
      assert.equal(store.getState().user, null);
      assert.equal(store.getState().isOfflineReadOnly, false);
      assert.equal(await cache.getLastAuthenticatedUser(), null);
    });

    // Model an SDK refresh write that began before logout's key removal but
    // finishes afterward. This is separate from ordinary persisted-session
    // restoration and probes operation ordering at the SecureStore boundary.
    await cache.clearOfflineLocalSignOut();
    await cache.saveLastAuthenticatedUser(userId);
    cache.setOfflineReadUserId(userId);
    await cache.saveOfflineSnapshotPatch(userId, { groupIds: ['group-a'], viewScope: 'all' }, {
      groups: [{ id: 'group-a', name: 'Group A' }],
      shiftsByMonth: { '2026-10': [{ id: 'cached-shift', user_id: userId, date: '2026-10-10' }] },
    });
    secureValues.set(secureAuthStorageKey, JSON.stringify(session(userId)));
    store = loadAuth();
    currentSessionBehavior = async () => {
      const persisted = secureValues.get(secureAuthStorageKey);
      return { session: persisted ? JSON.parse(persisted) : null, error: null };
    };
    await accelerateTimeouts(() => store.getState().initialize());
    deferSecureWrite = true;
    const refreshedSession = { ...session(userId), expires_at: Math.floor(Date.now() / 1000) + 3_600 };
    const inFlightRefreshWrite = fakeSecureStore.setItemAsync(secureAuthStorageKey, JSON.stringify(refreshedSession));
    await accelerateTimeouts(() => store.getState().signOut());
    finishDeferredSecureWrite?.();
    await inFlightRefreshWrite;
    store = loadAuth();
    await accelerateTimeouts(() => store.getState().initialize());
    await expect('late in-flight SecureStore refresh write cannot restore account after logout', async () => {
      assert.equal(store.getState().user, null);
      assert.equal(await cache.getLastAuthenticatedUser(), null);
    });

    // Exercise the provider's normal callback ordering: Supabase may emit
    // SIGNED_IN before the provider helper resolves with the same user.
    let resolveProvider;
    googleBehavior = () => new Promise((resolve) => { resolveProvider = resolve; });
    const signInResultPromise = store.getState().signInWithGoogle();
    authCallback('SIGNED_IN', session('user-b'));
    resolveProvider?.({ data: { user: user('user-b'), session: session('user-b') }, error: null });
    const signInResult = await signInResultPromise;
    await expect('provider session event for the same new account does not cancel sign-in', async () => {
      assert.equal(signInResult.success, true);
      assert.equal(store.getState().user?.id, 'user-b');
      assert.equal(await cache.getLastAuthenticatedUser(), 'user-b');
    });

    // An older provider result resolving after a newer account is installed
    // must not replace the new account in memory or in SecureStore.
    let resolveGoogle;
    googleBehavior = () => new Promise((resolve) => { resolveGoogle = resolve; });
    appleBehavior = async () => ({ data: { user: user('user-c'), session: session('user-c') }, error: null });
    const staleGoogleAttempt = store.getState().signInWithGoogle();
    const newerSignIn = await store.getState().signInWithApple();
    resolveGoogle?.({ data: { user: user('user-a'), session: session('user-a') }, error: null });
    await staleGoogleAttempt;
    await expect('late older provider response cannot replace newer account', async () => {
      assert.equal(newerSignIn.success, true);
      assert.equal(store.getState().user?.id, 'user-c');
      assert.equal(await cache.getLastAuthenticatedUser(), 'user-c');
    });

    const artifact = {
      harness: 'offline-auth-coldstart.integration.mjs',
      executedAt: new Date().toISOString(),
      boundary: 'Real authStore and offlineReadCache; AsyncStorage, SecureStore, Supabase session/provider/network mocked',
      results,
    };
    const artifactPath = path.join(here, 'artifacts', 'offline-auth-coldstart-latest.json');
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
    if (results.some((result) => !result.passed)) process.exitCode = 1;
  } finally {
    Module._load = originalLoad;
    globalThis.setTimeout = originalSetTimeout;
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
