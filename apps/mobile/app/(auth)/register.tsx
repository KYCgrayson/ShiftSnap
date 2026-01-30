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
import { Button, Input } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { isValidEmail } from '@shiftsnap/shared';

export default function RegisterScreen() {
  const theme = useTheme();
  const { signUp, loading, error, clearError } = useAuthStore();

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
      setNameError('Name is required');
      valid = false;
    } else if (name.trim().length < 2) {
      setNameError('Name must be at least 2 characters');
      valid = false;
    } else {
      setNameError('');
    }

    if (!email.trim()) {
      setEmailError('Email is required');
      valid = false;
    } else if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email');
      valid = false;
    } else {
      setEmailError('');
    }

    if (!password) {
      setPasswordError('Password is required');
      valid = false;
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      valid = false;
    } else {
      setPasswordError('');
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password');
      valid = false;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      valid = false;
    } else {
      setConfirmPasswordError('');
    }

    if (!termsAccepted) {
      setTermsError('You must accept the Terms of Service');
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
        'Check your email',
        'We sent you a verification link. Please verify your email to continue.',
        [
          {
            text: 'OK',
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
              Create account
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              Start managing your shifts today
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Name"
              placeholder="Enter your name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              error={nameError}
              leftIcon="person-outline"
            />

            <Input
              label="Email"
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={emailError}
              leftIcon="mail-outline"
            />

            <Input
              label="Password"
              placeholder="Create a password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={passwordError}
              leftIcon="lock-closed-outline"
              hint="At least 8 characters"
            />

            <Input
              label="Confirm Password"
              placeholder="Confirm your password"
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
                I agree to the{' '}
                <Link href="/(auth)/terms">
                  <Text style={{ color: theme.colors.primary }}>Terms of Service</Text>
                </Link>
                {' '}and{' '}
                <Link href="/(auth)/terms">
                  <Text style={{ color: theme.colors.primary }}>Privacy Policy</Text>
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
              title="Create Account"
              onPress={handleSignUp}
              loading={loading}
              fullWidth
              style={{ marginTop: 16 }}
            />
          </View>

          {/* Login link */}
          <View style={styles.loginRow}>
            <Text style={[styles.loginText, { color: theme.colors.textSecondary }]}>
              Already have an account?
            </Text>
            <Link href="/(auth)/login">
              <Text style={[styles.loginLink, { color: theme.colors.primary }]}>
                {' '}Sign In
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
