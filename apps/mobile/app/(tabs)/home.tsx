import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { useShiftStore } from '../../src/stores/shiftStore';
import { useShiftCodeStore } from '../../src/stores/shiftCodeStore';
import { useGroupStore } from '../../src/stores/groupStore';
import { Card, Button, useToast } from '../../src/components/ui';
import { GuestUpgradeBanner } from '../../src/components/GuestUpgradeBanner';
import { formatDate, getShortWeekday } from '@shiftsnap/shared';
import { useLocaleStore } from '../../src/stores/localeStore';

export default function HomeScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const locale = useLocaleStore((s) => s.locale);
  const { todayShift, upcomingShifts, fetchTodayShift, fetchUpcomingShifts } = useShiftStore();
  const { shiftCodes, fetchShiftCodes, getCodeInfo } = useShiftCodeStore();
  const groups = useGroupStore((s) => s.groups);
  const viewScope = useGroupStore((s) => s.viewScope);
  const cycleViewScope = useGroupStore((s) => s.cycleViewScope);
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User';
  const userId = user?.id;

  const loadData = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      fetchTodayShift(userId),
      fetchUpcomingShifts(userId),
      fetchShiftCodes(userId),
    ]);
  }, [userId, viewScope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.goodMorning');
    if (hour < 18) return t('home.goodAfternoon');
    return t('home.goodEvening');
  };

  const todayCodeInfo = todayShift ? getCodeInfo(todayShift.shift_code) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: theme.colors.textSecondary }]}>
              {getGreeting()},
            </Text>
            <Text style={[styles.userName, { color: theme.colors.textPrimary }]}>
              {displayName}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {groups.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.avatarButton,
                  { backgroundColor: theme.colors.primary + '15' },
                ]}
                onPress={() => {
                  const { scope, label } = cycleViewScope();
                  toast(
                    scope === 'all'
                      ? t('calendar.toastScopeAll')
                      : t('calendar.toastScopeGroup', { name: label }),
                  );
                }}
              >
                <Ionicons
                  name={viewScope === 'all' ? 'globe-outline' : 'people-circle-outline'}
                  size={22}
                  color={viewScope === 'all' ? theme.colors.textMuted : theme.colors.primary}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.avatarButton,
                { backgroundColor: theme.colors.primary + '15' },
              ]}
              onPress={() => router.push('/(tabs)/settings')}
            >
              <Text style={[styles.avatarText, { color: theme.colors.primary }]}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <GuestUpgradeBanner />

        {/* Today's Shift Card */}
        <Card style={styles.todayCard}>
          <LinearGradient
            colors={theme.gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.todayContent}>
            <View style={styles.todayHeader}>
              <Text style={styles.todayLabel}>{t('home.today')}</Text>
              <Text style={styles.todayDate}>
                {formatDate(new Date(), locale)}
              </Text>
            </View>
            {todayShift ? (
              <View style={styles.shiftInfo}>
                <Text style={styles.shiftCode}>{todayShift.shift_code}</Text>
                {todayCodeInfo?.meaning && (
                  <Text style={styles.shiftMeaning}>{todayCodeInfo.meaning}</Text>
                )}
                <Text style={styles.shiftTime}>
                  {todayShift.is_day_off
                    ? t('common.dayOff')
                    : todayShift.start_time
                      ? `${todayShift.start_time}${todayShift.end_time ? ` - ${todayShift.end_time}` : ''}`
                      : ''}
                </Text>
              </View>
            ) : (
              <View style={styles.noShiftInfo}>
                <Ionicons name="sunny-outline" size={32} color="#FFFFFF" />
                <Text style={styles.noShiftText}>{t('home.noShiftToday')}</Text>
              </View>
            )}
          </View>
        </Card>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
            {t('home.quickActions')}
          </Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.colors.cardBackground }]}
              onPress={() => router.push('/(tabs)/scan')}
            >
              <View style={[styles.actionIcon, { backgroundColor: theme.colors.primary + '15' }]}>
                <Ionicons name="camera-outline" size={24} color={theme.colors.primary} />
              </View>
              <Text style={[styles.actionText, { color: theme.colors.textPrimary }]}>
                {t('home.scanSchedule')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.colors.cardBackground }]}
              onPress={() => router.push('/(tabs)/calendar')}
            >
              <View style={[styles.actionIcon, { backgroundColor: theme.colors.secondary + '20' }]}>
                <Ionicons name="calendar-outline" size={24} color={theme.colors.secondary} />
              </View>
              <Text style={[styles.actionText, { color: theme.colors.textPrimary }]}>
                {t('home.viewCalendar')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.colors.cardBackground }]}
              onPress={() => router.push('/(tabs)/shifts')}
            >
              <View style={[styles.actionIcon, { backgroundColor: theme.colors.success + '20' }]}>
                <Ionicons name="list-outline" size={24} color={theme.colors.success} />
              </View>
              <Text style={[styles.actionText, { color: theme.colors.textPrimary }]}>
                {t('home.shiftCodes')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Upcoming Shifts */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
              {t('home.upcomingShifts')}
            </Text>
            <Link href="/(tabs)/calendar">
              <Text style={[styles.seeAllLink, { color: theme.colors.primary }]}>
                {t('home.seeAll')}
              </Text>
            </Link>
          </View>

          {upcomingShifts.length > 0 ? (
            upcomingShifts.map((shift) => {
              const codeInfo = getCodeInfo(shift.shift_code);
              const shiftDate = new Date(shift.date + 'T00:00:00');
              return (
                <Card key={shift.id} style={styles.shiftCard}>
                  <View style={styles.shiftCardContent}>
                    <View
                      style={[
                        styles.dateBox,
                        { backgroundColor: theme.colors.primary + '15' },
                      ]}
                    >
                      <Text style={[styles.dateDay, { color: theme.colors.primary }]}>
                        {shiftDate.getDate()}
                      </Text>
                      <Text style={[styles.dateMonth, { color: theme.colors.primary }]}>
                        {getShortWeekday(shiftDate, locale)}
                      </Text>
                    </View>
                    <View style={styles.shiftCardInfo}>
                      <Text style={[styles.shiftCardCode, { color: theme.colors.textPrimary }]}>
                        {codeInfo?.meaning || t('home.shift', { code: shift.shift_code })}
                      </Text>
                      <Text style={[styles.shiftCardTime, { color: theme.colors.textSecondary }]}>
                        {shift.is_day_off
                          ? t('common.dayOff')
                          : shift.start_time
                            ? t('home.startsAt', { time: shift.start_time })
                            : shift.shift_code}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={theme.colors.textMuted}
                    />
                  </View>
                </Card>
              );
            })
          ) : (
            <Card style={styles.emptyCard}>
              <Ionicons
                name="calendar-outline"
                size={48}
                color={theme.colors.textMuted}
              />
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
                {t('home.noUpcomingShifts')}
              </Text>
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                {t('home.noUpcomingDesc')}
              </Text>
              <Button
                title={t('home.scanSchedule')}
                onPress={() => router.push('/(tabs)/scan')}
                variant="secondary"
                style={{ marginTop: 16 }}
              />
            </Card>
          )}
        </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 14,
    marginBottom: 4,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
  },
  todayCard: {
    marginBottom: 24,
    padding: 0,
    overflow: 'hidden',
    borderRadius: 16,
  },
  todayContent: {
    padding: 20,
  },
  todayHeader: {
    marginBottom: 16,
  },
  todayLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 4,
  },
  todayDate: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  shiftInfo: {
    alignItems: 'flex-start',
  },
  shiftCode: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '700',
    marginBottom: 4,
  },
  shiftMeaning: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  shiftTime: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 18,
    fontWeight: '500',
  },
  noShiftInfo: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  noShiftText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  seeAllLink: {
    fontSize: 14,
    fontWeight: '500',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  shiftCard: {
    marginBottom: 8,
  },
  shiftCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dateDay: {
    fontSize: 18,
    fontWeight: '700',
  },
  dateMonth: {
    fontSize: 11,
    fontWeight: '500',
  },
  shiftCardInfo: {
    flex: 1,
  },
  shiftCardCode: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  shiftCardTime: {
    fontSize: 13,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 24,
  },
});
