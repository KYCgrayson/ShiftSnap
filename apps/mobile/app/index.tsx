import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';

export default function Index() {
  const { user, initialized } = useAuthStore();

  // Wait for auth to initialize
  if (!initialized) {
    return null;
  }

  // Redirect based on auth state
  if (user) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
