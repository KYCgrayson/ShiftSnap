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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, DateData } from 'react-native-calendars';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { useShiftStore } from '../../src/stores/shiftStore';
import { useShiftCodeStore } from '../../src/stores/shiftCodeStore';
import { usePersonStore } from '../../src/stores/personStore';
import { useCalendarStore } from '../../src/stores/calendarStore';
import { Card, TimePickerInput } from '../../src/components/ui';
import { GuestUpgradeBanner } from '../../src/components/GuestUpgradeBanner';
import { CalendarDayWithBars } from '../../src/components/CalendarDayWithBars';
import { useRealtimeShifts } from '../../src/hooks/useRealtimeShifts';
import { useLocaleStore } from '../../src/stores/localeStore';
import { formatYearMonth, PERSON_COLOR_HEX, getShiftTypeColor, ShiftTypeColors } from '@shiftsnap/shared';
const SHOW_CODES_KEY = 'shiftsnap_show_shift_codes';

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
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [currentMonth, setCurrentMonth] = useState<string>(formatYearMonth(new Date()));
  const [refreshing, setRefreshing] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorEditTarget, setColorEditTarget] = useState<{ personId: string; personName: string } | null>(null);
  const [visiblePersonIds, setVisiblePersonIds] = useState<Set<string>>(new Set(['self']));
  const [showShiftCodes, setShowShiftCodes] = useState(false);

  // Shift edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftEvent | null>(null);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  const userId = user?.id;

  // Realtime shifts subscription
  useRealtimeShifts(userId, currentMonth);

  // Load saved preferences
  useEffect(() => {
    AsyncStorage.getItem(SHOW_CODES_KEY).then((val) => {
      if (val !== null) setShowShiftCodes(val === 'true');
    });
  }, []);

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
    }
  }, [userId, currentMonth]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMonth(currentMonth);
    setRefreshing(false);
  };

  // Convert DB shifts to ShiftEvent format
  const shifts: ShiftEvent[] = useMemo(() => {
    return monthShifts.map((shift) => {
      const person = shift.person_id ? persons.find((p) => p.id === shift.person_id) : null;
      const isSelf = shift.source === 'self_scan' || !shift.source || shift.source === 'manual';
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
      };
    });
  }, [monthShifts, shiftCodes, theme, persons, getCodeInfo]);

  // Filter by visible person IDs
  const filteredShifts = useMemo(() => {
    return shifts.filter((shift) => {
      const isSelf = shift.source === 'self_scan' || shift.source === 'manual' || !shift.source;
      if (isSelf) {
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
  }, [shifts, visiblePersonIds, persons]);

  // Generate marked dates for calendar (bars format)
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    filteredShifts.forEach((shift) => {
      if (!marks[shift.date]) {
        marks[shift.date] = { bars: [] };
      }
      marks[shift.date].bars.push({
        key: shift.id,
        color: shift.color,
        label: shift.code,
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
  }, [filteredShifts, selectedDate, theme]);

  const selectedDateShifts = useMemo(() => {
    return filteredShifts.filter((shift) => shift.date === selectedDate);
  }, [filteredShifts, selectedDate]);

  const handleDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
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

  // Save shift edit
  const handleSaveShiftEdit = async () => {
    if (!editingShift) return;
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
    } catch {
      Alert.alert(t('common.error'), t('calendar.editFailed'));
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
        <TouchableOpacity style={styles.filterButton}>
          <Ionicons name="filter-outline" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
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
            key={`cal-${filteredShifts.length}-${[...visiblePersonIds].sort().join(',')}-${showShiftCodes}`}
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

          {selectedDateShifts.length > 0 ? (
            selectedDateShifts.map((shift) => {
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
                          ? codeInfo?.meaning || t('common.dayOff')
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
            </Card>
          )}
        </View>

        {/* Legend */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
            {t('calendar.people')}
          </Text>
          <Card>
            {/* Show shift codes toggle */}
            <View style={[styles.legendItem, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, paddingBottom: 10, marginBottom: 4 }]}>
              <Ionicons name="code-outline" size={16} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
              <Text style={[styles.legendText, { color: theme.colors.textPrimary, flex: 1 }]}>
                {t('calendar.showShiftCodes')}
              </Text>
              <Switch
                value={showShiftCodes}
                onValueChange={(val) => {
                  setShowShiftCodes(val);
                  AsyncStorage.setItem(SHOW_CODES_KEY, String(val));
                }}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
                thumbColor={showShiftCodes ? theme.colors.primary : '#f4f3f4'}
              />
            </View>

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
              {t('calendar.editShift')}
              {editingShift ? ` — ${editingShift.code}` : ''}
            </Text>
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
                style={[styles.editModalButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary }]}
                onPress={handleSaveShiftEdit}
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
  filterButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
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
  editModalContent: {
    width: 300,
    borderRadius: 16,
    padding: 24,
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
