import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme';
import { useAuthStore } from '../stores/authStore';

interface Props {
  message?: string;
}

export function GuestUpgradeBanner({ message }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { isGuest } = useAuthStore();

  if (!isGuest) return null;

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: theme.colors.primary + '12', borderColor: theme.colors.primary + '30' }]}
      onPress={() => router.push('/(auth)/register')}
      activeOpacity={0.7}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.primary + '20' }]}>
        <Ionicons name="person-add-outline" size={18} color={theme.colors.primary} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
          {t('guest.title')}
        </Text>
        <Text style={[styles.message, { color: theme.colors.textSecondary }]}>
          {message || t('guest.defaultMessage')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    lineHeight: 16,
  },
});
