import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Environment variables - these should be set in app.config.js or .env
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Custom storage adapter for Expo
const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      throw new Error('Secure session storage is unavailable on web');
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      throw new Error(`Unable to read secure session storage: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      throw new Error('Secure session storage is unavailable on web');
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      throw new Error(`Unable to write secure session storage: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      throw new Error('Secure session storage is unavailable on web');
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      throw new Error(`Unable to remove secure session storage: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  },
};

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
}

export async function getCurrentSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  return { session, error };
}

// OAuth providers
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

// Lazy-initialized redirect URI (avoid calling native modules at import time)
let _redirectUri: string | null = null;
function getRedirectUri(): string {
  if (!_redirectUri) {
    try {
      _redirectUri = AuthSession.makeRedirectUri({ scheme: 'shiftsnap' });
    } catch {
      console.warn('[OAuth] Failed to create redirect URI');
      _redirectUri = 'shiftsnap://';
    }
  }
  return _redirectUri;
}

export async function signInWithApple() {
  try {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );
    const state = Crypto.randomUUID();
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
      state,
    });

    if (!credential.identityToken || credential.state !== state) {
      return { data: null, error: { message: 'No identity token received from Apple' } };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });

    // Update display name if available from Apple
    if (data?.user && credential.fullName) {
      const displayName = [credential.fullName.givenName, credential.fullName.familyName]
        .filter(Boolean)
        .join(' ');
      if (displayName) {
        await supabase.auth.updateUser({
          data: { display_name: displayName },
        });
      }
    }

    return { data, error };
  } catch (error: any) {
    if (error.code === 'ERR_REQUEST_CANCELED') {
      return { data: null, error: null }; // User cancelled
    }
    return { data: null, error: { message: error.message || 'Apple Sign In failed' } };
  }
}

export async function signInWithGoogle() {
  try {
    // Complete any pending auth session (must run before opening a new one)
    try {
      WebBrowser.maybeCompleteAuthSession();
    } catch {
      console.warn('[GoogleAuth] Failed to complete pending auth session');
    }

    const redirectUri = getRedirectUri();
    const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
      },
    });

    if (oauthError || !oauthData?.url) {
      console.warn('[GoogleAuth] Failed to start OAuth flow');
      return { data: null, error: oauthError || { message: 'Failed to get OAuth URL' } };
    }

    const result = await WebBrowser.openAuthSessionAsync(oauthData.url, redirectUri);

    if (result.type !== 'success' || !result.url) {
      return { data: null, error: null }; // User cancelled
    }

    // PKCE callbacks contain a short-lived authorization code, never session tokens.
    const url = new URL(result.url);
    const redirect = new URL(redirectUri);
    if (url.protocol !== redirect.protocol || url.host !== redirect.host || url.pathname !== redirect.pathname) {
      return { data: null, error: { message: 'Invalid OAuth redirect' } };
    }

    const errorParam = url.searchParams.get('error');
    const errorDesc = url.searchParams.get('error_description');
    if (errorParam) {
      console.warn('[GoogleAuth] OAuth callback returned an error');
      return { data: null, error: { message: errorDesc || errorParam } };
    }

    const code = url.searchParams.get('code');
    if (!code) {
      console.warn('[GoogleAuth] OAuth callback did not contain an authorization code');
      return { data: null, error: { message: 'No authorization code received from Google' } };
    }

    // exchangeCodeForSession validates the callback against the locally stored
    // PKCE verifier generated by Supabase before it can establish a session.
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.warn('[GoogleAuth] Failed to establish session');
    }

    return { data, error };
  } catch (error: any) {
    console.warn('[GoogleAuth] Unexpected OAuth failure');
    return { data: null, error: { message: error.message || 'Google Sign In failed' } };
  }
}
