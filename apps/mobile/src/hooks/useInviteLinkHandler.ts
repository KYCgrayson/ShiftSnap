import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { useGroupStore } from '../stores/groupStore';

const PENDING_INVITE_KEY = 'shiftsnap:pending_invite_code';

// Exported for unit tests.
export function parseInviteCode(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: ReturnType<typeof Linking.parse>;
  try {
    parsed = Linking.parse(url);
  } catch {
    return null;
  }
  // Accept:
  //   shiftsnap://invite/ABC123
  //   shiftsnap://join?code=ABC123
  //   https://<host>/invite/ABC123  (future universal link)
  const host = parsed.hostname ?? '';
  const path = (parsed.path ?? '').replace(/^\/+/, '');

  if (host === 'invite' && path) {
    const code = path.split('/')[0]?.trim();
    return code ? code.toUpperCase() : null;
  }
  if (host === 'join') {
    const raw = parsed.queryParams?.code;
    const code = Array.isArray(raw) ? raw[0] : raw;
    return code ? String(code).trim().toUpperCase() : null;
  }
  if (path.startsWith('invite/')) {
    const code = path.slice('invite/'.length).split('/')[0]?.trim();
    return code ? code.toUpperCase() : null;
  }
  return null;
}

export async function setPendingInviteCode(code: string) {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, code);
}

async function consumePendingInviteCode(): Promise<string | null> {
  const v = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  if (v) await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  return v;
}

export function useInviteLinkHandler() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isGuest = useAuthStore((s) => s.isGuest);
  const initialized = useAuthStore((s) => s.initialized);
  const signInAsDemo = useAuthStore((s) => s.signInAsDemo);
  const joinGroupByInvite = useGroupStore((s) => s.joinGroupByInvite);

  // Refs guard against re-processing the same URL across re-renders / cold start.
  const processedUrlsRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef(false);

  // Latest values for use inside Linking listener (avoid stale closures).
  const stateRef = useRef({ user, isGuest, initialized, signInAsDemo, joinGroupByInvite, t });
  stateRef.current = { user, isGuest, initialized, signInAsDemo, joinGroupByInvite, t };

  const processCode = async (code: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const { user, isGuest, initialized, signInAsDemo, joinGroupByInvite, t } = stateRef.current;

      if (!initialized) {
        await setPendingInviteCode(code);
        return;
      }

      // Guest mode can't write to Supabase (no auth.uid for RLS), so
      // auto-promote to the shared demo account before joining. The
      // pending code drains automatically once the new session lands.
      if (isGuest) {
        await setPendingInviteCode(code);
        const result = await signInAsDemo();
        if (!result.success) {
          const raw = result.error ?? '';
          const friendly = /email.*not.*confirm/i.test(raw)
            ? t('welcome.demoEmailUnconfirmed')
            : raw || t('welcome.demoFailed');
          Alert.alert(t('common.error'), friendly);
        }
        return;
      }

      if (!user) {
        await setPendingInviteCode(code);
        Alert.alert(
          t('settings.inviteSignInRequired'),
          t('settings.inviteSignInRequiredDesc'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('common.signIn'),
              onPress: () => router.push('/(auth)/welcome'),
            },
          ]
        );
        return;
      }
      try {
        await joinGroupByInvite(user.id, code);
        Alert.alert(t('settings.groupJoined'), t('settings.groupJoinedDesc'));
        router.push('/(tabs)/calendar');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'ALREADY_MEMBER') {
          Alert.alert(t('settings.shareInvite'), t('settings.alreadyMember'));
        } else {
          Alert.alert(t('common.error'), t('settings.joinFailed'));
        }
      }
    } finally {
      inFlightRef.current = false;
    }
  };

  // Wire Linking listeners once.
  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      if (!url) return;
      if (processedUrlsRef.current.has(url)) return;
      const code = parseInviteCode(url);
      if (!code) return;
      processedUrlsRef.current.add(url);
      void processCode(code);
    };

    Linking.getInitialURL()
      .then((url) => handle(url))
      .catch(() => {});

    const sub = Linking.addEventListener('url', (event) => handle(event.url));
    return () => sub.remove();
    // Intentionally empty deps: handler reads latest state via stateRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drain a pending code once auth is ready.
  useEffect(() => {
    if (!initialized) return;
    if (!user?.id || isGuest) return;
    consumePendingInviteCode().then((code) => {
      if (code) void processCode(code);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, user?.id, isGuest]);
}
