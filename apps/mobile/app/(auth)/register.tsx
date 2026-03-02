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

export default function RegisterScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { signUp, signInWithGoogle, signInWithApple, loading, error, clearError } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [termsError, setTermsError] = useState('');

  const validateForm = (): boolean => {
    let valid = true;
    clearError();

    if (!name.trim()) {
      setNameError(t('auth.nameRequired'));
      valid = false;
    } else if (name.trim().length < 2) {
      setNameError(t('auth.nameTooShort'));
      valid = false;
    } else {
      setNameError('');
    }

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
    } else if (password.length < 8) {
      setPasswordError(t('auth.passwordMin8'));
      valid = false;
    } else {
      setPasswordError('');
    }

    if (!confirmPassword) {
      setConfirmPasswordError(t('auth.confirmPasswordRequired'));
      valid = false;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError(t('auth.passwordMismatch'));
      valid = false;
    } else {
      setConfirmPasswordError('');
    }

    if (!termsAccepted) {
      setTermsError(t('auth.mustAcceptTerms'));
      valid = false;
    } else {
      setTermsError('');
    }

    return valid;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    const result = await signUp(email, password, name.trim());
    if (result.success) {
      Alert.alert(
        t('auth.checkEmail'),
        t('auth.verificationSent'),
        [
          {
            text: t('common.ok'),
            onPress: () => router.replace('/(auth)/login'),
          },
        ]
      );
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
              {t('auth.createAccount')}
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              {t('auth.registerSubtitle')}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label={t('auth.name')}
              placeholder={t('auth.namePlaceholder')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              error={nameError}
              leftIcon="person-outline"
            />

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
              placeholder={t('auth.createPassword')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={passwordError}
              leftIcon="lock-closed-outline"
              hint={t('auth.passwordHint')}
            />

            <Input
              label={t('auth.confirmPassword')}
              placeholder={t('auth.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              error={confirmPasswordError}
              leftIcon="lock-closed-outline"
            />

            {/* Terms Checkbox */}
            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => setTermsAccepted(!termsAccepted)}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: termsError ? theme.colors.error : theme.colors.border,
                    backgroundColor: termsAccepted ? theme.colors.primary : 'transparent',
                  },
                ]}
              >
                {termsAccepted && (
                  <Ionicons name="checkmark" size={14} color={theme.colors.white} />
                )}
              </View>
              <Text style={[styles.termsText, { color: theme.colors.textSecondary }]}>
                {t('auth.agreeTerms')}{' '}
                <Link href="/(auth)/terms">
                  <Text style={{ color: theme.colors.primary }}>{t('auth.termsOfService')}</Text>
                </Link>
                {' '}{t('auth.andWord')}{' '}
                <Link href="/(auth)/terms">
                  <Text style={{ color: theme.colors.primary }}>{t('auth.privacyPolicy')}</Text>
                </Link>
              </Text>
            </TouchableOpacity>
            {termsError && (
              <Text style={[styles.termsErrorText, { color: theme.colors.error }]}>
                {termsError}
              </Text>
            )}

            {error && (
              <View style={[styles.errorBanner, { backgroundColor: theme.colors.error + '15' }]}>
                <Text style={[styles.errorText, { color: theme.colors.error }]}>
                  {error}
                </Text>
              </View>
            )}

            <Button
              title={t('common.createAccount')}
              onPress={handleSignUp}
              loading={loading}
              fullWidth
              style={{ marginTop: 16 }}
            />
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
            <Text style={[styles.dividerText, { color: theme.colors.textMuted }]}>
              {t('auth.orSignUpWith')}
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
          </View>

          {/* Social Sign Up */}
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

          {/* Login link */}
          <View style={styles.loginRow}>
            <Text style={[styles.loginText, { color: theme.colors.textSecondary }]}>
              {t('auth.hasAccount')}
            </Text>
            <Link href="/(auth)/login">
              <Text style={[styles.loginLink, { color: theme.colors.primary }]}>
                {' '}{t('common.signIn')}
              </Text>
            </Link>
          </View>
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  termsErrorText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 32,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
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
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  loginText: {
    fontSize: 14,
  },
  loginLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});
