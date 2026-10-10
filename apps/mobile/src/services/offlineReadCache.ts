import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const CACHE_PREFIX = 'ishift:offline-read:v1:';
const IDENTITY_KEY = 'ishift:offline-read:last-authenticated-user';
const LOCAL_SIGNOUT_KEY = 'ishift:offline-read:local-signout';
const REQUEST_TIMEOUT_MS = 12_000;

export interface OfflineReadSnapshot {
  version: 1;
  userId: string;
  groupIds: string[];
  viewScope: string;
  updatedAt: string;
  groups?: unknown[];
  persons?: unknown[];
  shiftCodes?: unknown[];
  shiftsByMonth?: Record<string, unknown[]>;
  monthUpdatedAt?: Record<string, string>;
  todayShift?: unknown | null;
  upcomingShifts?: unknown[];
}

export type OfflineSnapshotPatch = Partial<Pick<
  OfflineReadSnapshot,
  'groups' | 'persons' | 'shiftCodes' | 'shiftsByMonth' | 'monthUpdatedAt' | 'todayShift' | 'upcomingShifts'
>>;

export interface OfflineScope {
  groupIds: string[];
  viewScope: string;
}

let requestGeneration = 0;
let activeOfflineReadUserId: string | null = null;
const writesByKey = new Map<string, Promise<void>>();
let identityWrite: Promise<void> = Promise.resolve();

export function getOfflineReadGeneration(): number {
  return requestGeneration;
}

export function isOfflineReadGenerationCurrent(generation: number): boolean {
  return generation === requestGeneration;
}

export function invalidateOfflineReadRequests(): void {
  requestGeneration += 1;
}

export function setOfflineReadUserId(userId: string | null): void {
  activeOfflineReadUserId = userId;
}

export function isOfflineReadRequestCurrent(generation: number, userId: string): boolean {
  return generation === requestGeneration && !!userId && activeOfflineReadUserId === userId;
}

export function withReadTimeout<T>(promise: PromiseLike<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Database request timed out')), timeoutMs);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function cacheKey(userId: string, scope: OfflineScope): string {
  const groups = [...scope.groupIds].sort().join(',');
  return `${CACHE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(scope.viewScope)}:${encodeURIComponent(groups)}`;
}

function isValidSnapshot(value: unknown, userId: string): value is OfflineReadSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as OfflineReadSnapshot;
  if (snapshot.version !== 1 || snapshot.userId !== userId || !Array.isArray(snapshot.groupIds)
    || snapshot.groupIds.some((id) => typeof id !== 'string')
    || typeof snapshot.viewScope !== 'string' || typeof snapshot.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(snapshot.updatedAt))) return false;
  if ((snapshot.groups !== undefined && !Array.isArray(snapshot.groups))
    || (snapshot.persons !== undefined && !Array.isArray(snapshot.persons))
    || (snapshot.shiftCodes !== undefined && !Array.isArray(snapshot.shiftCodes))
    || (snapshot.upcomingShifts !== undefined && !Array.isArray(snapshot.upcomingShifts))
    || (snapshot.shiftsByMonth !== undefined && (!snapshot.shiftsByMonth || typeof snapshot.shiftsByMonth !== 'object' || Array.isArray(snapshot.shiftsByMonth)))) return false;
  const isObjectRows = (rows: unknown, requiredText?: string) => Array.isArray(rows)
    && rows.every((row) => !!row && typeof row === 'object' && !Array.isArray(row)
      && (!requiredText || typeof (row as Record<string, unknown>)[requiredText] === 'string'));
  if (snapshot.groups && !isObjectRows(snapshot.groups, 'id')) return false;
  if (snapshot.persons && !isObjectRows(snapshot.persons, 'id')) return false;
  if (snapshot.shiftCodes && !isObjectRows(snapshot.shiftCodes, 'code')) return false;
  if (snapshot.upcomingShifts && !isObjectRows(snapshot.upcomingShifts, 'date')) return false;
  if (snapshot.shiftsByMonth && Object.entries(snapshot.shiftsByMonth).some(([month, rows]) =>
    !/^\d{4}-\d{2}$/.test(month) || !isObjectRows(rows, 'date')
      || rows.some((row) => typeof (row as Record<string, unknown>).id !== 'string'))) return false;
  if (snapshot.todayShift !== undefined && snapshot.todayShift !== null
    && (!snapshot.todayShift || typeof snapshot.todayShift !== 'object' || Array.isArray(snapshot.todayShift)
      || typeof (snapshot.todayShift as Record<string, unknown>).date !== 'string'
      || typeof (snapshot.todayShift as Record<string, unknown>).id !== 'string')) return false;
  if (snapshot.monthUpdatedAt && (typeof snapshot.monthUpdatedAt !== 'object' || Array.isArray(snapshot.monthUpdatedAt)
    || Object.entries(snapshot.monthUpdatedAt).some(([month, timestamp]) => !/^\d{4}-\d{2}$/.test(month)
      || typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))))) return false;
  return true;
}

export async function saveLastAuthenticatedUser(userId: string, generation?: number): Promise<void> {
  const previous = identityWrite;
  const write = previous.then(async () => {
    if (generation !== undefined && !isOfflineReadRequestCurrent(generation, userId)) return;
    await SecureStore.setItemAsync(IDENTITY_KEY, userId);
  });
  identityWrite = write.catch(() => undefined);
  await write;
}

export async function getLastAuthenticatedUser(): Promise<string | null> {
  return SecureStore.getItemAsync(IDENTITY_KEY);
}

export async function markOfflineLocalSignOut(): Promise<void> {
  await SecureStore.setItemAsync(LOCAL_SIGNOUT_KEY, 'true');
}

export async function hasOfflineLocalSignOut(): Promise<boolean> {
  return (await SecureStore.getItemAsync(LOCAL_SIGNOUT_KEY)) === 'true';
}

export async function clearOfflineLocalSignOut(): Promise<void> {
  await SecureStore.deleteItemAsync(LOCAL_SIGNOUT_KEY).catch(() => undefined);
}

export async function clearOfflineIdentity(): Promise<void> {
  await identityWrite.catch(() => undefined);
  await SecureStore.deleteItemAsync(IDENTITY_KEY).catch(() => undefined);
}

export async function readOfflineSnapshot(userId: string, scope: OfflineScope): Promise<OfflineReadSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId, scope));
    if (!raw) return null;
    const value = JSON.parse(raw) as OfflineReadSnapshot;
    if (!isValidSnapshot(value, userId)) return null;
    return value;
  } catch {
    return null;
  }
}

export async function hasOfflineSnapshotForUser(userId: string): Promise<boolean> {
  try {
    const prefix = `${CACHE_PREFIX}${encodeURIComponent(userId)}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
    for (const key of keys) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as OfflineReadSnapshot;
        if (isValidSnapshot(parsed, userId)) return true;
      } catch { /* One corrupt entry must not hide another valid snapshot. */ }
    }
  } catch {
    return false;
  }
  return false;
}

export async function readLatestOfflineSnapshot(userId: string): Promise<OfflineReadSnapshot | null> {
  try {
    const prefix = `${CACHE_PREFIX}${encodeURIComponent(userId)}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
    const snapshots = await Promise.all(keys.map(async (key) => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return null;
        const value = JSON.parse(raw) as OfflineReadSnapshot;
        return isValidSnapshot(value, userId) ? value : null;
      } catch { return null; }
    }));
    const valid = snapshots.filter((item): item is OfflineReadSnapshot => !!item)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const latest = valid[0];
    if (!latest) return null;
    if (latest.groups !== undefined) return latest;
    const groupSnapshot = valid.find((item) => item.groups !== undefined);
    return groupSnapshot ? { ...latest, groups: groupSnapshot.groups } : latest;
  } catch {
    return null;
  }
}

export async function saveOfflineSnapshotPatch(
  userId: string,
  scope: OfflineScope,
  patch: OfflineSnapshotPatch,
  generation?: number,
): Promise<boolean> {
  const key = cacheKey(userId, scope);
  try {
    const previousWrite = writesByKey.get(key) || Promise.resolve();
    let result = false;
    const write = previousWrite.then(async () => {
      if (generation !== undefined && !isOfflineReadRequestCurrent(generation, userId)) return;
      const previous = await readOfflineSnapshot(userId, scope);
      if (generation !== undefined && !isOfflineReadRequestCurrent(generation, userId)) return;
      const next: OfflineReadSnapshot = {
        ...(previous || {} as OfflineReadSnapshot),
        version: 1, userId, groupIds: [...scope.groupIds].sort(), viewScope: scope.viewScope,
        updatedAt: new Date().toISOString(), ...patch,
        shiftsByMonth: patch.shiftsByMonth
          ? { ...(previous?.shiftsByMonth || {}), ...patch.shiftsByMonth }
          : previous?.shiftsByMonth,
        monthUpdatedAt: patch.monthUpdatedAt
          ? { ...(previous?.monthUpdatedAt || {}), ...patch.monthUpdatedAt }
          : previous?.monthUpdatedAt,
      };
      if (generation !== undefined && !isOfflineReadRequestCurrent(generation, userId)) return;
      await AsyncStorage.setItem(key, JSON.stringify(next));
      result = true;
    });
    writesByKey.set(key, write.catch(() => undefined));
    await write;
    return result;
  } catch {
    return false;
  }
}

export async function clearOfflineSnapshots(userId?: string): Promise<void> {
  try {
    const prefix = userId
      ? `${CACHE_PREFIX}${encodeURIComponent(userId)}:`
      : CACHE_PREFIX;
    await Promise.all([...writesByKey.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, pending]) => pending.catch(() => undefined)));
    const keys = await AsyncStorage.getAllKeys();
    const matches = keys.filter((key) => key.startsWith(prefix));
    if (matches.length) await AsyncStorage.multiRemove(matches);
  } catch {
    // Cache cleanup must not prevent the local sign-out state transition.
  }
}
