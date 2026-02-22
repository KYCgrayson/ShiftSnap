import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useThemeStore } from '../../src/stores/themeStore';
import { useCalendarStore } from '../../src/stores/calendarStore';
import { supabase } from '../../src/services/supabase';
import { APP_VERSION, EXTERNAL_LINKS } from '@shiftsnap/shared';

export default function SettingsScreen() {
  const theme = useTheme();
  const { user, signOut } = useAuthStore();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const { isConnected: calendarConnected, connectCalendar, disconnectCalendar, loading: calendarLoading } = useCalendarStore();

  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User';
  const email = user?.email || '';

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Contact Support', 'Please contact support@shiftsnap.app to delete your account.');
          },
        },
      ]
    );
  };

  const handleEditProfile = () => {
    setEditName(displayName);
    setEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    try {
      await supabase.auth.updateUser({
        data: { display_name: editName.trim() },
      });
      setEditingProfile(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  const handleToggleDarkMode = () => {
    if (themeMode === 'dark') {
      setThemeMode('light');
    } else {
      setThemeMode('dark');
    }
  };

  const handleCalendarConnect = async () => {
    if (calendarConnected) {
      Alert.alert('Disconnect Calendar', 'Stop syncing shifts to your calendar?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => disconnectCalendar(),
        },
      ]);
    } else {
      const success = await connectCalendar();
      if (success) {
        Alert.alert('Connected', 'Your shifts will now sync to Apple Calendar');
      }
    }
  };

  const SettingsItem = ({
    icon,
    title,
    subtitle,
    onPress,
    rightElement,
    destructive,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    destructive?: boolean;
  }) => (
    <TouchableOpacity
      style={styles.settingsItem}
      onPress={onPress}
      disabled={!onPress && !rightElement}
    >
      <View
        style={[
          styles.settingsIcon,
          {
            backgroundColor: destructive
              ? theme.colors.error + '15'
              : theme.colors.primary + '15',
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={destructive ? theme.colors.error : theme.colors.primary}
        />
      </View>
      <View style={styles.settingsContent}>
        <Text
          style={[
            styles.settingsTitle,
            { color: destructive ? theme.colors.error : theme.colors.textPrimary },
          ]}
        >
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.settingsSubtitle, { color: theme.colors.textSecondary }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {rightElement || (onPress && (
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      ))}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
          Settings
        </Text>

        {/* Profile Section */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View
              style={[
                styles.avatarLarge,
                { backgroundColor: theme.colors.primary + '15' },
              ]}
            >
              <Text style={[styles.avatarTextLarge, { color: theme.colors.primary }]}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              {editingProfile ? (
                <TextInput
                  style={[styles.profileNameInput, {
                    color: theme.colors.textPrimary,
                    borderColor: theme.colors.primary,
                  }]}
                  value={editName}
                  onChangeText={setEditName}
                  autoFocus
                  onSubmitEditing={handleSaveProfile}
                  returnKeyType="done"
                />
              ) : (
                <Text style={[styles.profileName, { color: theme.colors.textPrimary }]}>
                  {displayName}
                </Text>
              )}
              <Text style={[styles.profileEmail, { color: theme.colors.textSecondary }]}>
                {email}
              </Text>
            </View>
          </View>
          {editingProfile ? (
            <View style={styles.editActions}>
              <TouchableOpacity
                style={[styles.editProfileButton, { borderColor: theme.colors.border }]}
                onPress={() => setEditingProfile(false)}
              >
                <Text style={[styles.editProfileText, { color: theme.colors.textSecondary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editProfileButton, {
                  borderColor: theme.colors.primary,
                  backgroundColor: theme.colors.primary,
                }]}
                onPress={handleSaveProfile}
              >
                <Text style={[styles.editProfileText, { color: theme.colors.white }]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.editProfileButton, { borderColor: theme.colors.border }]}
              onPress={handleEditProfile}
            >
              <Text style={[styles.editProfileText, { color: theme.colors.primary }]}>
                Edit Profile
              </Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            PREFERENCES
          </Text>
          <Card padding="none">
            <SettingsItem
              icon="notifications-outline"
              title="Notifications"
              subtitle="Shift reminders & updates"
              onPress={() => {}}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="alarm-outline"
              title="Default Alarm"
              subtitle="60 minutes before shift"
              onPress={() => {}}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="globe-outline"
              title="Language"
              subtitle="English"
              onPress={() => {}}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="moon-outline"
              title="Dark Mode"
              rightElement={
                <Switch
                  value={themeMode === 'dark'}
                  onValueChange={handleToggleDarkMode}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor={theme.colors.white}
                />
              }
            />
          </Card>
        </View>

        {/* Calendar */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            CALENDAR
          </Text>
          <Card padding="none">
            <SettingsItem
              icon="logo-apple"
              title="Apple Calendar"
              subtitle={calendarConnected ? 'Connected' : 'Not connected'}
              onPress={handleCalendarConnect}
              rightElement={
                calendarLoading ? (
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>...</Text>
                ) : calendarConnected ? (
                  <View style={[styles.connectedBadge, { backgroundColor: theme.colors.success + '20' }]}>
                    <Text style={[styles.connectedText, { color: theme.colors.success }]}>Connected</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                )
              }
            />
          </Card>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            ABOUT
          </Text>
          <Card padding="none">
            <SettingsItem
              icon="document-text-outline"
              title="Terms of Service"
              onPress={() => router.push('/(auth)/terms')}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="shield-outline"
              title="Privacy Policy"
              onPress={() => router.push('/(auth)/terms')}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="help-circle-outline"
              title="Help & Support"
              onPress={() => {}}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="information-circle-outline"
              title="Version"
              subtitle={APP_VERSION}
            />
          </Card>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            ACCOUNT
          </Text>
          <Card padding="none">
            <SettingsItem
              icon="log-out-outline"
              title="Sign Out"
              onPress={handleSignOut}
              destructive
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="trash-outline"
              title="Delete Account"
              onPress={handleDeleteAccount}
              destructive
            />
          </Card>
        </View>

        {/* Footer */}
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
          Made with care for shift workers everywhere
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
  },
  profileCard: {
    marginBottom: 24,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarTextLarge: {
    fontSize: 24,
    fontWeight: '700',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
  },
  profileNameInput: {
    fontSize: 20,
    fontWeight: '600',
    borderBottomWidth: 2,
    paddingBottom: 4,
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 14,
    marginTop: 2,
  },
  editProfileButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    flex: 1,
  },
  editProfileText: {
    fontSize: 14,
    fontWeight: '600',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingsContent: {
    flex: 1,
  },
  settingsTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  settingsSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 64,
  },
  connectedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  connectedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
});
