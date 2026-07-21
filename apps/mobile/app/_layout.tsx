import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../src/stores/authStore';
import { useThemeStore } from '../src/stores/themeStore';
import { useCalendarStore } from '../src/stores/calendarStore';
import { useLocaleStore } from '../src/stores/localeStore';
import { useGroupStore } from '../src/stores/groupStore';
import { useTheme, Colors, DarkColors } from '../src/theme';
import { useInviteLinkHandler } from '../src/hooks/useInviteLinkHandler';
import { useMissedShiftNotifications } from '../src/hooks/useMissedShiftNotifications';
import { useRealtimeNotifications } from '../src/hooks/useRealtimeNotifications';
import { ToastProvider } from '../src/components/ui';
import { NotificationBanner } from '../src/components/NotificationBanner';
import i18n from '../src/i18n';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function RootLayoutInner() {
  const theme = useTheme();
  const { initialized, initialize, user } = useAuthStore();
  const themeInitialized = useThemeStore((s) => s.initialized);
  const fetchOrCreateDefaultGroup = useGroupStore((s) => s.fetchOrCreateDefaultGroup);
  const initViewScope = useGroupStore((s) => s.initViewScope);

  useInviteLinkHandler();
  useMissedShiftNotifications(user?.id, initialized);
  useRealtimeNotifications(user?.id);

  useEffect(() => {
    initViewScope();
    initialize().finally(() => {
      SplashScreen.hideAsync();
    });
  }, []);

  // Initialize group after auth is ready
  useEffect(() => {
    if (initialized && user?.id) {
      fetchOrCreateDefaultGroup(user.id);
    }
  }, [initialized, user?.id]);

  // Wait for both auth and theme to load before rendering UI, otherwise
  // the theme briefly flashes the OS default before the persisted user
  // preference takes effect.
  if (!initialized || !themeInitialized) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.colors.warmWhite }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.warmWhite },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen
          name="review-schedule"
          options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
        />
      </Stack>
      <NotificationBanner />
    </>
  );
}

export default function RootLayout() {
  const initializeTheme = useThemeStore((s) => s.initialize);
  const initializeCalendar = useCalendarStore((s) => s.initialize);
  const initializeLocale = useLocaleStore((s) => s.initialize);
  const locale = useLocaleStore((s) => s.locale);

  useEffect(() => {
    initializeTheme();
    initializeCalendar();
    initializeLocale();
  }, []);

  // Sync persisted locale with i18n
  useEffect(() => {
    if (locale && locale !== i18n.language) {
      i18n.changeLanguage(locale);
    }
  }, [locale]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider>
          <RootLayoutInner />
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
