import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { isValidEmail } from '@shiftsnap/shared';

export default function LoginScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { signIn, signInAsGuest, signInWithGoogle, signInWithApple, loading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validateForm = (): boolean => {
    let valid = true;
    clearError();

    if (!email.trim()) {
      setEmailError(t('auth.emailRequired'));
      valid = false;
    } else if (!isValidEmail(email)) {
      setEmailError(t('auth.invalidEmail'));
      valid = false;
    } else {
      setEmailError('');
    }

    if (!password) {
      setPasswordError(t('auth.passwordRequired'));
      valid = false;
    } else if (password.length < 6) {
      setPasswordError(t('auth.passwordTooShort'));
      valid = false;
    } else {
      setPasswordError('');
    }

    return valid;
  };

  const handleSignIn = async () => {
    if (!validateForm()) return;

    const result = await signIn(email, password);
    if (result.success) {
      router.replace('/(tabs)/home');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={theme.colors.textPrimary}
              />
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
              {t('auth.welcomeBack')}
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              {t('auth.signInSubtitle')}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label={t('auth.email')}
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={emailError}
              leftIcon="mail-outline"
            />

            <Input
              label={t('auth.password')}
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={passwordError}
              leftIcon="lock-closed-outline"
            />

            {error && (
              <View style={[styles.errorBanner, { backgroundColor: theme.colors.error + '15' }]}>
                <Text style={[styles.errorText, { color: theme.colors.error }]}>
                  {error}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() => Alert.alert(t('auth.resetPasswordTitle'), t('auth.resetPasswordDesc'))}
            >
              <Text style={[styles.forgotPasswordText, { color: theme.colors.primary }]}>
                {t('auth.forgotPassword')}
              </Text>
            </TouchableOpacity>

            <Button
              title={t('common.signIn')}
              onPress={handleSignIn}
              loading={loading}
              fullWidth
              style={{ marginTop: 8 }}
            />
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
            <Text style={[styles.dividerText, { color: theme.colors.textMuted }]}>
              {t('auth.orContinueWith')}
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
          </View>

          {/* Social Sign In */}
          <View style={styles.socialButtons}>
            <TouchableOpacity
              style={[
                styles.socialButton,
                {
                  backgroundColor: theme.colors.white,
                  borderColor: theme.colors.border,
                },
              ]}
              onPress={async () => {
                const result = await signInWithGoogle();
                if (result.success) {
                  router.replace('/(tabs)/home');
                }
              }}
            >
              <Ionicons name="logo-google" size={20} color="#DB4437" />
              <Text style={[styles.socialButtonText, { color: theme.colors.textPrimary }]}>
                Google
              </Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={[
                  styles.socialButton,
                  {
                    backgroundColor: theme.colors.white,
                    borderColor: theme.colors.border,
                  },
                ]}
                onPress={async () => {
                  const result = await signInWithApple();
                  if (result.success) {
                    router.replace('/(tabs)/home');
                  }
                }}
              >
                <Ionicons name="logo-apple" size={20} color={theme.colors.textPrimary} />
                <Text style={[styles.socialButtonText, { color: theme.colors.textPrimary }]}>
                  Apple
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Register link */}
          <View style={styles.registerRow}>
            <Text style={[styles.registerText, { color: theme.colors.textSecondary }]}>
              {t('auth.noAccount')}
            </Text>
            <Link href="/(auth)/register">
              <Text style={[styles.registerLink, { color: theme.colors.primary }]}>
                {' '}{t('auth.signUp')}
              </Text>
            </Link>
          </View>

          {/* Guest Mode */}
          <TouchableOpacity
            style={[styles.guestButton, { borderColor: theme.colors.border }]}
            onPress={() => {
              signInAsGuest();
              router.replace('/(tabs)/home');
            }}
          >
            <Text style={[styles.guestButtonText, { color: theme.colors.textSecondary }]}>
              {t('auth.continueAsGuest')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  header: {
    marginTop: 16,
    marginBottom: 32,
  },
  backButton: {
    marginBottom: 24,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  form: {
    marginBottom: 24,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
  },
  socialButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  socialButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  registerText: {
    fontSize: 14,
  },
  registerLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  guestButton: {
    marginTop: 24,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  guestButtonText: {
    fontSize: 14,
  },
});
