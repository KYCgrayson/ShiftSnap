import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';

export default function PrivacyScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
          Privacy Policy
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
          Privacy Policy
        </Text>
        <Text style={[styles.lastUpdated, { color: theme.colors.textMuted }]}>
          Last updated: January 2026
        </Text>

        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          Your privacy is important to us. This Privacy Policy explains how IShift collects, uses, stores, and protects your information when you use our application.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          1. Information We Collect
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          We collect the following types of information:{'\n\n'}
          {'\u2022'} Account information: email address and display name when you create an account.{'\n'}
          {'\u2022'} Schedule data: images of shift schedules you upload and the shift data extracted from them.{'\n'}
          {'\u2022'} Usage data: how you interact with the app, including features used and actions taken.{'\n'}
          {'\u2022'} Device information: device type, operating system version, and app version for troubleshooting purposes.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          2. How We Use Your Information
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          We use the information we collect to:{'\n\n'}
          {'\u2022'} Provide and maintain the IShift service.{'\n'}
          {'\u2022'} Process your schedule images using optical character recognition (OCR).{'\n'}
          {'\u2022'} Sync shift data with your calendar.{'\n'}
          {'\u2022'} Enable group sharing and collaboration features.{'\n'}
          {'\u2022'} Send you notifications about your shifts and schedule updates.{'\n'}
          {'\u2022'} Improve the app experience and fix issues.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          3. Data Storage
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          Your data is stored securely using Supabase, a cloud database platform with enterprise-grade security. All data is encrypted in transit using TLS and at rest using AES-256 encryption. Schedule images and shift data are retained for 1 year from the date of upload. You can request deletion of your data at any time through the app settings.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          4. Third-Party Services
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          IShift uses the following third-party services to deliver its functionality:{'\n\n'}
          {'\u2022'} Supabase: provides authentication, database storage, and file storage for your account and schedule data.{'\n'}
          {'\u2022'} Google Gemini: processes your uploaded schedule images using AI-powered OCR to extract shift information. Images are sent to Google's servers for processing and are not retained by Google after processing is complete.{'\n\n'}
          These services have their own privacy policies, and we encourage you to review them.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          5. Your Rights
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          You have the right to:{'\n\n'}
          {'\u2022'} Access the personal data we hold about you.{'\n'}
          {'\u2022'} Correct any inaccurate or incomplete data.{'\n'}
          {'\u2022'} Request deletion of your personal data and account.{'\n'}
          {'\u2022'} Export your shift data at any time.{'\n'}
          {'\u2022'} Withdraw consent for data processing by deleting your account.{'\n\n'}
          To exercise any of these rights, you can use the account management options in the app settings or contact us directly.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          6. Contact Us
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          If you have any questions or concerns about this Privacy Policy or our data practices, please use the feedback form in Settings → Help & Support.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  lastUpdated: {
    fontSize: 13,
    marginBottom: 16,
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
  },
});
