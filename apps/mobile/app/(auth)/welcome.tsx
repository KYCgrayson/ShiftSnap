import React from 'react';
import { Image, ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';

export default function WelcomeScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const signInAsGuest = useAuthStore((state) => state.signInAsGuest);

  const handleGuestMode = () => {
    signInAsGuest();
    router.replace('/(tabs)/home');
  };

  const steps = [
    { title: t('welcome.importTitle'), description: t('welcome.importDesc') },
    { title: t('welcome.confirmTitle'), description: t('welcome.confirmDesc') },
    { title: t('welcome.exportTitle'), description: t('welcome.exportDesc') },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="welcome-screen"
      >
        <View style={styles.content}>
          <View style={styles.hero}>
            <Image
              source={require('../../assets/ishift-logo.png')}
              style={styles.logo}
              accessibilityLabel={t('common.appName')}
            />
            <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.textPrimary }]}>
              {t('common.appName')}
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              {t('welcome.subtitle')}
            </Text>
          </View>

          <View style={[styles.steps, { backgroundColor: theme.colors.cardBackground, borderColor: theme.colors.borderLight }]}>
            {steps.map((step, index) => (
              <View key={step.title} style={styles.step} accessible>
                <View style={[styles.stepNumber, { backgroundColor: theme.colors.primary + '15' }]}>
                  <Text style={[styles.numberText, { color: theme.colors.primary }]}>{index + 1}</Text>
                </View>
                <View style={styles.stepText}>
                  <Text style={[styles.stepTitle, { color: theme.colors.textPrimary }]}>{step.title}</Text>
                  <Text style={[styles.stepDescription, { color: theme.colors.textSecondary }]}>{step.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <Link href="/(auth)/register" asChild>
              <Button title={t('welcome.getStarted')} fullWidth />
            </Link>
            <View style={styles.loginRow}>
              <Text style={[styles.loginText, { color: theme.colors.textSecondary }]}>
                {t('welcome.alreadyHaveAccount')}
              </Text>
              <Link href="/(auth)/login" style={styles.loginLink}>
                <Text style={{ color: theme.colors.primary }}>{t('common.signIn')}</Text>
              </Link>
            </View>
            <TouchableOpacity
              onPress={handleGuestMode}
              style={styles.guestRow}
              accessibilityRole="button"
              testID="welcome-guest"
            >
              <Text style={[styles.guestLink, { color: theme.colors.textSecondary }]}>
                {t('welcome.tryWithoutAccount')}
              </Text>
            </TouchableOpacity>
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  hero: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 68, height: 68, borderRadius: 18, marginBottom: 12 },
  title: { fontSize: 30, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
  steps: { borderWidth: 1, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, gap: 4 },
  step: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 14 },
  stepNumber: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  numberText: { fontSize: 16, fontWeight: '700' },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600', marginBottom: 3 },
  stepDescription: { fontSize: 14, lineHeight: 21 },
  actions: { marginTop: 28 },
  loginRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  loginText: { fontSize: 14, lineHeight: 22 },
  loginLink: { paddingVertical: 10, paddingHorizontal: 6, fontSize: 14, fontWeight: '600' },
  guestRow: { alignItems: 'center', paddingVertical: 12, minHeight: 44 },
  guestLink: { fontSize: 14, lineHeight: 20, textDecorationLine: 'underline' },
  termsText: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 12 },
});
