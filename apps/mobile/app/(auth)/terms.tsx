import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';

export default function TermsScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
          Terms & Privacy
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Terms of Service */}
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
          Terms of Service
        </Text>
        <Text style={[styles.lastUpdated, { color: theme.colors.textMuted }]}>
          Last updated: January 2026
        </Text>

        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          Welcome to ShiftSnap. By using our application, you agree to be bound by these Terms of Service. Please read them carefully.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          1. Use of Service
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          ShiftSnap provides a platform to digitize and manage work schedules. You agree to use the service only for lawful purposes and in accordance with these terms.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          2. User Accounts
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          3. Content
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          You retain ownership of the schedule images and data you upload. By using the service, you grant us a limited license to process your content for the purpose of providing the service.
        </Text>

        {/* Privacy Policy */}
        <View style={styles.divider} />

        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
          Privacy Policy
        </Text>
        <Text style={[styles.lastUpdated, { color: theme.colors.textMuted }]}>
          Last updated: January 2026
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          Information We Collect
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          We collect information you provide directly, including account information, schedule images, and shift data.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          How We Use Your Information
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          We use your information to provide and improve our services, process your schedule images, sync with calendar services, and send notifications.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          Data Retention
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          Your schedule images and shift data are retained for 1 year from the date of upload. You can request deletion of your data at any time through the app settings.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          Data Security
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          We implement appropriate security measures to protect your personal information. All data is encrypted in transit and at rest.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          Your Rights
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          You have the right to access, correct, or delete your personal data. You can also export your data or request account deletion at any time.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          Contact Us
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          If you have any questions about these terms or our privacy practices, please contact us at support@shiftsnap.app
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
  divider: {
    height: 1,
    backgroundColor: '#E8E4E0',
    marginVertical: 32,
  },
});
