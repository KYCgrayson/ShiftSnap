import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Switch,
  Alert,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, DateData, LocaleConfig } from 'react-native-calendars';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { useShiftStore } from '../../src/stores/shiftStore';
import { useShiftCodeStore } from '../../src/stores/shiftCodeStore';
import { usePersonStore } from '../../src/stores/personStore';
import { useCalendarStore } from '../../src/stores/calendarStore';
import { useGroupStore } from '../../src/stores/groupStore';
import { useToast } from '../../src/components/ui';
import { Card, TimePickerInput } from '../../src/components/ui';
import { GuestUpgradeBanner } from '../../src/components/GuestUpgradeBanner';
import { CalendarDayWithBars } from '../../src/components/CalendarDayWithBars';
import { useRealtimeShifts } from '../../src/hooks/useRealtimeShifts';
import { useLocaleStore } from '../../src/stores/localeStore';
import { useDailyNoteStore } from '../../src/stores/dailyNoteStore';
import { useFocusEffect } from 'expo-router';
import { formatYearMonth, PERSON_COLOR_HEX, getShiftTypeColor, ShiftTypeColors } from '@shiftsnap/shared';

// Configure zh-TW locale for react-native-calendars
LocaleConfig.locales['zh-TW'] = {
  monthNames: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
  monthNamesShort: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  dayNames: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
  dayNamesShort: ['日', '一', '二', '三', '四', '五', '六'],
  today: '今天',
};

const SHOW_CODES_KEY = 'shiftsnap_show_shift_codes';
const SHOW_COWORKERS_KEY = 'shiftsnap_show_coworker_shifts';
const UNIFY_DAYOFF_KEY = 'shiftsnap_unify_dayoff';
const UNIFY_DAYOFF_SYMBOL_KEY = 'shiftsnap_unify_dayoff_symbol';

interface ShiftEvent {
  id: string;
  date: string;
  code: string;
  startTime: string | null;
  endTime: string | null;
  isDayOff: boolean;
  personId: string | null;
  personName?: string;
  color: string;
  source: string;
  nameOnSchedule: string | null;
  comparisonStatus: string | null;
  shiftUserId: string;
}

export default function CalendarScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const locale = useLocaleStore((s) => s.locale);
  const { user } = useAuthStore();
  const { monthShifts, fetchShiftsForMonth, updateShift, updateShiftCalendarSync, loading } = useShiftStore();
  const { shiftCodes, fetchShiftCodes, getCodeInfo } = useShiftCodeStore();
  const { persons, fetchPersons, updatePerson } = usePersonStore();
  const { isConnected: calendarConnected, syncShift } = useCalendarStore();
  const { notesByDate, fetchNotesForMonth, saveNote } = useDailyNoteStore();
  const currentGroupId = useGroupStore((s) => s.currentGroup?.id);
  const groups = useGroupStore((s) => s.groups);
  const viewScope = useGroupStore((s) => s.viewScope);
  const cycleViewScope = useGroupStore((s) => s.cycleViewScope);
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [currentMonth, setCurrentMonth] = useState<string>(formatYearMonth(new Date()));
  const [refreshing, setRefreshing] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorEditTarget, setColorEditTarget] = useState<{ personId: string; personName: string } | null>(null);
  const [visiblePersonIds, setVisiblePersonIds] = useState<Set<string>>(new Set(['self']));
  const [showShiftCodes, setShowShiftCodes] = useState(false);
  const [showCoworkerShifts, setShowCoworkerShifts] = useState(false);
  const [unifyDayOff, setUnifyDayOff] = useState(false);
  const [unifyDayOffSymbol, setUnifyDayOffSymbol] = useState('');

  // Shift edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftEvent | null>(null);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Note modal state
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');

  const userId = user?.id;

  // Set calendar locale
  LocaleConfig.defaultLocale = locale === 'zh-TW' ? 'zh-TW' : '';

  // Realtime shifts subscription
  useRealtimeShifts(userId, currentMonth, currentGroupId);

  // Load saved preferences
  useEffect(() => {
    AsyncStorage.getItem(SHOW_CODES_KEY).then((val) => {
      if (val !== null) setShowShiftCodes(val === 'true');
    });
    AsyncStorage.getItem(SHOW_COWORKERS_KEY).then((val) => {
      if (val !== null) setShowCoworkerShifts(val === 'true');
    });
  }, []);

  // Reload unify day-off settings when tab is focused
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(UNIFY_DAYOFF_KEY).then((val) => {
        setUnifyDayOff(val === 'true');
      });
      AsyncStorage.getItem(UNIFY_DAYOFF_SYMBOL_KEY).then((val) => {
        setUnifyDayOffSymbol(val || '');
      });
    }, [])
  );

  // Auto-add new persons to visible set
  useEffect(() => {
    setVisiblePersonIds((prev) => {
      const next = new Set(prev);
      persons.forEach((p) => next.add(p.id));
      return next;
    });
  }, [persons]);

  const saveColor = async (color: string) => {
    if (!colorEditTarget) return;
    await updatePerson(colorEditTarget.personId, { color });
    setShowColorPicker(false);
    setColorEditTarget(null);
  };

  const loadMonth = useCallback(async (yearMonth: string) => {
    if (!userId) return;
    await fetchShiftsForMonth(userId, yearMonth);
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchShiftCodes(userId);
      fetchPersons(userId);
      loadMonth(currentMonth);
      fetchNotesForMonth(userId, currentMonth);
    }
  }, [userId, currentMonth, currentGroupId, viewScope]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMonth(currentMonth);
    setRefreshing(false);
  };

  // Convert DB shifts to ShiftEvent format
  const shifts: ShiftEvent[] = useMemo(() => {
    return monthShifts.map((shift) => {
      const person = shift.person_id ? persons.find((p) => p.id === shift.person_id) : null;
      // isSelf: must match both source type AND user_id
      const isSelfSource = shift.source === 'self_scan' || !shift.source || shift.source === 'manual';
      const isSelf = isSelfSource && shift.user_id === userId;
      // For self shifts: color by shift type (morning/afternoon/night/day-off)
      // For coworker shifts: color by person
      const codeInfo = getCodeInfo(shift.shift_code);
      const startTime = shift.start_time || codeInfo?.start_time || null;
      const isDayOff = shift.is_day_off || codeInfo?.is_day_off || false;
      return {
        id: shift.id,
        date: shift.date,
        code: shift.shift_code,
        startTime: shift.start_time,
        endTime: shift.end_time,
        isDayOff,
        personId: shift.person_id || null,
        personName: (shift as any).name_on_schedule || person?.name,
        color: isSelf
          ? getShiftTypeColor(isDayOff, startTime)
          : (person?.color || '#A78BFA'),
        source: shift.source || 'self_scan',
        nameOnSchedule: (shift as any).name_on_schedule || null,
        comparisonStatus: (shift as any).comparison_status || null,
        shiftUserId: shift.user_id,
      };
    });
  }, [monthShifts, shiftCodes, theme, persons, getCodeInfo, userId]);

  // Helper to check if a shift belongs to the current user
  const isMyShift = useCallback((shift: ShiftEvent) => {
    const isSelfSource = shift.source === 'self_scan' || shift.source === 'manual' || !shift.source;
    return isSelfSource && shift.shiftUserId === userId;
  }, [userId]);

  // Helper to check if a shift's times differ from its shift code defaults
  const isShiftOverridden = useCallback((shift: ShiftEvent) => {
    const codeInfo = getCodeInfo(shift.code);
    if (!codeInfo) return false;
    const defaultStart = codeInfo.start_time || null;
    const defaultEnd = codeInfo.end_time || null;
    const shiftStart = shift.startTime || null;
    const shiftEnd = shift.endTime || null;
    return shiftStart !== defaultStart || shiftEnd !== defaultEnd;
  }, [getCodeInfo]);

  // Filter by visible person IDs, then sort: self first, then coworkers grouped by person
  const filteredShifts = useMemo(() => {
    const filtered = shifts.filter((shift) => {
      if (isMyShift(shift)) {
        return visiblePersonIds.has('self');
      }
      // Match by person_id directly
      if (shift.personId) {
        return visiblePersonIds.has(shift.personId);
      }
      // Fall back to matching by name_on_schedule against persons
      if (shift.nameOnSchedule) {
        const matchedPerson = persons.find((p) => p.name === shift.nameOnSchedule);
        if (matchedPerson) {
          return visiblePersonIds.has(matchedPerson.id);
        }
      }
      // No match — show if 'self' is visible (fallback)
      return visiblePersonIds.has('self');
    });

    // Sort: self shifts first, then coworker shifts grouped by personId
    filtered.sort((a, b) => {
      const aIsSelf = isMyShift(a);
      const bIsSelf = isMyShift(b);
      if (aIsSelf && !bIsSelf) return -1;
      if (!aIsSelf && bIsSelf) return 1;
      // Both coworker shifts — group by personId then personName
      if (!aIsSelf && !bIsSelf) {
        const aKey = a.personId || a.personName || '';
        const bKey = b.personId || b.personName || '';
        if (aKey !== bKey) return aKey.localeCompare(bKey);
      }
      return 0;
    });

    return filtered;
  }, [shifts, visiblePersonIds, persons, isMyShift]);

  // Generate marked dates for calendar (bars format)
  // Default: only self shifts; when expanded: include coworker shifts
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    filteredShifts.forEach((shift) => {
      if (!isMyShift(shift) && !showCoworkerShifts) return;

      if (!marks[shift.date]) {
        marks[shift.date] = { bars: [] };
      }
      const mine = isMyShift(shift);
      marks[shift.date].bars.push({
        key: shift.id,
        color: shift.color,
        label: (unifyDayOff && shift.isDayOff && unifyDayOffSymbol) ? unifyDayOffSymbol : shift.code,
        isMine: mine,
      });

      // Mark days that have my data
      if (isMyShift(shift)) {
        marks[shift.date].hasMyData = true;
      }
    });

    // Add note indicators
    Object.keys(notesByDate).forEach((date) => {
      if (!marks[date]) {
        marks[date] = { bars: [], hasMyData: true };
      } else {
        marks[date].hasMyData = true;
      }
      marks[date].bars = marks[date].bars || [];
      marks[date].bars.push({
        key: `note-${date}`,
        color: '#F97316',
        label: '📝',
        isNote: true,
      });
    });

    if (marks[selectedDate]) {
      marks[selectedDate] = {
        ...marks[selectedDate],
        selected: true,
      };
    } else {
      marks[selectedDate] = {
        selected: true,
      };
    }

    return marks;
  }, [filteredShifts, selectedDate, showCoworkerShifts, theme, isMyShift, unifyDayOff, unifyDayOffSymbol, notesByDate]);

  const selectedDateShifts = useMemo(() => {
    return filteredShifts.filter((shift) => shift.date === selectedDate);
  }, [filteredShifts, selectedDate]);

  // Split into self vs coworker shifts for the selected date
  const myDateShifts = useMemo(() => {
    return selectedDateShifts.filter((s) => isMyShift(s));
  }, [selectedDateShifts, isMyShift]);

  const coworkerDateShifts = useMemo(() => {
    return selectedDateShifts.filter((s) => !isMyShift(s));
  }, [selectedDateShifts, isMyShift]);

  const handleDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
    setShowCoworkerShifts(false);
  };

  const handleMonthChange = (month: DateData) => {
    const ym = `${month.year}-${String(month.month).padStart(2, '0')}`;
    setCurrentMonth(ym);
  };

  // Toggle person visibility
  const togglePersonVisibility = (personId: string) => {
    setVisiblePersonIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) {
        next.delete(personId);
      } else {
        next.add(personId);
      }
      return next;
    });
  };

  // Open shift edit modal
  const handleEditShift = (shift: ShiftEvent) => {
    setEditingShift(shift);
    setEditStartTime(shift.startTime || '');
    setEditEndTime(shift.endTime || '');
    setShowEditModal(true);
  };

  // Save shift edit. Guard against concurrent taps so a slow network
  // can't queue duplicate UPDATEs that race each other.
  const handleSaveShiftEdit = async () => {
    if (!editingShift || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateShift(editingShift.id, {
        start_time: editStartTime || null,
        end_time: editEndTime || null,
      });
      // Re-sync to device calendar if connected
      if (calendarConnected) {
        const dbShift = monthShifts.find((s) => s.id === editingShift.id);
        if (dbShift) {
          const codeInfo = getCodeInfo(editingShift.code);
          const eventId = await syncShift(
            { ...dbShift, start_time: editStartTime || null },
            codeInfo ? { meaning: codeInfo.meaning, start_time: editStartTime || null, end_time: editEndTime || null } : undefined
          );
          if (eventId && dbShift.id) {
            await updateShiftCalendarSync(dbShift.id, eventId);
          }
        }
      }
      setShowEditModal(false);
      setEditingShift(null);
    } catch (e) {
      const reason = e instanceof Error ? e.message : '';
      Alert.alert(
        t('common.error'),
        reason ? `${t('calendar.editFailed')}\n${reason}` : t('calendar.editFailed'),
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // Note handlers
  const openNoteModal = () => {
    const existing = notesByDate[selectedDate];
    setNoteText(existing?.content || '');
    setShowNoteModal(true);
  };

  const handleSaveNote = async () => {
    if (!userId) return;
    try {
      await saveNote(userId, selectedDate, noteText);
      setShowNoteModal(false);
    } catch {
      Alert.alert(t('common.error'));
    }
  };

  const handleDeleteNote = async () => {
    if (!userId) return;
    try {
      await saveNote(userId, selectedDate, '');
      setShowNoteModal(false);
    } catch {
      Alert.alert(t('common.error'));
    }
  };

  // Coworker entries: persons excluding the demo "Me"
  const coworkerEntries = useMemo(() => {
    return persons
      .filter((p) => p.id !== 'g-person-1') // exclude the demo "Me" person
      .map((p) => ({ name: p.name, color: p.color, personId: p.id }));
  }, [persons]);

  // Toggle all coworkers on/off
  const allCoworkersVisible = useMemo(() => {
    return coworkerEntries.length > 0 && coworkerEntries.every((c) => visiblePersonIds.has(c.personId));
  }, [coworkerEntries, visiblePersonIds]);

  const toggleAllCoworkers = () => {
    setVisiblePersonIds((prev) => {
      const next = new Set(prev);
      if (allCoworkersVisible) {
        coworkerEntries.forEach((c) => next.delete(c.personId));
      } else {
        coworkerEntries.forEach((c) => next.add(c.personId));
      }
      return next;
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
          {t('calendar.title')}
        </Text>
        <View style={styles.headerActions}>
          {/* Toggle shift codes on calendar */}
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => {
              const val = !showShiftCodes;
              setShowShiftCodes(val);
              AsyncStorage.setItem(SHOW_CODES_KEY, String(val));
              toast(val ? t('calendar.toastCodesOn') : t('calendar.toastCodesOff'));
            }}
          >
            <Text style={{
              fontSize: 14,
              fontWeight: '800',
              color: showShiftCodes ? theme.colors.primary : theme.colors.textMuted,
            }}>
              {shiftCodes.find((sc) => !sc.is_day_off)?.code || 'A'}
            </Text>
          </TouchableOpacity>
          {/* Toggle unify day-off symbol */}
          {unifyDayOffSymbol !== '' && (
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => {
                const val = !unifyDayOff;
                setUnifyDayOff(val);
                AsyncStorage.setItem(UNIFY_DAYOFF_KEY, String(val));
                toast(
                  val
                    ? t('calendar.toastUnifyOn', { symbol: unifyDayOffSymbol })
                    : t('calendar.toastUnifyOff'),
                );
              }}
            >
              <Text style={{
                fontSize: 14,
                fontWeight: '800',
                color: unifyDayOff ? theme.colors.primary : theme.colors.textMuted,
              }}>
                {unifyDayOffSymbol}
              </Text>
            </TouchableOpacity>
          )}
          {/* Toggle coworker shifts visibility */}
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => {
              const val = !showCoworkerShifts;
              setShowCoworkerShifts(val);
              AsyncStorage.setItem(SHOW_COWORKERS_KEY, String(val));
              toast(val ? t('calendar.toastCoworkersOn') : t('calendar.toastCoworkersOff'));
            }}
          >
            <Ionicons
              name={showCoworkerShifts ? 'people' : 'people-outline'}
              size={20}
              color={showCoworkerShifts ? theme.colors.primary : theme.colors.textMuted}
            />
          </TouchableOpacity>
          {/* Cycle group view scope */}
          {groups.length > 0 && (
            <TouchableOpacity
              style={styles.headerIconButton}
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
        </View>
      </View>

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
        {/* Calendar */}
        <Card style={styles.calendarCard} padding="small">
          <Calendar
            key={`cal-${filteredShifts.length}-${[...visiblePersonIds].sort().join(',')}-${showShiftCodes}-${showCoworkerShifts}-${locale}`}
            current={selectedDate}
            onDayPress={handleDayPress}
            onMonthChange={handleMonthChange}
            markedDates={markedDates}
            dayComponent={(props: any) => (
              <CalendarDayWithBars
                date={props.date}
                state={props.state}
                marking={props.marking}
                onPress={() => props.date && handleDayPress(props.date)}
                showLabels={showShiftCodes}
              />
            )}
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              textSectionTitleColor: theme.colors.textSecondary,
              monthTextColor: theme.colors.textPrimary,
              arrowColor: theme.colors.primary,
              textMonthFontWeight: '600',
              textDayHeaderFontWeight: '500',
              textMonthFontSize: 17,
              textDayHeaderFontSize: 13,
            }}
          />
        </Card>

        {/* Selected Date Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString(locale, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>

          {/* My shifts — always visible */}
          {myDateShifts.length > 0 ? (
            myDateShifts.map((shift) => {
              const codeInfo = getCodeInfo(shift.code);
              const isReference = shift.source === 'reference_scan';
              return (
                <Card
                  key={shift.id}
                  style={[
                    styles.shiftCard,
                    isReference && styles.referenceShiftCard,
                    !isReference && {
                      shadowColor: shift.color,
                      shadowOpacity: 0.25,
                      shadowRadius: 6,
                      shadowOffset: { width: 0, height: 2 },
                    },
                  ]}
                >
                  <View style={[styles.shiftCardContent, isReference && { opacity: 0.75 }]}>
                    <View
                      style={[styles.colorIndicator, { backgroundColor: shift.color }]}
                    />
                    <View style={styles.shiftInfo}>
                      <Text style={[styles.shiftCode, { color: theme.colors.textPrimary }]}>
                        {shift.isDayOff
                          ? (unifyDayOff && unifyDayOffSymbol
                              ? unifyDayOffSymbol
                              : (codeInfo?.meaning || t('common.dayOff')))
                          : codeInfo?.meaning || t('home.shift', { code: shift.code })}
                      </Text>
                      {!shift.isDayOff && shift.startTime && (
                        <Text style={[styles.shiftTime, { color: theme.colors.textSecondary }]}>
                          {shift.startTime}
                          {shift.endTime && ` - ${shift.endTime}`}
                        </Text>
                      )}
                      {isShiftOverridden(shift) && (
                        <View style={styles.overriddenBadge}>
                          <Ionicons name="pencil" size={11} color="#D97706" />
                          <Text style={styles.overriddenText}>
                            {t('calendar.customTime')}
                          </Text>
                        </View>
                      )}
                      {isReference && (
                        <Text style={[styles.referenceLabel, { color: theme.colors.textMuted }]}>
                          {t('calendar.referenceShift')}
                        </Text>
                      )}
                    </View>
                    {/* Note button: lives inside the shift pill so it
                        does not eat a whole row when no note is set yet.
                        Filled icon when a note exists, outline + plus
                        when not. Same modal as the standalone button. */}
                    <TouchableOpacity
                      style={styles.moreButton}
                      onPress={openNoteModal}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons
                        name={notesByDate[selectedDate] ? 'document-text' : 'add'}
                        size={notesByDate[selectedDate] ? 18 : 20}
                        color={
                          notesByDate[selectedDate]
                            ? '#EA580C'
                            : theme.colors.textMuted
                        }
                      />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.moreButton} onPress={() => handleEditShift(shift)}>
                      <Ionicons
                        name="ellipsis-horizontal"
                        size={20}
                        color={theme.colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })
          ) : (
            <Card style={styles.emptyCard}>
              <Ionicons
                name="sunny-outline"
                size={40}
                color={theme.colors.textMuted}
              />
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                {t('calendar.noShiftsOnDay')}
              </Text>
              {/* When the user is in a group, has the coworker view on,
                  but the entire month has no group shifts at all, point
                  them at the actual cause instead of an empty page. */}
              {showCoworkerShifts &&
                groups.length > 0 &&
                monthShifts.filter((s) => s.user_id !== userId).length === 0 && (
                  <Text
                    style={[
                      styles.emptyText,
                      { color: theme.colors.textMuted, fontSize: 13, marginTop: 4 },
                    ]}
                  >
                    {t('calendar.emptyGroupShifts')}
                  </Text>
                )}
            </Card>
          )}

          {/* Daily note: existing note still gets the orange card so its
              content is visible. The empty "+ Add note" pill only shows
              when there are no shifts on this day, otherwise the pill
              eats a whole row — when shifts exist, the note icon lives
              inside the shift pill next to "..." instead. */}
          {notesByDate[selectedDate] ? (
            <TouchableOpacity
              style={[styles.noteCard, { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' }]}
              onPress={openNoteModal}
              activeOpacity={0.7}
            >
              <View style={styles.noteIndicator} />
              <Ionicons name="document-text-outline" size={16} color="#EA580C" />
              <Text
                style={[styles.noteText, { color: theme.colors.textPrimary }]}
                numberOfLines={2}
              >
                {notesByDate[selectedDate].content}
              </Text>
              <Ionicons name="pencil-outline" size={14} color="#F97316" />
            </TouchableOpacity>
          ) : myDateShifts.length === 0 ? (
            <TouchableOpacity
              style={[styles.addNoteButton, { borderColor: theme.colors.border }]}
              onPress={openNoteModal}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={16} color={theme.colors.textMuted} />
              <Text style={[styles.addNoteText, { color: theme.colors.textMuted }]}>
                {t('calendar.addNote')}
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Coworker shifts — expandable */}
          {coworkerDateShifts.length > 0 && (
            <>
              <TouchableOpacity
                style={[styles.coworkerExpandButton, { borderColor: theme.colors.border }]}
                onPress={() => setShowCoworkerShifts(!showCoworkerShifts)}
              >
                <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={[styles.coworkerExpandText, { color: theme.colors.textSecondary }]}>
                  {t('calendar.coworkers')} ({coworkerDateShifts.length})
                </Text>
                <Ionicons
                  name={showCoworkerShifts ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>

              {showCoworkerShifts && coworkerDateShifts.map((shift) => {
                const codeInfo = getCodeInfo(shift.code);
                const isReference = shift.source === 'reference_scan';
                return (
                  <Card
                    key={shift.id}
                    style={[
                      styles.shiftCard,
                      isReference && styles.referenceShiftCard,
                      !isReference && {
                        shadowColor: shift.color,
                        shadowOpacity: 0.15,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 1 },
                      },
                    ]}
                  >
                    <View style={[styles.shiftCardContent, isReference && { opacity: 0.75 }]}>
                      <View
                        style={[styles.colorIndicator, { backgroundColor: shift.color }]}
                      />
                      <View style={styles.shiftInfo}>
                        <Text style={[styles.shiftCode, { color: theme.colors.textPrimary }]}>
                          {shift.isDayOff
                            ? (unifyDayOff && unifyDayOffSymbol
                                ? unifyDayOffSymbol
                                : (codeInfo?.meaning || t('common.dayOff')))
                            : codeInfo?.meaning || t('home.shift', { code: shift.code })}
                        </Text>
                        {shift.personName && (
                          <Text style={[styles.personName, { color: theme.colors.textSecondary }]}>
                            {shift.personName}
                          </Text>
                        )}
                        {!shift.isDayOff && shift.startTime && (
                          <Text style={[styles.shiftTime, { color: theme.colors.textSecondary }]}>
                            {shift.startTime}
                            {shift.endTime && ` - ${shift.endTime}`}
                          </Text>
                        )}
                        {isReference && (
                          <Text style={[styles.referenceLabel, { color: theme.colors.textMuted }]}>
                            {t('calendar.referenceShift')}
                          </Text>
                        )}
                      </View>
                      {/* No "..." for coworker shifts: shifts_update RLS
                          only allows the shift's owner (or a group
                          admin) to update, and tapping it produced a
                          generic "更新班次失敗" before. View-only is the
                          right model here — coworker shifts come from
                          their own scans. */}
                    </View>
                  </Card>
                );
              })}
            </>
          )}
        </View>

        {/* Legend */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
            {t('calendar.people')}
          </Text>
          <Card>
            {/* My Schedule — with shift type color legend */}
            <View style={styles.legendItem}>
              <View style={styles.shiftTypeDotsRow}>
                <View style={[styles.shiftTypeDot, { backgroundColor: ShiftTypeColors.morning }]} />
                <View style={[styles.shiftTypeDot, { backgroundColor: ShiftTypeColors.afternoon }]} />
                <View style={[styles.shiftTypeDot, { backgroundColor: ShiftTypeColors.night }]} />
                <View style={[styles.shiftTypeDot, { backgroundColor: ShiftTypeColors.dayOff }]} />
              </View>
              <Text style={[styles.legendText, { color: theme.colors.textPrimary, flex: 1 }]}>
                {t('calendar.mySchedule')}
              </Text>
              <Switch
                value={visiblePersonIds.has('self')}
                onValueChange={() => togglePersonVisibility('self')}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
                thumbColor={visiblePersonIds.has('self') ? theme.colors.primary : '#f4f3f4'}
              />
            </View>
            {/* Shift type color key */}
            <View style={styles.shiftTypeLegend}>
              {([
                ['morning', ShiftTypeColors.morning, t('review.morning')],
                ['afternoon', ShiftTypeColors.afternoon, t('review.afternoon')],
                ['night', ShiftTypeColors.night, t('review.night')],
                ['dayOff', ShiftTypeColors.dayOff, t('common.dayOff')],
              ] as const).map(([key, color, label]) => (
                <View key={key} style={styles.shiftTypeItem}>
                  <View style={[styles.shiftTypeBar, { backgroundColor: color }]} />
                  <Text style={[styles.shiftTypeLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Coworkers section */}
            {coworkerEntries.length > 0 && (
              <>
                <View style={[styles.coworkerSectionHeader, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}>
                  <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
                  <Text style={[styles.coworkerSectionTitle, { color: theme.colors.textSecondary, flex: 1 }]}>
                    {t('calendar.coworkers')}
                  </Text>
                  <Switch
                    value={allCoworkersVisible}
                    onValueChange={toggleAllCoworkers}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
                    thumbColor={allCoworkersVisible ? theme.colors.primary : '#f4f3f4'}
                  />
                </View>
                {coworkerEntries.map((person) => (
                  <View key={person.personId} style={[styles.legendItem, { paddingLeft: 12 }]}>
                    <TouchableOpacity
                      style={[styles.legendColor, { backgroundColor: person.color }]}
                      onPress={() => {
                        setColorEditTarget({ personId: person.personId, personName: person.name });
                        setShowColorPicker(true);
                      }}
                    />
                    <Text style={[styles.legendText, { color: theme.colors.textPrimary, flex: 1 }]}>
                      {person.name}
                    </Text>
                    <Switch
                      value={visiblePersonIds.has(person.personId)}
                      onValueChange={() => togglePersonVisibility(person.personId)}
                      trackColor={{ false: theme.colors.border, true: person.color + '80' }}
                      thumbColor={visiblePersonIds.has(person.personId) ? person.color : '#f4f3f4'}
                    />
                  </View>
                ))}
              </>
            )}
          </Card>
        </View>

        <GuestUpgradeBanner message={t('calendar.guestBanner')} />
      </ScrollView>

      {/* Shift Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.colorPickerOverlay}
          activeOpacity={1}
          onPress={() => { setShowEditModal(false); setEditingShift(null); }}
        >
          <View
            style={[styles.editModalContent, { backgroundColor: theme.colors.cardBackground }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.colorPickerTitle, { color: theme.colors.textPrimary }]}>
              {t('calendar.editShiftThisDay')}
              {editingShift ? ` — ${editingShift.code}` : ''}
            </Text>
            {editingShift && (() => {
              const codeInfo = getCodeInfo(editingShift.code);
              const defaultStart = codeInfo?.start_time || '';
              const defaultEnd = codeInfo?.end_time || '';
              const hasDefault = defaultStart || defaultEnd;
              const isOverridden = editingShift ? isShiftOverridden(editingShift) : false;
              return (
                <>
                  {hasDefault && (
                    <Text style={[styles.defaultTimesHint, { color: theme.colors.textMuted }]}>
                      {t('calendar.defaultTimes', { start: defaultStart || '--:--', end: defaultEnd || '--:--' })}
                    </Text>
                  )}
                  <TimePickerInput
                    label={t('shifts.startTime')}
                    placeholder={t('shifts.startTimePlaceholder')}
                    value={editStartTime}
                    onChange={setEditStartTime}
                  />
                  <TimePickerInput
                    label={t('shifts.endTime')}
                    placeholder={t('shifts.endTimePlaceholder')}
                    value={editEndTime}
                    onChange={setEditEndTime}
                  />
                  {isOverridden && hasDefault && (
                    <TouchableOpacity
                      style={[styles.resetDefaultButton, { borderColor: '#D97706' }]}
                      onPress={() => {
                        setEditStartTime(defaultStart);
                        setEditEndTime(defaultEnd);
                      }}
                    >
                      <Ionicons name="refresh" size={14} color="#D97706" />
                      <Text style={styles.resetDefaultText}>
                        {t('calendar.resetToDefault')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
            <View style={styles.editModalActions}>
              <TouchableOpacity
                style={[styles.editModalButton, { borderColor: theme.colors.border }]}
                onPress={() => { setShowEditModal(false); setEditingShift(null); }}
              >
                <Text style={[styles.editModalButtonText, { color: theme.colors.textSecondary }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.editModalButton,
                  {
                    borderColor: theme.colors.primary,
                    backgroundColor: theme.colors.primary,
                    opacity: savingEdit ? 0.6 : 1,
                  },
                ]}
                onPress={handleSaveShiftEdit}
                disabled={savingEdit}
              >
                <Text style={[styles.editModalButtonText, { color: theme.colors.white }]}>
                  {savingEdit ? t('settings.sharing') : t('common.save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Note Edit Modal */}
      <Modal visible={showNoteModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.colorPickerOverlay}
          activeOpacity={1}
          onPress={() => setShowNoteModal(false)}
        >
          <View
            style={[styles.editModalContent, { backgroundColor: theme.colors.cardBackground }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.colorPickerTitle, { color: theme.colors.textPrimary }]}>
              {t('calendar.editNote')}
            </Text>
            <TextInput
              style={[styles.noteInput, { color: theme.colors.textPrimary, borderColor: theme.colors.border, backgroundColor: theme.colors.warmWhite }]}
              value={noteText}
              onChangeText={setNoteText}
              placeholder={t('calendar.noteHint')}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              autoFocus
            />
            <View style={styles.editModalActions}>
              {notesByDate[selectedDate] && (
                <TouchableOpacity
                  style={[styles.editModalButton, { borderColor: '#EF4444' }]}
                  onPress={handleDeleteNote}
                >
                  <Text style={[styles.editModalButtonText, { color: '#EF4444' }]}>
                    {t('calendar.deleteNote')}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.editModalButton, { borderColor: theme.colors.border }]}
                onPress={() => setShowNoteModal(false)}
              >
                <Text style={[styles.editModalButtonText, { color: theme.colors.textSecondary }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editModalButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary }]}
                onPress={handleSaveNote}
              >
                <Text style={[styles.editModalButtonText, { color: theme.colors.white }]}>
                  {t('common.save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Color Picker Modal */}
      <Modal visible={showColorPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.colorPickerOverlay}
          activeOpacity={1}
          onPress={() => { setShowColorPicker(false); setColorEditTarget(null); }}
        >
          <View style={[styles.colorPickerContent, { backgroundColor: theme.colors.cardBackground }]}>
            <Text style={[styles.colorPickerTitle, { color: theme.colors.textPrimary }]}>
              {colorEditTarget
                ? `${t('calendar.chooseColor')} — ${colorEditTarget.personName}`
                : t('calendar.chooseColor')}
            </Text>
            <View style={styles.colorGrid}>
              {PERSON_COLOR_HEX.map((color) => {
                const currentColor = colorEditTarget
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 0,
  },
  calendarCard: {
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  shiftCard: {
    marginBottom: 8,
  },
  referenceShiftCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CCC',
  },
  shiftCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 12,
  },
  shiftInfo: {
    flex: 1,
  },
  shiftCode: {
    fontSize: 16,
    fontWeight: '600',
  },
  personName: {
    fontSize: 13,
    marginTop: 2,
  },
  shiftTime: {
    fontSize: 13,
    marginTop: 2,
  },
  referenceLabel: {
    fontSize: 11,
    marginTop: 2,
    fontStyle: 'italic',
  },
  moreButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 8,
  },
  coworkerExpandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 10,
    borderStyle: 'dashed',
  },
  coworkerExpandText: {
    fontSize: 13,
    fontWeight: '500',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  shiftTypeDotsRow: {
    flexDirection: 'row',
    gap: 3,
    marginRight: 12,
    alignItems: 'center',
  },
  shiftTypeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  shiftTypeLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingLeft: 4,
    paddingBottom: 6,
  },
  shiftTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shiftTypeBar: {
    width: 16,
    height: 4,
    borderRadius: 2,
  },
  shiftTypeLabel: {
    fontSize: 11,
  },
  coworkerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 6,
  },
  coworkerSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  legendColor: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 12,
  },
  legendText: {
    fontSize: 15,
  },
  colorPickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  colorPickerContent: {
    width: 280,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  colorPickerTitle: {
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
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 8,
  },
  noteIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    backgroundColor: '#F97316',
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  addNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 10,
    borderStyle: 'dashed',
  },
  addNoteText: {
    fontSize: 13,
    fontWeight: '500',
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  editModalContent: {
    width: 300,
    borderRadius: 16,
    padding: 24,
  },
  defaultTimesHint: {
    fontSize: 13,
    marginBottom: 12,
    marginTop: -12,
  },
  resetDefaultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  resetDefaultText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D97706',
  },
  overriddenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  overriddenText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#D97706',
  },
  editModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  editModalButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  editModalButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
