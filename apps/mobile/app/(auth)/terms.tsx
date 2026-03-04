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
          Terms of Service
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
          Welcome to IShift. By using our application, you agree to be bound by these Terms of Service. Please read them carefully.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          1. Use of Service
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          IShift provides a platform to digitize and manage work schedules. You agree to use the service only for lawful purposes and in accordance with these terms.
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

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          4. Termination
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          We reserve the right to suspend or terminate your access to the service at any time for conduct that we believe violates these terms or is harmful to other users, us, or third parties.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          5. Limitation of Liability
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          IShift is provided "as is" without warranties of any kind. We shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          6. Changes to Terms
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          We may update these terms from time to time. We will notify you of any material changes by posting the updated terms within the app. Your continued use of the service after changes are posted constitutes acceptance of the revised terms.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          7. Contact Us
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
          If you have any questions about these Terms of Service, please use the feedback form in Settings → Help & Support.
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
