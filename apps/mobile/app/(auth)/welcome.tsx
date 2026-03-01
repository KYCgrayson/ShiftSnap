import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { Link, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';

export default function WelcomeScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { signInAsGuest } = useAuthStore();

  const handleGuestMode = () => {
    signInAsGuest();
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      <View style={styles.content}>
        {/* Logo & Hero Section */}
        <View style={styles.heroSection}>
          <View
            style={[
              styles.logoContainer,
              { backgroundColor: theme.colors.primary + '15' },
            ]}
          >
            <Text style={[styles.logoText, { color: theme.colors.primary }]}>S</Text>
          </View>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            {t('common.appName')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            {t('welcome.subtitle')}
          </Text>
        </View>

        {/* Feature highlights */}
        <View style={styles.features}>
          <FeatureItem
            icon="camera"
            title={t('welcome.scanTitle')}
            description={t('welcome.scanDesc')}
            theme={theme}
          />
          <FeatureItem
            icon="calendar"
            title={t('welcome.syncTitle')}
            description={t('welcome.syncDesc')}
            theme={theme}
          />
          <FeatureItem
            icon="alarm"
            title={t('welcome.alarmTitle')}
            description={t('welcome.alarmDesc')}
            theme={theme}
          />
        </View>
      </View>

      {/* Bottom CTA */}
      <View style={styles.bottomSection}>
        <Link href="/(auth)/register" asChild>
          <Button title={t('welcome.getStarted')} fullWidth />
        </Link>

        <View style={styles.loginRow}>
          <Text style={[styles.loginText, { color: theme.colors.textSecondary }]}>
            {t('welcome.alreadyHaveAccount')}
          </Text>
          <Link href="/(auth)/login">
            <Text style={[styles.loginLink, { color: theme.colors.primary }]}>
              {' '}{t('common.signIn')}
            </Text>
          </Link>
        </View>

        <TouchableOpacity onPress={handleGuestMode} style={styles.guestRow}>
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
          <Link href="/(auth)/terms">
            <Text style={{ color: theme.colors.primary }}>{t('welcome.privacyPolicy')}</Text>
          </Link>
        </Text>
      </View>
    </SafeAreaView>
  );
}

function FeatureItem({
  icon,
  title,
  description,
  theme,
}: {
  icon: string;
  title: string;
  description: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.featureItem}>
      <View
        style={[
          styles.featureIcon,
          { backgroundColor: theme.colors.primary + '15' },
        ]}
      >
        <Text style={{ fontSize: 24 }}>
          {icon === 'camera' ? '📷' : icon === 'calendar' ? '📅' : '⏰'}
        </Text>
      </View>
      <View style={styles.featureText}>
        <Text style={[styles.featureTitle, { color: theme.colors.textPrimary }]}>
          {title}
        </Text>
        <Text style={[styles.featureDescription, { color: theme.colors.textSecondary }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 40,
    fontWeight: '700',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  features: {
    marginTop: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  loginText: {
    fontSize: 14,
  },
  loginLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  guestRow: {
    alignItems: 'center',
    marginTop: 12,
  },
  guestLink: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  termsText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
});
