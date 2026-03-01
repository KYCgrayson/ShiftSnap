import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/theme';
import { Card, Button, Input, TimePickerInput } from '../src/components/ui';
import { useAuthStore } from '../src/stores/authStore';
import { useShiftCodeStore } from '../src/stores/shiftCodeStore';
import { useShiftStore } from '../src/stores/shiftStore';
import { useScheduleStore } from '../src/stores/scheduleStore';
import { useCalendarStore } from '../src/stores/calendarStore';
import { usePersonStore } from '../src/stores/personStore';
import { COMMON_SHIFT_CODES, PERSON_COLOR_HEX } from '@shiftsnap/shared';
import type { OCRResult, OCRShift } from '@shiftsnap/shared';
const MY_COLOR_KEY = 'shiftsnap_my_schedule_color';

const STEPS = [1, 2, 3, 4] as const;

export default function ReviewScheduleScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    ocrResult: string;
    scheduleId: string;
    yearMonth: string;
    imageUrl: string;
  }>();
  const { user } = useAuthStore();
  const { shiftCodes, fetchShiftCodes, saveShiftCode } = useShiftCodeStore();
  const { createShiftsFromOCR } = useShiftStore();
  const { updateScheduleStatus, updateScheduleYearMonth } = useScheduleStore();
  const { isConnected, syncShift } = useCalendarStore();
  const { persons, createPerson, fetchPersons } = usePersonStore();

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Data state
  const [ocrData, setOcrData] = useState<OCRResult | null>(null);
  const [editMonth, setEditMonth] = useState<number | null>(null);
  const [editYear, setEditYear] = useState<number | null>(null);

  // Step 1: Selected person
  const [selectedPersonIndex, setSelectedPersonIndex] = useState<number | null>(null);

  // Step 2 & 3: Code confirmation
  const [sessionConfirmedCodes, setSessionConfirmedCodes] = useState<Set<string>>(new Set());
  const [sessionIgnoredCodes, setSessionIgnoredCodes] = useState<Set<string>>(new Set());
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [defMeaning, setDefMeaning] = useState('');
  const [defStartTime, setDefStartTime] = useState('');
  const [defEndTime, setDefEndTime] = useState('');
  const [defIsDayOff, setDefIsDayOff] = useState(false);

  // Cell editing modal (Step 2)
  const [editingCell, setEditingCell] = useState<{ date: number; code: string } | null>(null);
  const [editCode, setEditCode] = useState('');

  // Step 3: Coworker selection
  const [selectedCoworkers, setSelectedCoworkers] = useState<Map<number, boolean>>(new Map());
  const [coworkerColors, setCoworkerColors] = useState<Map<number, string>>(new Map());
  const [selfColor, setSelfColor] = useState('#4F6BFF');
  const [showColorPickerForRow, setShowColorPickerForRow] = useState<number | null>(null);

  // Step 4: Saving
  const [saving, setSaving] = useState(false);

  const scheduleId = params.scheduleId;

  // Compute yearMonth from edited values
  const yearMonth = useMemo(() => {
    if (editYear && editMonth) {
      return `${editYear}-${String(editMonth).padStart(2, '0')}`;
    }
    return params.yearMonth;
  }, [editYear, editMonth, params.yearMonth]);

  // Parse OCR result
  useEffect(() => {
    if (params.ocrResult) {
      try {
        const data: OCRResult = JSON.parse(params.ocrResult);
        setOcrData(data);
        // Prefer params.yearMonth (reflects prior user edits) over OCR-detected values
        if (params.yearMonth) {
          const [y, m] = params.yearMonth.split('-').map(Number);
          if (y && m) {
            setEditYear(y);
            setEditMonth(m);
          } else {
            setEditMonth(data.detected_month);
            setEditYear(data.detected_year);
          }
        } else {
          setEditMonth(data.detected_month);
          setEditYear(data.detected_year);
        }
      } catch {
        Alert.alert(t('common.error'), t('review.parseError'));
        router.back();
      }
    }
  }, [params.ocrResult]);

  // Load shift codes
  useEffect(() => {
    if (user?.id) {
      fetchShiftCodes(user.id);
    }
  }, [user?.id]);

  // Load saved self color
  useEffect(() => {
    AsyncStorage.getItem(MY_COLOR_KEY).then((color) => {
      if (color) setSelfColor(color);
    });
  }, []);

  // Initialize coworker selections when OCR data and selected person are set
  useEffect(() => {
    if (!ocrData || selectedPersonIndex === null) return;
    const newSelected = new Map<number, boolean>();
    const newColors = new Map<number, string>();
    let colorIdx = 0;
    ocrData.rows.forEach((_, idx) => {
      if (idx === selectedPersonIndex) return;
      newSelected.set(idx, true);
      newColors.set(idx, PERSON_COLOR_HEX[colorIdx % PERSON_COLOR_HEX.length]);
      colorIdx++;
    });
    setSelectedCoworkers(newSelected);
    setCoworkerColors(newColors);
  }, [ocrData, selectedPersonIndex]);

  // Collect all person names from OCR rows
  const personNames = useMemo(() => {
    if (!ocrData) return new Set<string>();
    const names = new Set<string>();
    ocrData.rows.forEach((row) => {
      if (row.name) names.add(row.name);
    });
    return names;
  }, [ocrData]);

  // Determine if a code is likely a person name, date number, or weekday (not a shift code)
  const isAutoIgnorable = useCallback((code: string): boolean => {
    if (personNames.has(code)) return true;
    const num = parseInt(code, 10);
    if (!isNaN(num) && num >= 1 && num <= 31 && String(num) === code) return true;
    const weekdays = new Set(['日','一','二','三','四','五','六','Mon','Tue','Wed','Thu','Fri','Sat','Sun']);
    if (weekdays.has(code)) return true;
    return false;
  }, [personNames]);

  // Auto-ignore person names, dates, and weekday tokens when entering Step 2
  useEffect(() => {
    if (!ocrData || selectedPersonIndex === null) return;
    const autoIgnored = new Set<string>();
    ocrData.rows.forEach((row) => {
      row.shifts.forEach((s) => {
        if (isAutoIgnorable(s.code)) autoIgnored.add(s.code);
      });
    });
    setSessionIgnoredCodes(autoIgnored);
  }, [ocrData, selectedPersonIndex, isAutoIgnorable]);

  // Is this the user's first time? (no confirmed codes in DB at all)
  const isFirstTime = useMemo(() => {
    return shiftCodes.filter((sc) => sc.is_confirmed).length === 0;
  }, [shiftCodes]);

  // Whether a code needs confirmation
  const codeNeedsConfirmation = useCallback(
    (code: string): boolean => {
      if (sessionConfirmedCodes.has(code)) return false;
      if (isFirstTime) return true;
      const existing = shiftCodes.find((sc) => sc.code === code);
      return !existing || !existing.is_confirmed;
    },
    [sessionConfirmedCodes, isFirstTime, shiftCodes]
  );

  // Get code status for display
  const getCodeStatus = useCallback(
    (code: string): 'confirmed' | 'suggested' | 'unknown' => {
      if (sessionConfirmedCodes.has(code)) return 'confirmed';
      const existing = shiftCodes.find((sc) => sc.code === code);
      if (existing?.is_confirmed) return 'confirmed';
      const common = COMMON_SHIFT_CODES.find((c) => c.code === code);
      if (common || existing) return 'suggested';
      return 'unknown';
    },
    [sessionConfirmedCodes, shiftCodes]
  );

  const getConfidenceColor = useCallback(
    (confidence: number) => {
      if (confidence >= 0.9) return theme.colors.success;
      if (confidence >= 0.7) return theme.colors.warning;
      return theme.colors.error;
    },
    [theme]
  );

  // Selected person's row
  const selectedRow = useMemo(() => {
    if (ocrData && selectedPersonIndex !== null) {
      return ocrData.rows[selectedPersonIndex] ?? null;
    }
    return null;
  }, [ocrData, selectedPersonIndex]);

  // Unique codes from selected person's row (Step 2)
  const myUniqueCodes = useMemo(() => {
    if (!selectedRow) return [];
    const codes = new Set<string>();
    selectedRow.shifts.forEach((s) => codes.add(s.code));
    return Array.from(codes);
  }, [selectedRow]);

  // Codes needing confirmation in Step 2
  const myCodesNeedingConfirmation = useMemo(() => {
    return myUniqueCodes.filter((code) => codeNeedsConfirmation(code));
  }, [myUniqueCodes, codeNeedsConfirmation]);

  // All codes from OTHER people's rows that weren't in my row (Step 3)
  const otherUniqueCodes = useMemo(() => {
    if (!ocrData || selectedPersonIndex === null) return [];
    const myCodes = new Set(myUniqueCodes);
    const otherCodes = new Set<string>();
    ocrData.rows.forEach((row, idx) => {
      if (idx === selectedPersonIndex) return;
      row.shifts.forEach((s) => {
        if (!myCodes.has(s.code)) otherCodes.add(s.code);
      });
    });
    return Array.from(otherCodes);
  }, [ocrData, selectedPersonIndex, myUniqueCodes]);

  // Other codes needing confirmation (Step 3)
  const otherCodesNeedingConfirmation = useMemo(() => {
    return otherUniqueCodes.filter((code) => codeNeedsConfirmation(code));
  }, [otherUniqueCodes, codeNeedsConfirmation]);

  // --- Step 1: Person selection ---
  const handleSelectPerson = (idx: number) => {
    setSelectedPersonIndex(idx);
    setStep(2);
  };

  // --- Step 2: Cell editing ---
  const handleCellPress = (day: number, currentCode: string) => {
    setEditingCell({ date: day, code: currentCode });
    setEditCode(currentCode);
  };

  const handleCellSave = () => {
    if (!editingCell || !ocrData || selectedPersonIndex === null) return;
    const newCode = editCode.trim();
    if (!newCode) {
      setEditingCell(null);
      return;
    }

    const newRows = [...ocrData.rows];
    const row = { ...newRows[selectedPersonIndex] };
    const shifts = [...row.shifts];
    const idx = shifts.findIndex((s) => s.date === editingCell.date);
    if (idx >= 0) {
      shifts[idx] = { ...shifts[idx], code: newCode, confidence: 1.0 };
    } else {
      shifts.push({ date: editingCell.date, code: newCode, confidence: 1.0 });
    }
    row.shifts = shifts;
    newRows[selectedPersonIndex] = row;
    setOcrData({ ...ocrData, rows: newRows });
    setEditingCell(null);
  };

  const handleDeleteCell = () => {
    if (!editingCell || !ocrData || selectedPersonIndex === null) return;
    const newRows = [...ocrData.rows];
    const row = { ...newRows[selectedPersonIndex] };
    row.shifts = row.shifts.filter((s) => s.date !== editingCell.date);
    newRows[selectedPersonIndex] = row;
    setOcrData({ ...ocrData, rows: newRows });
    setEditingCell(null);
  };

  // --- Code confirmation (shared by Step 2 & 3) ---
  const handleExpandCode = (code: string) => {
    if (expandedCode === code) {
      setExpandedCode(null);
      return;
    }
    setExpandedCode(code);
    // Pre-fill from existing DB entry, or from COMMON_SHIFT_CODES
    const existing = shiftCodes.find((sc) => sc.code === code);
    if (existing) {
      setDefMeaning(existing.meaning);
      setDefStartTime(existing.start_time || '');
      setDefEndTime(existing.end_time || '');
      setDefIsDayOff(existing.is_day_off);
    } else {
      const common = COMMON_SHIFT_CODES.find((c) => c.code === code);
      if (common) {
        setDefMeaning(common.meaning);
        setDefStartTime(common.start_time || '');
        setDefEndTime(common.end_time || '');
        setDefIsDayOff(common.is_day_off);
      } else {
        setDefMeaning('');
        setDefStartTime('');
        setDefEndTime('');
        setDefIsDayOff(false);
      }
    }
  };

  const handleConfirmCode = async (code: string) => {
    if (!user) return;
    if (!defMeaning.trim()) {
      Alert.alert(t('common.error'), t('shifts.meaningRequired'));
      return;
    }

    await saveShiftCode(
      user.id,
      code,
      defMeaning.trim(),
      defIsDayOff ? null : defStartTime || null,
      defIsDayOff ? null : defEndTime || null,
      defIsDayOff
    );

    setSessionConfirmedCodes((prev) => new Set(prev).add(code));
    setExpandedCode(null);
  };

  // --- Step navigation ---
  const hasCoworkers = ocrData ? ocrData.rows.length > 1 : false;

  const goToStep3 = () => {
    const allOtherHandledForSkip = otherUniqueCodes.every(
      (code) => !codeNeedsConfirmation(code) || sessionIgnoredCodes.has(code)
    );
    if (otherUniqueCodes.length === 0 || allOtherHandledForSkip) {
      // No other codes to confirm — skip to Step 4
      setStep(4);
    } else {
      setStep(3);
    }
  };

  // --- Step 4: Confirm & Save ---
  const handleConfirmAndSave = async () => {
    if (!user || !ocrData || !scheduleId || !yearMonth || selectedPersonIndex === null) return;

    setSaving(true);
    try {
      // Save self color
      await AsyncStorage.setItem(MY_COLOR_KEY, selfColor);

      // Build personMap: create Person records for selected coworkers
      const personMap = new Map<number, string>();
      for (const [rowIndex, isSelected] of selectedCoworkers.entries()) {
        if (!isSelected) continue;
        const row = ocrData.rows[rowIndex];
        const coworkerName = row?.name || `Person ${rowIndex + 1}`;
        const color = coworkerColors.get(rowIndex) || PERSON_COLOR_HEX[0];

        // Check if a person with this name already exists
        const existingPerson = persons.find((p) => p.name === coworkerName);
        if (existingPerson) {
          personMap.set(rowIndex, existingPerson.id);
        } else {
          const personId = await createPerson(user.id, coworkerName, undefined, color);
          personMap.set(rowIndex, personId);
        }
      }

      const allCodes = useShiftCodeStore.getState().shiftCodes;
      const codeMap = [
        ...allCodes.map((sc) => ({
          code: sc.code,
          start_time: sc.start_time,
          end_time: sc.end_time,
          is_day_off: sc.is_day_off,
        })),
        ...COMMON_SHIFT_CODES.filter(
          (c) => !allCodes.find((sc) => sc.code === c.code)
        ).map((c) => ({
          code: c.code,
          start_time: c.start_time,
          end_time: c.end_time ?? null,
          is_day_off: c.is_day_off,
        })),
      ];

      await createShiftsFromOCR(scheduleId, user.id, ocrData, codeMap, yearMonth, selectedPersonIndex, personMap);
      // Persist the (possibly user-edited) year-month back to the schedule
      if (yearMonth !== params.yearMonth) {
        await updateScheduleYearMonth(scheduleId, yearMonth);
      }
      await updateScheduleStatus(scheduleId, 'published');

      // Refresh persons so calendar legend picks up new coworkers
      await fetchPersons(user.id);

      // Auto-sync to calendar if connected (only self_scan shifts)
      if (isConnected) {
        try {
          const newShifts = useShiftStore.getState().monthShifts;
          const allShiftCodes = useShiftCodeStore.getState().shiftCodes;
          const { updateShiftCalendarSync } = useShiftStore.getState();
          for (const shift of newShifts.filter((s) => s.source === 'self_scan')) {
            const codeInfo = allShiftCodes.find((sc) => sc.code === shift.shift_code);
            const info = codeInfo
              ? {
                  meaning: codeInfo.meaning,
                  start_time: codeInfo.start_time,
                  end_time: codeInfo.end_time,
                }
              : undefined;
            const eventId = await syncShift(shift, info);
            if (eventId && shift.id) {
              await updateShiftCalendarSync(shift.id, eventId);
            }
          }
        } catch {
          // Calendar sync failure is non-critical
        }
      }

      Alert.alert(t('review.scheduleSaved'), t('review.scheduleSavedDesc'), [
        { text: t('review.viewCalendar'), onPress: () => router.replace('/(tabs)/calendar') },
        { text: t('review.goHome'), onPress: () => router.replace('/(tabs)/home') },
      ]);
    } catch (err) {
      console.error('Save failed:', err);
      const detail = err instanceof Error ? err.message : String(err);
      Alert.alert(t('common.error'), `${t('review.saveFailed')}\n\n${detail}`);
    } finally {
      setSaving(false);
    }
  };

  // --- Summary computations for Step 4 ---
  const selectedCoworkerCount = useMemo(() => {
    let count = 0;
    for (const [, isSelected] of selectedCoworkers) {
      if (isSelected) count++;
    }
    return count;
  }, [selectedCoworkers]);

  const summary = useMemo(() => {
    if (!selectedRow || !ocrData) {
      return { personName: '', shiftCount: 0, codesConfirmed: 0, coworkerCount: 0 };
    }
    return {
      personName: selectedRow.name || '',
      shiftCount: selectedRow.shifts.length,
      codesConfirmed: sessionConfirmedCodes.size + shiftCodes.filter((sc) => sc.is_confirmed).length,
      coworkerCount: selectedCoworkerCount,
    };
  }, [selectedRow, ocrData, sessionConfirmedCodes, shiftCodes, selectedCoworkerCount]);

  // --- Loading state ---
  if (!ocrData || !yearMonth) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
        <Text style={{ color: theme.colors.textMuted, textAlign: 'center', marginTop: 100 }}>
          Loading...
        </Text>
      </SafeAreaView>
    );
  }

  const [year, month] = yearMonth.split('-').map(Number);
  const monthName = new Date(year, month - 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month, 0).getDate();

  // =====================================================
  // Code confirmation list — used by Step 2 and Step 3
  // =====================================================
  const renderCodeList = (codes: string[]) => {
    return codes.map((code) => {
      const status = getCodeStatus(code);
      const needsConfirm = codeNeedsConfirmation(code);
      const isExpanded = expandedCode === code;
      const isIgnored = sessionIgnoredCodes.has(code);

      // Determine status color and icon
      let statusColor = theme.colors.success;
      let statusIcon: 'checkmark-circle' | 'alert-circle' | 'help-circle' | 'remove-circle' = 'checkmark-circle';
      let statusLabel = t('review.confirmed');
      if (isIgnored) {
        statusColor = theme.colors.textMuted;
        statusIcon = 'remove-circle';
        statusLabel = t('review.ignored');
      } else if (needsConfirm) {
        if (status === 'suggested') {
          statusColor = theme.colors.warning;
          statusIcon = 'alert-circle';
          statusLabel = t('review.needsConfirm');
        } else {
          statusColor = theme.colors.error;
          statusIcon = 'help-circle';
          statusLabel = t('review.needsDefinition');
        }
      }

      // Get current meaning for display
      const existing = shiftCodes.find((sc) => sc.code === code);
      const common = COMMON_SHIFT_CODES.find((c) => c.code === code);
      const displayMeaning = existing?.meaning || common?.meaning || '';

      return (
        <View key={code} style={isIgnored ? { opacity: 0.5 } : undefined}>
          <TouchableOpacity
            style={[
              styles.codeRow,
              {
                backgroundColor: isIgnored
                  ? theme.colors.textMuted + '08'
                  : needsConfirm
                    ? (status === 'unknown' ? theme.colors.error + '08' : theme.colors.warning + '08')
                    : theme.colors.success + '08',
                borderColor: isIgnored
                  ? theme.colors.textMuted + '30'
                  : needsConfirm ? statusColor + '30' : theme.colors.success + '30',
              },
            ]}
            onPress={() => {
              if (isIgnored) {
                setSessionIgnoredCodes((prev) => { const n = new Set(prev); n.delete(code); return n; });
              } else {
                handleExpandCode(code);
              }
            }}
          >
            <View style={[styles.codeBadge, { backgroundColor: statusColor + '18' }]}>
              <Text style={[styles.codeBadgeText, { color: statusColor }]}>{code}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.codeMeaning, { color: isIgnored ? theme.colors.textMuted : theme.colors.textPrimary }]}>
                {isIgnored ? t('review.tapToRestore') : (displayMeaning || '—')}
              </Text>
              <Text style={[styles.codeStatus, { color: statusColor }]}>{statusLabel}</Text>
            </View>
            <Ionicons name={statusIcon} size={20} color={statusColor} />
            {!isIgnored && needsConfirm && (
              <TouchableOpacity
                onPress={() => setSessionIgnoredCodes((prev) => new Set(prev).add(code))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginLeft: 4 }}
              >
                <Ionicons name="close-circle-outline" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
            {!isIgnored && (
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={theme.colors.textMuted}
                style={{ marginLeft: 4 }}
              />
            )}
          </TouchableOpacity>

          {/* Expanded definition area */}
          {isExpanded && !isIgnored && (
            <View style={[styles.codeExpandedArea, { backgroundColor: theme.colors.cardBackground, borderColor: theme.colors.border }]}>
              <Input
                label={t('shifts.meaning')}
                placeholder={t('shifts.meaningPlaceholder')}
                value={defMeaning}
                onChangeText={setDefMeaning}
              />

              <TouchableOpacity
                style={styles.dayOffToggle}
                onPress={() => setDefIsDayOff(!defIsDayOff)}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: defIsDayOff ? theme.colors.primary : 'transparent',
                    },
                  ]}
                >
                  {defIsDayOff && <Ionicons name="checkmark" size={14} color={theme.colors.white} />}
                </View>
                <Text style={[styles.dayOffText, { color: theme.colors.textPrimary }]}>
                  {t('shifts.thisIsDayOff')}
                </Text>
              </TouchableOpacity>

              {!defIsDayOff && (
                <>
                  <TimePickerInput
                    label={t('shifts.startTime')}
                    placeholder={t('shifts.startTimePlaceholder')}
                    value={defStartTime}
                    onChange={setDefStartTime}
                  />
                  <TimePickerInput
                    label={t('shifts.endTime')}
                    placeholder={t('shifts.endTimePlaceholder')}
                    value={defEndTime}
                    onChange={setDefEndTime}
                  />
                </>
              )}

              {/* Quick fill chips */}
              <View style={styles.quickFillSection}>
                <Text style={[styles.quickFillLabel, { color: theme.colors.textSecondary }]}>
                  {t('review.quickFill')}
                </Text>
                <View style={styles.quickFillRow}>
                  {[
                    { label: t('review.dayOff'), meaning: 'Day off', isDayOff: true, time: '', endTime: '' },
                    { label: t('review.morning'), meaning: 'Morning shift', isDayOff: false, time: '06:00', endTime: '14:00' },
                    { label: t('review.afternoon'), meaning: 'Afternoon shift', isDayOff: false, time: '14:00', endTime: '22:00' },
                    { label: t('review.night'), meaning: 'Night shift', isDayOff: false, time: '22:00', endTime: '06:00' },
                  ].map((preset) => (
                    <TouchableOpacity
                      key={preset.label}
                      style={[styles.quickFillChip, { borderColor: theme.colors.border }]}
                      onPress={() => {
                        setDefMeaning(preset.meaning);
                        setDefIsDayOff(preset.isDayOff);
                        setDefStartTime(preset.time);
                        setDefEndTime(preset.endTime);
                      }}
                    >
                      <Text style={[styles.quickFillChipText, { color: theme.colors.primary }]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Button
                title={needsConfirm ? t('review.confirm') : t('review.update')}
                onPress={() => handleConfirmCode(code)}
                fullWidth
                style={{ marginTop: 4 }}
              />
            </View>
          )}
        </View>
      );
    });
  };

  // =====================================================
  // STEP 1: Select Person — "Who are you?"
  // =====================================================
  const renderStep1 = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.stepContentHeader}>
        <Text style={[styles.stepTitle, { color: theme.colors.textPrimary }]}>
          {t('review.selectTitle')}
        </Text>
        <Text style={[styles.stepHint, { color: theme.colors.textSecondary }]}>
          {t('review.selectHint')}
        </Text>
      </View>

      <FlatList
        data={ocrData.rows}
        keyExtractor={(_, idx) => String(idx)}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item: row, index: idx }) => (
          <Card
            onPress={() => handleSelectPerson(idx)}
            style={styles.personCard}
          >
            <View style={styles.personCardInner}>
              <View style={[styles.personAvatar, { backgroundColor: theme.colors.primary + '20' }]}>
                <Text style={[styles.personAvatarText, { color: theme.colors.primary }]}>
                  {(row.name || '?')[0]}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.personCardName, { color: theme.colors.textPrimary }]}>
                  {row.name || '?'}
                </Text>
                <Text style={[styles.personShiftCount, { color: theme.colors.textSecondary }]}>
                  {t('review.shiftsCount', { count: row.shifts.length })}
                </Text>
              </View>
              <View style={[styles.selectMeChip, { backgroundColor: theme.colors.primary + '10', borderColor: theme.colors.primary + '30' }]}>
                <Text style={[styles.selectMeText, { color: theme.colors.primary }]}>
                  {t('review.iAmThis')}
                </Text>
                <Ionicons name="arrow-forward" size={14} color={theme.colors.primary} />
              </View>
            </View>
          </Card>
        )}
      />
    </View>
  );

  // =====================================================
  // STEP 2: My Schedule + Code Confirmation
  // =====================================================
  const renderStep2 = () => {
    if (!selectedRow) return null;

    const shiftMap = new Map<number, OCRShift>();
    selectedRow.shifts.forEach((s) => shiftMap.set(s.date, s));

    const allMyCodesHandled = myUniqueCodes.every(
      (code) => !codeNeedsConfirmation(code) || sessionIgnoredCodes.has(code)
    );

    return (
      <View style={{ flex: 1 }}>
        {/* Month/Year editable row */}
        <View style={[styles.monthYearRow, { backgroundColor: theme.colors.cardBackground, borderColor: theme.colors.border }]}>
          <View style={styles.monthYearField}>
            <Text style={[styles.monthYearLabel, { color: theme.colors.textSecondary }]}>
              {t('review.detectedYear')}
            </Text>
            <TextInput
              style={[styles.monthYearInput, {
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.warmWhite,
              }]}
              value={String(editYear || '')}
              onChangeText={(v) => setEditYear(parseInt(v, 10) || null)}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <View style={styles.monthYearField}>
            <Text style={[styles.monthYearLabel, { color: theme.colors.textSecondary }]}>
              {t('review.detectedMonth')}
            </Text>
            <TextInput
              style={[styles.monthYearInput, {
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.warmWhite,
              }]}
              value={String(editMonth || '')}
              onChangeText={(v) => {
                const num = parseInt(v, 10);
                if (!v) setEditMonth(null);
                else if (num >= 1 && num <= 12) setEditMonth(num);
              }}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
          <Text style={[styles.personNameLabel, { color: theme.colors.primary }]}>
            {selectedRow.name || '?'}
          </Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Date strip — horizontal scroll */}
          <View style={styles.dateStripSection}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
              {t('review.myScheduleTitle')}
            </Text>
            <Text style={[styles.sectionHint, { color: theme.colors.textSecondary }]}>
              {t('review.tapDateToEdit')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const shift = shiftMap.get(day);
                const bgColor = shift
                  ? getConfidenceColor(shift.confidence) + '20'
                  : 'transparent';

                return (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dateCell, {
                      backgroundColor: bgColor,
                      borderColor: shift ? getConfidenceColor(shift.confidence) + '40' : theme.colors.border,
                    }]}
                    onPress={() => handleCellPress(day, shift?.code || '')}
                  >
                    <Text style={[styles.dateCellDay, { color: theme.colors.textSecondary }]}>
                      {day}
                    </Text>
                    <Text style={[styles.dateCellCode, {
                      color: shift ? getConfidenceColor(shift.confidence) : theme.colors.textMuted,
                    }]}>
                      {shift?.code || '·'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Code confirmation list */}
          <View style={styles.codeListSection}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
              {t('review.codeConfirmTitle')}
            </Text>
            {renderCodeList(myUniqueCodes)}
          </View>
        </ScrollView>

        {/* Bottom nav */}
        <View style={[styles.bottomNav, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.warmWhite }]}>
          <Button
            title={t('review.back')}
            onPress={() => setStep(1)}
            variant="ghost"
            style={{ flex: 1 }}
          />
          <Button
            title={t('review.next')}
            onPress={goToStep3}
            disabled={!allMyCodesHandled}
            style={{ flex: 2 }}
          />
        </View>
      </View>
    );
  };

  // =====================================================
  // STEP 3: Other People's Codes
  // =====================================================
  const renderStep3 = () => {
    const allOtherHandled = otherUniqueCodes.every(
      (code) => !codeNeedsConfirmation(code) || sessionIgnoredCodes.has(code)
    );

    return (
      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          <Text style={[styles.stepTitle, { color: theme.colors.textPrimary }]}>
            {t('review.otherCodesTitle')}
          </Text>
          <Text style={[styles.stepHint, { color: theme.colors.textSecondary, marginBottom: 16 }]}>
            {t('review.otherCodesHint')}
          </Text>

          {otherUniqueCodes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={48} color={theme.colors.success} />
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                {t('review.noOtherCodes')}
              </Text>
            </View>
          ) : (
            renderCodeList(otherUniqueCodes)
          )}
        </ScrollView>

        {/* Bottom nav */}
        <View style={[styles.bottomNav, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.warmWhite }]}>
          <Button
            title={t('review.back')}
            onPress={() => setStep(2)}
            variant="ghost"
            style={{ flex: 1 }}
          />
          <Button
            title={t('review.next')}
            onPress={() => setStep(4)}
            disabled={!allOtherHandled}
            style={{ flex: 2 }}
          />
        </View>
      </View>
    );
  };

  // =====================================================
  // STEP 4: Coworker Import + Confirm & Save
  // =====================================================
  const renderStep4 = () => (
    <View style={styles.confirmContainer}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Summary card */}
        <Card style={styles.summaryCard}>
          <Ionicons name="document-text-outline" size={40} color={theme.colors.primary} style={{ alignSelf: 'center', marginBottom: 16 }} />

          <Text style={[styles.summaryTitle, { color: theme.colors.textPrimary }]}>
            {t('review.confirmTitle')}
          </Text>

          {summary.personName ? (
            <View style={[styles.summaryRow, { borderColor: theme.colors.border }]}>
              <Ionicons name="person" size={16} color={theme.colors.primary} />
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>
                {t('review.summaryPerson')}
              </Text>
              <Text style={[styles.summaryValue, { color: theme.colors.textPrimary }]}>
                {summary.personName}
              </Text>
            </View>
          ) : null}

          <View style={[styles.summaryRow, { borderColor: theme.colors.border }]}>
            <Ionicons name="calendar" size={16} color={theme.colors.primary} />
            <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>
              {t('review.summaryMonth')}
            </Text>
            <Text style={[styles.summaryValue, { color: theme.colors.textPrimary }]}>
              {monthName}
            </Text>
          </View>

          <View style={[styles.summaryRow, { borderColor: theme.colors.border }]}>
            <Ionicons name="layers" size={16} color={theme.colors.primary} />
            <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>
              {t('review.summaryShifts', { count: summary.shiftCount })}
            </Text>
          </View>

          <View style={[styles.summaryRow, { borderColor: theme.colors.border, borderBottomWidth: 0 }]}>
            <Ionicons name="checkmark-done" size={16} color={theme.colors.success} />
            <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>
              {t('review.summaryCodesConfirmed', { count: summary.codesConfirmed })}
            </Text>
          </View>
        </Card>

        {/* Coworker import section */}
        {hasCoworkers && (
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
              {t('review.coworkerSelectionTitle')}
            </Text>
            <Text style={[styles.stepHint, { color: theme.colors.textSecondary, marginBottom: 12 }]}>
              {t('review.coworkerSelectionHint')}
            </Text>

            {/* Self row — always imported */}
            <View style={[styles.coworkerRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.success + '08' }]}>
              <TouchableOpacity
                onPress={() => setShowColorPickerForRow(-1)}
                style={[styles.colorCircle, { backgroundColor: selfColor }]}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.coworkerName, { color: theme.colors.textPrimary }]}>
                  {ocrData?.rows[selectedPersonIndex!]?.name || '?'}
                </Text>
                <Text style={[styles.coworkerHint, { color: theme.colors.success }]}>
                  {t('review.yourRow')}
                </Text>
              </View>
              <Text style={[styles.coworkerShiftCount, { color: theme.colors.textSecondary }]}>
                {selectedRow?.shifts.length ?? 0}
              </Text>
            </View>

            {/* Coworker rows */}
            {ocrData?.rows.map((row, idx) => {
              if (idx === selectedPersonIndex) return null;
              const isSelected = selectedCoworkers.get(idx) ?? false;
              const color = coworkerColors.get(idx) || PERSON_COLOR_HEX[0];
              return (
                <View key={idx} style={[styles.coworkerRow, { borderColor: theme.colors.border, opacity: isSelected ? 1 : 0.5 }]}>
                  <TouchableOpacity
                    onPress={() => { if (isSelected) setShowColorPickerForRow(idx); }}
                    style={[styles.colorCircle, { backgroundColor: color }]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.coworkerName, { color: theme.colors.textPrimary }]}>
                      {row.name || `Person ${idx + 1}`}
                    </Text>
                    <Text style={[styles.coworkerHint, { color: theme.colors.textSecondary }]}>
                      {t('review.shiftsCount', { count: row.shifts.length })}
                    </Text>
                  </View>
                  <Switch
                    value={isSelected}
                    onValueChange={(val) => {
                      setSelectedCoworkers((prev) => {
                        const next = new Map(prev);
                        next.set(idx, val);
                        return next;
                      });
                    }}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary + '60' }}
                    thumbColor={isSelected ? theme.colors.primary : theme.colors.textMuted}
                  />
                </View>
              );
            })}

            {selectedCoworkerCount > 0 && (
              <Text style={[styles.coworkerSummary, { color: theme.colors.textSecondary }]}>
                {t('review.summaryCoworkers', { count: selectedCoworkerCount })}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom nav */}
      <View style={[styles.bottomNav, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.warmWhite }]}>
        <Button
          title={t('review.back')}
          onPress={() => {
            if (otherCodesNeedingConfirmation.length > 0 || otherUniqueCodes.length > 0) {
              setStep(3);
            } else {
              setStep(2);
            }
          }}
          variant="ghost"
          style={{ flex: 1 }}
        />
        <Button
          title={saving ? t('review.saving') : t('review.confirmAndSave')}
          onPress={handleConfirmAndSave}
          loading={saving}
          disabled={saving}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );

  // =====================================================
  // Main render
  // =====================================================
  const stepLabels = [t('review.stepPerson'), t('review.stepSchedule'), t('review.stepOther'), t('review.stepSave')];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
          {t('review.title')}
        </Text>
        <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
          {monthName}
        </Text>
      </View>

      {/* Step indicator */}
      <View style={styles.stepIndicator}>
        {STEPS.map((s, i) => (
          <View key={s} style={styles.stepItem}>
            <View
              style={[
                styles.stepCircle,
                {
                  backgroundColor: step >= s ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.stepNumber, { color: step >= s ? theme.colors.white : theme.colors.textMuted }]}>
                {s}
              </Text>
            </View>
            <Text
              style={[
                styles.stepLabel,
                {
                  color: step === s ? theme.colors.primary : theme.colors.textMuted,
                  fontWeight: step === s ? '600' : '400',
                },
              ]}
            >
              {stepLabels[i]}
            </Text>
            {i < STEPS.length - 1 && (
              <View style={[styles.stepLine, { backgroundColor: step > s ? theme.colors.primary : theme.colors.border }]} />
            )}
          </View>
        ))}
      </View>

      {/* Step content */}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}

      {/* Color Picker Modal */}
      <Modal visible={showColorPickerForRow !== null} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowColorPickerForRow(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContent, { backgroundColor: theme.colors.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
              {t('calendar.chooseColor')}
            </Text>
            <View style={styles.colorGrid}>
              {PERSON_COLOR_HEX.map((color) => {
                const isCurrent = showColorPickerForRow === -1
                  ? selfColor === color
                  : coworkerColors.get(showColorPickerForRow!) === color;
                return (
                  <TouchableOpacity
                    key={color}
                    onPress={() => {
                      if (showColorPickerForRow === -1) {
                        setSelfColor(color);
                      } else {
                        setCoworkerColors((prev) => {
                          const next = new Map(prev);
                          next.set(showColorPickerForRow!, color);
                          return next;
                        });
                      }
                      setShowColorPickerForRow(null);
                    }}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      isCurrent && { borderWidth: 3, borderColor: theme.colors.textPrimary },
                    ]}
                  >
                    {isCurrent && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Edit Cell Modal */}
      <Modal visible={!!editingCell} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditingCell(null)}>
            <TouchableOpacity activeOpacity={1} style={[styles.modalContent, { backgroundColor: theme.colors.cardBackground }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
                {t('review.editDay', { day: editingCell?.date })}
              </Text>
              <TextInput
                style={[styles.modalInput, {
                  color: theme.colors.textPrimary,
                  borderColor: theme.colors.primary,
                  backgroundColor: theme.colors.warmWhite,
                }]}
                value={editCode}
                onChangeText={setEditCode}
                autoFocus
                placeholder={t('review.shiftCodePlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={handleCellSave}
              />
              <View style={styles.modalActions}>
                <Button title={t('review.remove')} onPress={handleDeleteCell} variant="ghost" style={{ flex: 1 }} />
                <Button title={t('common.save')} onPress={handleCellSave} style={{ flex: 1 }} />
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  headerSubtitle: {
    fontSize: 13,
  },
  // Step indicator
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 4,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  stepLabel: {
    fontSize: 11,
  },
  stepLine: {
    width: 16,
    height: 2,
    borderRadius: 1,
    marginHorizontal: 2,
  },
  // Step content header
  stepContentHeader: {
    padding: 16,
    paddingBottom: 8,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  stepHint: {
    fontSize: 14,
  },
  // Step 1: Person cards
  personCard: {
    marginBottom: 0,
  },
  personCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  personAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  personAvatarText: {
    fontSize: 20,
    fontWeight: '600',
  },
  personCardName: {
    fontSize: 17,
    fontWeight: '600',
  },
  personShiftCount: {
    fontSize: 13,
    marginTop: 2,
  },
  selectMeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  selectMeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Step 2: Month/Year row
  monthYearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12,
    borderBottomWidth: 1,
  },
  monthYearField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthYearLabel: {
    fontSize: 12,
  },
  monthYearInput: {
    fontSize: 14,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 50,
    textAlign: 'center',
  },
  personNameLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  // Date strip
  dateStripSection: {
    padding: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    marginBottom: 10,
  },
  dateStrip: {
    gap: 6,
    paddingVertical: 4,
  },
  dateCell: {
    width: 44,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  dateCellDay: {
    fontSize: 11,
    fontWeight: '500',
  },
  dateCellCode: {
    fontSize: 14,
    fontWeight: '700',
  },
  // Code list
  codeListSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  codeBadge: {
    minWidth: 40,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  codeBadgeText: {
    fontSize: 14,
    fontWeight: '800',
  },
  codeMeaning: {
    fontSize: 14,
    fontWeight: '500',
  },
  codeStatus: {
    fontSize: 11,
    marginTop: 1,
  },
  codeExpandedArea: {
    marginTop: 2,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  dayOffToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayOffText: {
    fontSize: 14,
  },
  quickFillSection: {
    marginTop: 4,
  },
  quickFillLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  quickFillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickFillChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickFillChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Step 3: Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  // Step 4: Confirm
  confirmContainer: {
    flex: 1,
  },
  summaryCard: {
    padding: 24,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryLabel: {
    fontSize: 14,
    flex: 1,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Bottom nav
  bottomNav: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    width: 280,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  // Step 3: Coworker rows
  coworkerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  coworkerName: {
    fontSize: 15,
    fontWeight: '600',
  },
  coworkerHint: {
    fontSize: 12,
    marginTop: 1,
  },
  coworkerShiftCount: {
    fontSize: 13,
  },
  coworkerSummary: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  // Color picker
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
