import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
      return AsyncStorage.getItem(key);
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return AsyncStorage.getItem(key);
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      await AsyncStorage.removeItem(key);
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
  },
});

// Helper functions for authentication
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signUpWithEmail(email: string, password: string, displayName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
      },
    },
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function resetPassword(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email);
  return { data, error };
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
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';

WebBrowser.maybeCompleteAuthSession();

const REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'shiftsnap',
});

export async function signInWithApple() {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { data: null, error: { message: 'No identity token received from Apple' } };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
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
    console.log('[GoogleAuth] redirect URI:', REDIRECT_URI);

    const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: REDIRECT_URI,
        skipBrowserRedirect: true,
      },
    });

    if (oauthError || !oauthData?.url) {
      console.warn('[GoogleAuth] OAuth URL error:', oauthError);
      return { data: null, error: oauthError || { message: 'Failed to get OAuth URL' } };
    }

    console.log('[GoogleAuth] opening browser...');
    const result = await WebBrowser.openAuthSessionAsync(oauthData.url, REDIRECT_URI);
    console.log('[GoogleAuth] browser result type:', result.type);

    if (result.type !== 'success' || !result.url) {
      return { data: null, error: null }; // User cancelled
    }

    // Extract tokens from redirect URL
    console.log('[GoogleAuth] callback URL:', result.url);
    const url = new URL(result.url);

    // Tokens may be in hash fragment (#) or query params (?)
    const hashParams = new URLSearchParams(url.hash.substring(1));
    const queryParams = new URLSearchParams(url.search);
    const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');

    // Check for error in callback
    const errorParam = hashParams.get('error') || queryParams.get('error');
    const errorDesc = hashParams.get('error_description') || queryParams.get('error_description');
    if (errorParam) {
      console.warn('[GoogleAuth] OAuth callback error:', errorParam, errorDesc);
      return { data: null, error: { message: errorDesc || errorParam } };
    }

    if (!accessToken || !refreshToken) {
      console.warn('[GoogleAuth] No tokens in URL. Hash:', url.hash, 'Search:', url.search);
      return { data: null, error: { message: 'No tokens received from Google' } };
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      console.warn('[GoogleAuth] setSession error:', error.message);
    } else {
      console.log('[GoogleAuth] success, user:', data.user?.email);
    }

    return { data, error };
  } catch (error: any) {
    console.warn('[GoogleAuth] exception:', error);
    return { data: null, error: { message: error.message || 'Google Sign In failed' } };
  }
}
