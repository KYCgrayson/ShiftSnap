import React, { useState, useEffect } from 'react';
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
  ActionSheetIOS,
  Platform,
  Modal,
  Linking,
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useThemeStore } from '../../src/stores/themeStore';
import { useCalendarStore } from '../../src/stores/calendarStore';
import { useLocaleStore } from '../../src/stores/localeStore';
import { usePersonStore } from '../../src/stores/personStore';
import { useGroupStore } from '../../src/stores/groupStore';
import { supabase } from '../../src/services/supabase';
import * as Clipboard from 'expo-clipboard';
import { APP_VERSION, SUPPORTED_LOCALES, LOCALE_NAMES, PERSON_COLOR_HEX, ALARM_OPTIONS, DEFAULT_ALARM_MINUTES } from '@shiftsnap/shared';
import { useShiftStore } from '../../src/stores/shiftStore';
import { useShiftCodeStore } from '../../src/stores/shiftCodeStore';
import { useScheduleStore } from '../../src/stores/scheduleStore';
import {
  requestNotificationPermissions,
  scheduleShiftReminder,
  cancelAllReminders,
} from '../../src/services/notifications';

const MY_COLOR_KEY = 'shiftsnap_my_schedule_color';
const NOTIFICATIONS_KEY = 'shiftsnap_notifications_enabled';
const ALARM_MINUTES_KEY = 'shiftsnap_default_alarm_minutes';

export default function SettingsScreen() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { user, signOut, isGuest } = useAuthStore();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const { locale, setLocale } = useLocaleStore();
  const { isConnected: calendarConnected, connectCalendar, disconnectCalendar, loading: calendarLoading } = useCalendarStore();

  const { persons, fetchPersons, createPerson, updatePerson, deletePerson } = usePersonStore();
  const {
    groups, currentGroup, members,
    fetchMembers, switchGroup,
    joinGroupByInvite, leaveGroup, updateGroupName,
  } = useGroupStore();

  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [myScheduleColor, setMyScheduleColor] = useState<string>(theme.colors.primary);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorEditTarget, setColorEditTarget] = useState<{ type: 'self' } | { type: 'person'; personId: string } | null>(null);
  const [showAddCoworker, setShowAddCoworker] = useState(false);
  const [newCoworkerName, setNewCoworkerName] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [showJoinGroup, setShowJoinGroup] = useState(false);
  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [showShareInvite, setShowShareInvite] = useState(false);
  const [unsharedCount, setUnsharedCount] = useState(0);
  const [sharingSchedules, setSharingSchedules] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [alarmMinutes, setAlarmMinutes] = useState(DEFAULT_ALARM_MINUTES);

  const upcomingShifts = useShiftStore((s) => s.upcomingShifts);
  const getCodeInfo = useShiftCodeStore((s) => s.getCodeInfo);
  const { getUnsharedCount, shareSchedulesWithGroup } = useScheduleStore();

  useEffect(() => {
    AsyncStorage.getItem(MY_COLOR_KEY).then((color) => {
      if (color) setMyScheduleColor(color);
    });
    AsyncStorage.getItem(NOTIFICATIONS_KEY).then((val) => {
      if (val !== null) setNotificationsEnabled(val === 'true');
    });
    AsyncStorage.getItem(ALARM_MINUTES_KEY).then((val) => {
      if (val !== null) setAlarmMinutes(Number(val));
    });
  }, []);

  useEffect(() => {
    if (user?.id) fetchPersons(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (currentGroup?.id && !isGuest) {
      fetchMembers(currentGroup.id);
    }
  }, [currentGroup?.id, isGuest]);

  const saveColor = async (color: string) => {
    if (!colorEditTarget) return;
    if (colorEditTarget.type === 'self') {
      setMyScheduleColor(color);
      await AsyncStorage.setItem(MY_COLOR_KEY, color);
    } else {
      await updatePerson(colorEditTarget.personId, { color });
    }
    setShowColorPicker(false);
    setColorEditTarget(null);
  };

  const handleAddCoworker = async () => {
    const name = newCoworkerName.trim();
    if (!name) return;
    if (!user?.id) return;
    try {
      await createPerson(user.id, name);
      setNewCoworkerName('');
      setShowAddCoworker(false);
    } catch {
      Alert.alert(t('common.error'), t('shifts.failedToSave'));
    }
  };

  const handleDeleteCoworker = (personId: string, personName: string) => {
    Alert.alert(t('settings.deleteCoworker'), t('settings.deleteCoworkerConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deletePerson(personId),
      },
    ]);
  };

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User';
  const email = user?.email || '';
  const authProvider = user?.app_metadata?.provider || 'email';
  const providerLabel = authProvider === 'google' ? 'Google' : authProvider === 'apple' ? 'Apple' : 'Email';

  const handleSignOut = () => {
    Alert.alert(
      isGuest ? t('settings.exitGuestMode') : t('settings.signOut'),
      isGuest
        ? t('settings.exitGuestDesc')
        : t('settings.signOutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: isGuest ? t('settings.exit') : t('settings.signOut'),
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/welcome');
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('settings.deleteAccount'),
      t('settings.deleteAccountConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteAndSignOut'),
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/welcome');
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
      Alert.alert(t('common.error'), t('settings.nameEmpty'));
      return;
    }

    try {
      await supabase.auth.updateUser({
        data: { display_name: editName.trim() },
      });
      setEditingProfile(false);
    } catch (error) {
      Alert.alert(t('common.error'), t('settings.profileUpdateFailed'));
    }
  };

  const handleToggleDarkMode = () => {
    if (themeMode === 'dark') {
      setThemeMode('light');
    } else {
      setThemeMode('dark');
    }
  };

  const handleLanguageChange = () => {
    // Only show locales that have translations
    const availableLocales = SUPPORTED_LOCALES.filter(
      (loc) => loc === 'en' || loc === 'zh-TW'
    );
    const options = availableLocales.map((loc) => LOCALE_NAMES[loc] || loc);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t('settings.selectLanguage'),
          options: [...options, t('common.cancel')],
          cancelButtonIndex: options.length,
        },
        (buttonIndex) => {
          if (buttonIndex < availableLocales.length) {
            const selected = availableLocales[buttonIndex];
            setLocale(selected);
            i18n.changeLanguage(selected);
          }
        }
      );
    } else {
      // Android fallback: use Alert with buttons
      const buttons = availableLocales.map((loc) => ({
        text: LOCALE_NAMES[loc] || loc,
        onPress: () => {
          setLocale(loc);
          i18n.changeLanguage(loc);
        },
      }));
      buttons.push({ text: t('common.cancel'), onPress: () => {} });
      Alert.alert(t('settings.selectLanguage'), undefined, buttons);
    }
  };

  const handleCalendarConnect = async () => {
    if (calendarConnected) {
      Alert.alert(t('settings.disconnectCalendar'), t('settings.disconnectDesc'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.disconnect'),
          style: 'destructive',
          onPress: () => disconnectCalendar(),
        },
      ]);
    } else {
      const success = await connectCalendar();
      if (success) {
        Alert.alert(t('settings.connected'), t('settings.calendarConnected'));
      }
    }
  };

  const scheduleAllReminders = async (minutes: number) => {
    await cancelAllReminders();
    for (const shift of upcomingShifts) {
      if (shift.is_day_off || !shift.start_time) continue;
      const codeInfo = getCodeInfo(shift.shift_code);
      await scheduleShiftReminder(shift, codeInfo ? { meaning: codeInfo.meaning } : undefined, minutes);
    }
  };

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      // Disable
      setNotificationsEnabled(false);
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, 'false');
      await cancelAllReminders();
    } else {
      // Enable — request permission first
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(t('common.error'), t('settings.notificationsPermDenied'));
        return;
      }
      setNotificationsEnabled(true);
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, 'true');
      await scheduleAllReminders(alarmMinutes);
    }
  };

  const handleAlarmChange = () => {
    const labels = ALARM_OPTIONS.map((opt) => opt.label);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t('settings.selectAlarm'),
          options: [...labels, t('common.cancel')],
          cancelButtonIndex: labels.length,
        },
        async (buttonIndex) => {
          if (buttonIndex < ALARM_OPTIONS.length) {
            const selected = ALARM_OPTIONS[buttonIndex].value;
            setAlarmMinutes(selected);
            await AsyncStorage.setItem(ALARM_MINUTES_KEY, String(selected));
            if (notificationsEnabled) {
              await scheduleAllReminders(selected);
            }
          }
        }
      );
    } else {
      const buttons = ALARM_OPTIONS.map((opt) => ({
        text: opt.label,
        onPress: async () => {
          setAlarmMinutes(opt.value);
          await AsyncStorage.setItem(ALARM_MINUTES_KEY, String(opt.value));
          if (notificationsEnabled) {
            await scheduleAllReminders(opt.value);
          }
        },
      }));
      buttons.push({ text: t('common.cancel'), onPress: () => {} });
      Alert.alert(t('settings.selectAlarm'), undefined, buttons);
    }
  };

  const getAlarmLabel = (minutes: number): string => {
    const option = ALARM_OPTIONS.find((opt) => opt.value === minutes);
    return option ? option.label : `${minutes} min`;
  };

  const handleCopyInviteCode = async () => {
    if (!currentGroup?.invite_code) return;
    await Clipboard.setStringAsync(currentGroup.invite_code);
    Alert.alert(t('settings.copied'), t('settings.inviteCodeCopied'));
  };

  const handleShareViaSystem = async () => {
    if (!currentGroup?.invite_code) return;
    const code = currentGroup.invite_code;
    const url = `shiftsnap://invite/${code}`;
    const message = t('settings.shareMessageTemplate', { code, url });
    try {
      await Share.share({ message });
    } catch (e) {
      console.warn('Share failed:', e);
    }
  };

  const handleOpenShareInvite = async () => {
    if (!currentGroup || !user?.id) return;
    setShowShareInvite(true);
    const count = await getUnsharedCount(user.id, currentGroup.id);
    setUnsharedCount(count);
  };

  const handleShareAllSchedules = async () => {
    if (!currentGroup || !user?.id) return;
    setSharingSchedules(true);
    try {
      const count = await shareSchedulesWithGroup(user.id, currentGroup.id);
      setUnsharedCount(0);
      setSharingSchedules(false);
      Alert.alert(
        t('settings.shareExistingSchedules'),
        count === 1
          ? t('settings.schedulesSharedOne')
          : t('settings.schedulesShared', { count })
      );
    } catch {
      setSharingSchedules(false);
      Alert.alert(t('common.error'), t('settings.shareFailed'));
    }
  };

  const handleEditGroupName = () => {
    if (!currentGroup) return;
    // Check if user is admin
    const myMembership = members.find((m) => m.user_id === user?.id);
    if (myMembership?.role !== 'admin') {
      Alert.alert(t('settings.editGroupName'), t('settings.onlyAdminCanEdit'));
      return;
    }
    if (Platform.OS === 'ios') {
      Alert.prompt(
        t('settings.editGroupName'),
        undefined,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.save'),
            onPress: (name: string | undefined) => {
              if (name?.trim() && currentGroup) {
                updateGroupName(currentGroup.id, name.trim());
              }
            },
          },
        ],
        'plain-text',
        currentGroup.name
      );
    } else {
      // Android: simple alert (prompt not available)
      Alert.alert(t('settings.editGroupName'), t('settings.onlyAdminCanEdit'));
    }
  };

  const handleJoinGroup = async () => {
    const code = joinInviteCode.trim().toUpperCase();
    if (code.length < 4 || !user?.id) return;
    try {
      await joinGroupByInvite(user.id, code);
      setShowJoinGroup(false);
      setJoinInviteCode('');
      Alert.alert(t('settings.groupJoined'), t('settings.groupJoinedDesc'));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'ALREADY_MEMBER') {
        Alert.alert(t('common.error'), t('settings.alreadyMember'));
      } else {
        Alert.alert(t('common.error'), t('settings.joinFailed'));
      }
    }
  };

  const handleLeaveGroup = (groupId: string) => {
    if (!user?.id) return;
    Alert.alert(t('settings.leaveGroup'), t('settings.leaveGroupConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.leave'),
        style: 'destructive',
        onPress: () => leaveGroup(user.id, groupId),
      },
    ]);
  };

  const handleSwitchGroup = () => {
    if (groups.length <= 1) return;
    const options = groups.map((g) => g.name);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t('settings.switchGroup'),
          options: [...options, t('common.cancel')],
          cancelButtonIndex: options.length,
        },
        (buttonIndex) => {
          if (buttonIndex < groups.length) {
            switchGroup(groups[buttonIndex].id);
          }
        }
      );
    } else {
      const buttons = groups.map((g) => ({
        text: g.name,
        onPress: () => switchGroup(g.id),
      }));
      buttons.push({ text: t('common.cancel'), onPress: () => {} });
      Alert.alert(t('settings.switchGroup'), undefined, buttons);
    }
  };

  const currentLocaleName = LOCALE_NAMES[i18n.language] || LOCALE_NAMES[locale] || 'English';

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
          {t('settings.title')}
        </Text>

        {/* Profile Section */}
        {isGuest ? (
          <Card style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <View
                style={[
                  styles.avatarLarge,
                  { backgroundColor: theme.colors.primary + '15' },
                ]}
              >
                <Text style={[styles.avatarTextLarge, { color: theme.colors.primary }]}>G</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: theme.colors.textPrimary }]}>
                  {t('settings.guestUser')}
                </Text>
                <Text style={[styles.profileEmail, { color: theme.colors.textSecondary }]}>
                  {t('settings.guestHint')}
                </Text>
              </View>
            </View>
            <View style={styles.editActions}>
              <TouchableOpacity
                style={[styles.editProfileButton, {
                  borderColor: theme.colors.primary,
                  backgroundColor: theme.colors.primary,
                }]}
                onPress={() => router.push('/(auth)/register')}
              >
                <Text style={[styles.editProfileText, { color: theme.colors.white }]}>
                  {t('common.createAccount')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editProfileButton, { borderColor: theme.colors.border }]}
                onPress={() => router.push('/(auth)/login')}
              >
                <Text style={[styles.editProfileText, { color: theme.colors.primary }]}>
                  {t('common.signIn')}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        ) : (
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
                    {t('common.cancel')}
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
                    {t('common.save')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.editProfileButton, { borderColor: theme.colors.border }]}
                onPress={handleEditProfile}
              >
                <Text style={[styles.editProfileText, { color: theme.colors.primary }]}>
                  {t('settings.editProfile')}
                </Text>
              </TouchableOpacity>
            )}
          </Card>
        )}

        {/* Account Info (authenticated users only) */}
        {!isGuest && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              {t('auth.accountInfo')}
            </Text>
            <Card padding="none">
              <SettingsItem
                icon="mail-outline"
                title={t('auth.emailLabel')}
                subtitle={email || '—'}
              />
              <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
              <SettingsItem
                icon={authProvider === 'google' ? 'logo-google' : authProvider === 'apple' ? 'logo-apple' : 'key-outline'}
                title={t('auth.provider')}
                subtitle={providerLabel}
              />
            </Card>
          </View>
        )}

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            {t('settings.preferences')}
          </Text>
          <Card padding="none">
            <SettingsItem
              icon="notifications-outline"
              title={t('settings.notifications')}
              subtitle={notificationsEnabled ? t('settings.notificationsEnabled') : t('settings.notificationsDisabled')}
              rightElement={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleToggleNotifications}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor={theme.colors.white}
                />
              }
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="alarm-outline"
              title={t('settings.defaultAlarm')}
              subtitle={t('settings.alarmBeforeShift', { time: getAlarmLabel(alarmMinutes) })}
              onPress={handleAlarmChange}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="globe-outline"
              title={t('settings.language')}
              subtitle={currentLocaleName}
              onPress={handleLanguageChange}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="moon-outline"
              title={t('settings.darkMode')}
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
            {t('settings.calendarSection')}
          </Text>
          <Card padding="none">
            <SettingsItem
              icon="logo-apple"
              title={t('settings.appleCalendar')}
              subtitle={calendarConnected ? t('settings.connected') : t('settings.notConnected')}
              onPress={handleCalendarConnect}
              rightElement={
                calendarLoading ? (
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>...</Text>
                ) : calendarConnected ? (
                  <View style={[styles.connectedBadge, { backgroundColor: theme.colors.success + '20' }]}>
                    <Text style={[styles.connectedText, { color: theme.colors.success }]}>{t('settings.connected')}</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                )
              }
            />
          </Card>
        </View>

        {/* Group Management (authenticated users only) */}
        {!isGuest && currentGroup && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              {t('settings.groupSection')}
            </Text>
            <Card padding="none">
              {/* Group name */}
              <SettingsItem
                icon="people-outline"
                title={currentGroup.name}
                subtitle={groups.length > 1 ? t('settings.switchGroup') : t('settings.groupNameHint')}
                onPress={groups.length > 1 ? handleSwitchGroup : handleEditGroupName}
              />
              <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
              {/* Invite code */}
              <SettingsItem
                icon="key-outline"
                title={t('settings.shareInvite')}
                subtitle={currentGroup.invite_code}
                onPress={handleOpenShareInvite}
                rightElement={
                  <TouchableOpacity onPress={handleOpenShareInvite}>
                    <Ionicons name="share-outline" size={20} color={theme.colors.primary} />
                  </TouchableOpacity>
                }
              />
              <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
              {/* Members */}
              <View style={styles.settingsItem}>
                <View style={[styles.settingsIcon, { backgroundColor: theme.colors.primary + '15' }]}>
                  <Ionicons name="person-outline" size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.settingsContent}>
                  <Text style={[styles.settingsTitle, { color: theme.colors.textPrimary }]}>
                    {t('settings.members')} ({members.length})
                  </Text>
                </View>
              </View>
              {members.map((member) => (
                <View key={member.id} style={[styles.settingsItem, { paddingVertical: 8, paddingLeft: 64 }]}>
                  <View style={styles.settingsContent}>
                    <Text style={[styles.settingsTitle, { color: theme.colors.textPrimary }]}>
                      {member.display_name || member.nickname || '—'}
                      {member.user_id === user?.id ? ` ${t('settings.you')}` : ''}
                    </Text>
                    <Text style={[styles.settingsSubtitle, { color: theme.colors.textSecondary }]}>
                      {member.role === 'admin' ? t('settings.admin') : t('settings.member')}
                    </Text>
                  </View>
                </View>
              ))}
              <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
              {/* Join another group */}
              <TouchableOpacity style={styles.settingsItem} onPress={() => setShowJoinGroup(true)}>
                <View style={[styles.settingsIcon, { backgroundColor: theme.colors.primary + '15' }]}>
                  <Ionicons name="enter-outline" size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.settingsContent}>
                  <Text style={[styles.settingsTitle, { color: theme.colors.primary }]}>
                    {t('settings.joinGroup')}
                  </Text>
                </View>
              </TouchableOpacity>
              {/* Leave group (only if more than 1 group) */}
              {groups.length > 1 && (
                <>
                  <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
                  <SettingsItem
                    icon="exit-outline"
                    title={t('settings.leaveGroup')}
                    onPress={() => handleLeaveGroup(currentGroup.id)}
                    destructive
                  />
                </>
              )}
            </Card>
          </View>
        )}

        {/* Coworkers & Colors */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            {t('settings.coworkersSection')}
          </Text>
          <Card padding="none">
            {/* My Schedule */}
            <View style={styles.settingsItem}>
              <TouchableOpacity
                style={[styles.colorCircle, { backgroundColor: myScheduleColor }]}
                onPress={() => {
                  setColorEditTarget({ type: 'self' });
                  setShowColorPicker(true);
                }}
              />
              <View style={styles.settingsContent}>
                <Text style={[styles.settingsTitle, { color: theme.colors.textPrimary }]}>
                  {t('settings.myScheduleColor')}
                </Text>
              </View>
            </View>
            {/* Coworkers */}
            {persons.map((person) => (
              <React.Fragment key={person.id}>
                <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
                <View style={styles.settingsItem}>
                  <TouchableOpacity
                    style={[styles.colorCircle, { backgroundColor: person.color }]}
                    onPress={() => {
                      setColorEditTarget({ type: 'person', personId: person.id });
                      setShowColorPicker(true);
                    }}
                  />
                  <View style={styles.settingsContent}>
                    <Text style={[styles.settingsTitle, { color: theme.colors.textPrimary }]}>
                      {person.name}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteCoworker(person.id, person.name)}>
                    <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              </React.Fragment>
            ))}
            {/* Add Coworker */}
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <TouchableOpacity
              style={styles.settingsItem}
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Alert.prompt(
                    t('settings.addCoworker'),
                    t('settings.coworkerName'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('common.save'),
                        onPress: (name: string | undefined) => {
                          if (name?.trim() && user?.id) {
                            createPerson(user.id, name.trim());
                          }
                        },
                      },
                    ],
                    'plain-text'
                  );
                } else {
                  setShowAddCoworker(true);
                }
              }}
            >
              <View style={[styles.settingsIcon, { backgroundColor: theme.colors.primary + '15' }]}>
                <Ionicons name="person-add-outline" size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.settingsContent}>
                <Text style={[styles.settingsTitle, { color: theme.colors.primary }]}>
                  {t('settings.addCoworker')}
                </Text>
              </View>
            </TouchableOpacity>
          </Card>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            {t('settings.about')}
          </Text>
          <Card padding="none">
            <SettingsItem
              icon="document-text-outline"
              title={t('settings.termsOfService')}
              onPress={() => router.push('/(auth)/terms')}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="shield-outline"
              title={t('settings.privacyPolicy')}
              onPress={() => router.push('/(auth)/privacy')}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="help-circle-outline"
              title={t('settings.helpSupport')}
              onPress={() => { setFeedbackText(''); setShowFeedback(true); }}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
            <SettingsItem
              icon="information-circle-outline"
              title={t('settings.version')}
              subtitle={APP_VERSION}
            />
          </Card>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            {t('settings.account')}
          </Text>
          <Card padding="none">
            {isGuest ? (
              <SettingsItem
                icon="log-out-outline"
                title={t('settings.exitGuestMode')}
                onPress={handleSignOut}
                destructive
              />
            ) : (
              <>
                <SettingsItem
                  icon="log-out-outline"
                  title={t('settings.signOut')}
                  onPress={handleSignOut}
                  destructive
                />
                <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />
                <SettingsItem
                  icon="trash-outline"
                  title={t('settings.deleteAccount')}
                  onPress={handleDeleteAccount}
                  destructive
                />
              </>
            )}
          </Card>
        </View>

        {/* Footer */}
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
          {t('settings.footer')}
        </Text>
      </ScrollView>

      {/* Color Picker Modal */}
      <Modal visible={showColorPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setShowColorPicker(false); setColorEditTarget(null); }}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.colors.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
              {t('calendar.chooseColor')}
            </Text>
            <View style={styles.colorGrid}>
              {PERSON_COLOR_HEX.map((color) => {
                const currentColor = colorEditTarget?.type === 'self'
                  ? myScheduleColor
                  : colorEditTarget?.type === 'person'
                    ? persons.find((p) => p.id === colorEditTarget.personId)?.color
                    : undefined;
                return (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      currentColor === color && styles.colorOptionSelected,
                    ]}
                    onPress={() => saveColor(color)}
                  />
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Join Group Modal */}
      <Modal visible={showJoinGroup} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setShowJoinGroup(false); setJoinInviteCode(''); }}
        >
          <View
            style={[styles.modalContent, { backgroundColor: theme.colors.cardBackground }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
              {t('settings.joinGroup')}
            </Text>
            <TextInput
              style={[styles.modalInput, {
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.warmWhite,
                textAlign: 'center',
                fontSize: 20,
                letterSpacing: 4,
                textTransform: 'uppercase',
              }]}
              placeholder={t('settings.enterInviteCode')}
              placeholderTextColor={theme.colors.textMuted}
              value={joinInviteCode}
              onChangeText={(text) => setJoinInviteCode(text.toUpperCase().slice(0, 8))}
              autoFocus
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={handleJoinGroup}
              maxLength={8}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: theme.colors.border }]}
                onPress={() => { setShowJoinGroup(false); setJoinInviteCode(''); }}
              >
                <Text style={[styles.modalButtonText, { color: theme.colors.textSecondary }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, {
                  borderColor: theme.colors.primary,
                  backgroundColor: joinInviteCode.trim().length >= 4 ? theme.colors.primary : theme.colors.border,
                }]}
                onPress={handleJoinGroup}
                disabled={joinInviteCode.trim().length < 4}
              >
                <Text style={[styles.modalButtonText, {
                  color: joinInviteCode.trim().length >= 4 ? theme.colors.white : theme.colors.textMuted,
                }]}>
                  {t('settings.join')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Coworker Modal (Android) */}
      <Modal visible={showAddCoworker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAddCoworker(false)}
        >
          <View
            style={[styles.modalContent, { backgroundColor: theme.colors.cardBackground }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
              {t('settings.addCoworker')}
            </Text>
            <TextInput
              style={[styles.modalInput, {
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.warmWhite,
              }]}
              placeholder={t('settings.coworkerName')}
              placeholderTextColor={theme.colors.textMuted}
              value={newCoworkerName}
              onChangeText={setNewCoworkerName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddCoworker}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: theme.colors.border }]}
                onPress={() => { setShowAddCoworker(false); setNewCoworkerName(''); }}
              >
                <Text style={[styles.modalButtonText, { color: theme.colors.textSecondary }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary }]}
                onPress={handleAddCoworker}
              >
                <Text style={[styles.modalButtonText, { color: theme.colors.white }]}>
                  {t('common.save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Feedback / Help Modal */}
      <Modal visible={showFeedback} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFeedback(false)}
        >
          <View
            style={[styles.modalContent, { backgroundColor: theme.colors.cardBackground }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
              {t('settings.helpSupport')}
            </Text>
            <TextInput
              style={[styles.modalInput, styles.feedbackInput, {
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.warmWhite,
              }]}
              placeholder={t('settings.feedbackPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={feedbackText}
              onChangeText={setFeedbackText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: theme.colors.border }]}
                onPress={() => setShowFeedback(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.colors.textSecondary }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, {
                  borderColor: theme.colors.primary,
                  backgroundColor: feedbackText.trim() ? theme.colors.primary : theme.colors.primary + '50',
                }]}
                disabled={!feedbackText.trim()}
                onPress={() => {
                  // TODO: send feedback to backend when ready
                  setShowFeedback(false);
                  Alert.alert(t('settings.feedbackSent'), t('settings.feedbackSentDesc'));
                }}
              >
                <Text style={[styles.modalButtonText, { color: theme.colors.white }]}>
                  {t('settings.sendFeedback')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Share Invite Code Modal */}
      <Modal visible={showShareInvite} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowShareInvite(false)}
        >
          <View
            style={[styles.modalContent, { backgroundColor: theme.colors.cardBackground }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
              {t('settings.shareInvite')}
            </Text>

            {/* Invite code display */}
            <View style={[styles.inviteCodeDisplay, { backgroundColor: theme.colors.warmWhite, borderColor: theme.colors.border }]}>
              <Text style={[styles.inviteCodeText, { color: theme.colors.textPrimary }]}>
                {currentGroup?.invite_code}
              </Text>
              <TouchableOpacity onPress={handleCopyInviteCode}>
                <Ionicons name="copy-outline" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.shareHint, { color: theme.colors.textSecondary }]}>
              {t('settings.shareInstructions')}
            </Text>

            {/* System share button */}
            <TouchableOpacity
              style={[styles.shareAllButton, { backgroundColor: theme.colors.primary, marginTop: 12, alignSelf: 'stretch' }]}
              onPress={handleShareViaSystem}
            >
              <Ionicons name="share-social-outline" size={18} color={theme.colors.white} />
              <Text style={[styles.shareAllButtonText, { color: theme.colors.white }]}>
                {t('settings.shareViaSystem')}
              </Text>
            </TouchableOpacity>

            {/* Unshared schedules section */}
            <View style={[styles.shareSection, { borderTopColor: theme.colors.borderLight }]}>
              <View style={styles.shareSectionHeader}>
                <Ionicons
                  name={unsharedCount > 0 ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                  size={20}
                  color={unsharedCount > 0 ? theme.colors.warning : theme.colors.success}
                />
                <Text style={[styles.shareSectionText, { color: theme.colors.textPrimary }]}>
                  {unsharedCount > 0
                    ? (unsharedCount === 1
                      ? t('settings.unsharedCountOne')
                      : t('settings.unsharedCount', { count: unsharedCount }))
                    : t('settings.allShared')}
                </Text>
              </View>

              {unsharedCount > 0 && (
                <TouchableOpacity
                  style={[styles.shareAllButton, { backgroundColor: theme.colors.primary }]}
                  onPress={handleShareAllSchedules}
                  disabled={sharingSchedules}
                >
                  <Ionicons name="share-outline" size={18} color={theme.colors.white} />
                  <Text style={[styles.shareAllButtonText, { color: theme.colors.white }]}>
                    {sharingSchedules ? t('settings.sharing') : t('settings.shareAll')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Close button */}
            <TouchableOpacity
              style={[styles.modalButton, { borderColor: theme.colors.border, marginTop: 12, alignSelf: 'stretch' }]}
              onPress={() => setShowShareInvite(false)}
            >
              <Text style={[styles.modalButtonText, { color: theme.colors.textSecondary }]}>
                {t('common.ok')}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    width: 280,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 20,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  modalInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  feedbackInput: {
    height: 120,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  inviteCodeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  inviteCodeText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
  },
  shareHint: {
    fontSize: 13,
    marginBottom: 16,
  },
  shareSection: {
    borderTopWidth: 1,
    paddingTop: 16,
    width: '100%',
  },
  shareSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  shareSectionText: {
    fontSize: 14,
    flex: 1,
  },
  shareAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 4,
  },
  shareAllButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
