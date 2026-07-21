import React from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';

export default function RegisterScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { signInWithGoogle, signInWithApple, loading, error } = useAuthStore();

  const handleProviderSignIn = async (provider: 'google' | 'apple') => {
    const result = provider === 'google'
      ? await signInWithGoogle()
      : await signInWithApple();

    if (result.success) {
      router.replace('/(tabs)/home');
    } else if (result.error) {
      Alert.alert(t('common.error'), result.error);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      <View style={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            {t('auth.createAccount')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            {t('auth.registerSubtitle')}
          </Text>
        </View>

        <View style={styles.providers}>
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={styles.appleButton}
              onPress={() => {
                if (!loading) void handleProviderSignIn('apple');
              }}
              pointerEvents={loading ? 'none' : 'auto'}
              accessibilityState={{ disabled: loading }}
            />
          )}
          {(Platform.OS === 'ios' || Platform.OS === 'android') && (
            <ProviderButton
              icon="logo-google"
              iconColor="#DB4437"
              label="Google"
              loading={loading}
              onPress={() => handleProviderSignIn('google')}
              theme={theme}
            />
          )}
        </View>

        {error && (
          <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
        )}

        <Text style={[styles.termsText, { color: theme.colors.textMuted }]}>
          {t('welcome.termsAgreement')}
          <Link href="/(auth)/terms">
            <Text style={{ color: theme.colors.primary }}>{t('welcome.termsOfService')}</Text>
          </Link>
          {t('welcome.and')}
          <Link href="/(auth)/privacy">
            <Text style={{ color: theme.colors.primary }}>{t('welcome.privacyPolicy')}</Text>
          </Link>
        </Text>
      </View>
    </SafeAreaView>
  );
}

function ProviderButton({
  icon,
  iconColor,
  label,
  loading,
  onPress,
  theme,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  label: string;
  loading: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <TouchableOpacity
      style={[styles.providerButton, {
        backgroundColor: theme.colors.cardBackground,
        borderColor: theme.colors.border,
      }]}
      onPress={onPress}
      disabled={loading}
    >
      <Ionicons name={icon} size={20} color={iconColor ?? theme.colors.textPrimary} />
      <Text style={[styles.providerText, { color: theme.colors.textPrimary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 24 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 12 },
  header: { marginTop: 40, marginBottom: 40 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 16, lineHeight: 22 },
  providers: { gap: 12 },
  appleButton: { height: 52, width: '100%' },
  providerButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 52,
  },
  providerText: { fontSize: 16, fontWeight: '600', marginLeft: 10 },
  errorText: { fontSize: 14, marginTop: 16, textAlign: 'center' },
  termsText: { fontSize: 12, lineHeight: 18, marginTop: 28, textAlign: 'center' },
});
