import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme';
import { Card, Button, Input } from '../src/components/ui';
import { useAuthStore } from '../src/stores/authStore';
import { useShiftCodeStore } from '../src/stores/shiftCodeStore';
import { useShiftStore } from '../src/stores/shiftStore';
import { useScheduleStore } from '../src/stores/scheduleStore';
import { useCalendarStore } from '../src/stores/calendarStore';
import { COMMON_SHIFT_CODES } from '@shiftsnap/shared';
import type { OCRResult, OCRShift } from '@shiftsnap/shared';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ReviewScheduleScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    ocrResult: string;
    scheduleId: string;
    yearMonth: string;
  }>();
  const { user } = useAuthStore();
  const { shiftCodes, fetchShiftCodes, saveShiftCode } = useShiftCodeStore();
  const { createShiftsFromOCR } = useShiftStore();
  const { updateScheduleStatus } = useScheduleStore();
  const { isConnected, syncShift } = useCalendarStore();

  const [ocrData, setOcrData] = useState<OCRResult | null>(null);
  const [selectedRow, setSelectedRow] = useState(0);
  const [editingCell, setEditingCell] = useState<{ date: number; code: string } | null>(null);
  const [editCode, setEditCode] = useState('');
  const [pendingDefinitions, setPendingDefinitions] = useState<string[]>([]);
  const [definingCode, setDefiningCode] = useState<string | null>(null);
  const [defMeaning, setDefMeaning] = useState('');
  const [defStartTime, setDefStartTime] = useState('');
  const [defIsDayOff, setDefIsDayOff] = useState(false);
  const [saving, setSaving] = useState(false);

  const scheduleId = params.scheduleId;
  const yearMonth = params.yearMonth;

  // Parse OCR result
  useEffect(() => {
    if (params.ocrResult) {
      try {
        const data = JSON.parse(params.ocrResult);
        setOcrData(data);
      } catch {
        Alert.alert('Error', 'Failed to parse OCR results');
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

  // Compute unknown codes whenever ocrData or shiftCodes change
  useEffect(() => {
    if (!ocrData) return;
    const allDetectedCodes = new Set<string>();
    ocrData.rows.forEach((row) => {
      row.shifts.forEach((s) => allDetectedCodes.add(s.code));
    });
    const unknowns = Array.from(allDetectedCodes).filter(
      (code) =>
        !shiftCodes.find((sc) => sc.code === code) &&
        !COMMON_SHIFT_CODES.find((c) => c.code === code)
    );
    setPendingDefinitions(unknowns);
  }, [ocrData, shiftCodes]);

  // Calendar grid
  const calendarGrid = useMemo(() => {
    if (!yearMonth || !ocrData) return [];

    const [year, month] = yearMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const row = ocrData.rows[selectedRow];
    if (!row) return [];

    const shiftMap = new Map<number, OCRShift>();
    row.shifts.forEach((s) => shiftMap.set(s.date, s));

    const weeks: Array<Array<{ day: number; shift: OCRShift | null } | null>> = [];
    let currentWeek: Array<{ day: number; shift: OCRShift | null } | null> = [];

    // Fill leading empty cells
    for (let i = 0; i < firstDay; i++) {
      currentWeek.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push({ day, shift: shiftMap.get(day) || null });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Fill trailing empty cells
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [yearMonth, ocrData, selectedRow]);

  const isCodeKnown = (code: string) => {
    return (
      !!shiftCodes.find((sc) => sc.code === code) ||
      !!COMMON_SHIFT_CODES.find((c) => c.code === code)
    );
  };

  const getCodeColor = (code: string, confidence: number) => {
    if (!isCodeKnown(code)) return theme.colors.warning;
    if (confidence < 0.7) return theme.colors.error;
    return theme.colors.primary;
  };

  const handleCellPress = (day: number, currentCode: string) => {
    setEditingCell({ date: day, code: currentCode });
    setEditCode(currentCode);
  };

  const handleCellSave = () => {
    if (!editingCell || !ocrData) return;
    const newCode = editCode.trim();
    if (!newCode) {
      setEditingCell(null);
      return;
    }

    // Update the OCR data
    const newRows = [...ocrData.rows];
    const row = { ...newRows[selectedRow] };
    const shifts = [...row.shifts];
    const idx = shifts.findIndex((s) => s.date === editingCell.date);
    if (idx >= 0) {
      shifts[idx] = { ...shifts[idx], code: newCode, confidence: 1.0 };
    } else {
      shifts.push({ date: editingCell.date, code: newCode, confidence: 1.0 });
    }
    row.shifts = shifts;
    newRows[selectedRow] = row;
    setOcrData({ ...ocrData, rows: newRows });
    setEditingCell(null);
  };

  const handleDeleteCell = () => {
    if (!editingCell || !ocrData) return;
    const newRows = [...ocrData.rows];
    const row = { ...newRows[selectedRow] };
    row.shifts = row.shifts.filter((s) => s.date !== editingCell.date);
    newRows[selectedRow] = row;
    setOcrData({ ...ocrData, rows: newRows });
    setEditingCell(null);
  };

  const handleDefineCode = (code: string) => {
    setDefiningCode(code);
    setDefMeaning('');
    setDefStartTime('');
    setDefIsDayOff(false);
    // Check if it matches a common code
    const common = COMMON_SHIFT_CODES.find((c) => c.code === code);
    if (common) {
      setDefMeaning(common.meaning);
      setDefStartTime(common.start_time || '');
      setDefIsDayOff(common.is_day_off);
    }
  };

  const handleSaveDefinition = async () => {
    if (!definingCode || !user) return;
    if (!defMeaning.trim()) {
      Alert.alert('Error', 'Please enter a meaning');
      return;
    }
    await saveShiftCode(
      user.id,
      definingCode,
      defMeaning.trim(),
      defIsDayOff ? null : defStartTime || null,
      null,
      defIsDayOff
    );
    setPendingDefinitions((prev) => prev.filter((c) => c !== definingCode));
    setDefiningCode(null);
  };

  const handleConfirmAndSave = async () => {
    if (!user || !ocrData || !scheduleId || !yearMonth) return;

    if (pendingDefinitions.length > 0) {
      Alert.alert(
        'Undefined Codes',
        `Please define these codes first: ${pendingDefinitions.join(', ')}`,
      );
      return;
    }

    setSaving(true);
    try {
      const allCodes = useShiftCodeStore.getState().shiftCodes;
      // Merge common codes for lookup
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
          end_time: null,
          is_day_off: c.is_day_off,
        })),
      ];

      await createShiftsFromOCR(scheduleId, user.id, ocrData, codeMap, yearMonth);
      await updateScheduleStatus(scheduleId, 'published');

      // Auto-sync to calendar if connected
      if (isConnected) {
        try {
          const newShifts = useShiftStore.getState().monthShifts;
          const allShiftCodes = useShiftCodeStore.getState().shiftCodes;
          for (const shift of newShifts) {
            const codeInfo = allShiftCodes.find((sc) => sc.code === shift.shift_code);
            const info = codeInfo ? {
              meaning: codeInfo.meaning,
              start_time: codeInfo.start_time,
              end_time: codeInfo.end_time,
            } : undefined;
            await syncShift(shift, info);
          }
        } catch {
          // Calendar sync failure is non-critical
        }
      }

      Alert.alert('Schedule Saved', 'Your shifts have been saved successfully!', [
        { text: 'View Calendar', onPress: () => router.replace('/(tabs)/calendar') },
        { text: 'Go Home', onPress: () => router.replace('/(tabs)/home') },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save shifts. Please try again.');
    } finally {
      setSaving(false);
    }
  };

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
  const totalShifts = ocrData.rows[selectedRow]?.shifts.length || 0;
  const confidencePercent = Math.round(ocrData.confidence * 100);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
          Review Schedule
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Summary Card */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
              <Text style={[styles.summaryValue, { color: theme.colors.textPrimary }]}>
                {monthName}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Ionicons name="grid-outline" size={20} color={theme.colors.primary} />
              <Text style={[styles.summaryValue, { color: theme.colors.textPrimary }]}>
                {totalShifts} shifts
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Ionicons
                name={confidencePercent >= 80 ? 'checkmark-circle' : 'alert-circle'}
                size={20}
                color={confidencePercent >= 80 ? theme.colors.success : theme.colors.warning}
              />
              <Text style={[styles.summaryValue, { color: theme.colors.textPrimary }]}>
                {confidencePercent}%
              </Text>
            </View>
          </View>
          {ocrData.rows.length > 1 && (
            <Text style={[styles.summaryNote, { color: theme.colors.textSecondary }]}>
              {ocrData.rows.length} people detected
            </Text>
          )}
        </Card>

        {/* Row selector (if multiple people detected) */}
        {ocrData.rows.length > 1 && (
          <View style={styles.rowSelector}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {ocrData.rows.map((row, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.rowTab,
                    {
                      backgroundColor:
                        selectedRow === idx ? theme.colors.primary : theme.colors.cardBackground,
                      borderColor: theme.colors.border,
                    },
                  ]}
                  onPress={() => setSelectedRow(idx)}
                >
                  <Text
                    style={[
                      styles.rowTabText,
                      {
                        color: selectedRow === idx ? theme.colors.white : theme.colors.textPrimary,
                      },
                    ]}
                  >
                    {row.name || 'My Schedule'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Calendar Grid */}
        <Card style={styles.gridCard} padding="small">
          {/* Weekday headers */}
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((day) => (
              <View key={day} style={styles.weekdayCell}>
                <Text style={[styles.weekdayText, { color: theme.colors.textSecondary }]}>
                  {day}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar weeks */}
          {calendarGrid.map((week, weekIdx) => (
            <View key={weekIdx} style={styles.weekRow}>
              {week.map((cell, dayIdx) => {
                if (!cell) {
                  return <View key={dayIdx} style={styles.dayCell} />;
                }

                const { day, shift } = cell;
                const hasShift = !!shift;
                const codeColor = shift ? getCodeColor(shift.code, shift.confidence) : undefined;
                const isLowConfidence = shift && shift.confidence < 0.7;

                return (
                  <TouchableOpacity
                    key={dayIdx}
                    style={[
                      styles.dayCell,
                      hasShift && {
                        backgroundColor: codeColor + '15',
                        borderRadius: 8,
                      },
                    ]}
                    onPress={() => {
                      if (shift) {
                        handleCellPress(day, shift.code);
                      } else {
                        handleCellPress(day, '');
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        { color: hasShift ? theme.colors.textPrimary : theme.colors.textMuted },
                      ]}
                    >
                      {day}
                    </Text>
                    {hasShift && (
                      <Text
                        style={[
                          styles.dayCode,
                          { color: codeColor },
                          isLowConfidence && styles.lowConfidence,
                        ]}
                      >
                        {shift.code}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
              <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>Known</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.warning }]} />
              <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>
                Unknown
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.error }]} />
              <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>
                Low confidence
              </Text>
            </View>
          </View>
        </Card>

        {/* Unknown Codes Section */}
        {pendingDefinitions.length > 0 && (
          <View style={styles.section}>
            <View style={[styles.alertBanner, { backgroundColor: theme.colors.warning + '15' }]}>
              <Ionicons name="alert-circle" size={20} color={theme.colors.warning} />
              <Text style={[styles.alertText, { color: theme.colors.textPrimary }]}>
                {pendingDefinitions.length} unknown code{pendingDefinitions.length > 1 ? 's' : ''} — please define before saving
              </Text>
            </View>

            <View style={styles.unknownCodesGrid}>
              {pendingDefinitions.map((code) => (
                <TouchableOpacity
                  key={code}
                  style={[styles.unknownCodeChip, { borderColor: theme.colors.warning, backgroundColor: theme.colors.warning + '10' }]}
                  onPress={() => handleDefineCode(code)}
                >
                  <Text style={[styles.unknownCodeText, { color: theme.colors.warning }]}>
                    {code}
                  </Text>
                  <Ionicons name="add-circle-outline" size={16} color={theme.colors.warning} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Confirm Button */}
        <Button
          title={saving ? 'Saving...' : 'Confirm & Save'}
          onPress={handleConfirmAndSave}
          loading={saving}
          disabled={saving || pendingDefinitions.length > 0}
          fullWidth
          style={{ marginTop: 8, marginBottom: 32 }}
        />
      </ScrollView>

      {/* Edit Cell Modal */}
      <Modal visible={!!editingCell} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditingCell(null)}>
            <TouchableOpacity activeOpacity={1} style={[styles.modalContent, { backgroundColor: theme.colors.cardBackground }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
                Edit Day {editingCell?.date}
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
                placeholder="Shift code (e.g., A, /, OFF)"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={handleCellSave}
              />
              <View style={styles.modalActions}>
                <Button title="Remove" onPress={handleDeleteCell} variant="ghost" style={{ flex: 1 }} />
                <Button title="Save" onPress={handleCellSave} style={{ flex: 1 }} />
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Define Code Modal */}
      <Modal visible={!!definingCode} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDefiningCode(null)}>
            <TouchableOpacity activeOpacity={1} style={[styles.defineModal, { backgroundColor: theme.colors.cardBackground }]}>
              <View style={styles.defineHeader}>
                <View style={[styles.defineCodeBox, { backgroundColor: theme.colors.warning + '20' }]}>
                  <Text style={[styles.defineCodeText, { color: theme.colors.warning }]}>
                    {definingCode}
                  </Text>
                </View>
                <Text style={[styles.defineTitle, { color: theme.colors.textPrimary }]}>
                  Define "{definingCode}"
                </Text>
              </View>

              <Input
                label="Meaning"
                placeholder="e.g., Morning shift"
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
                  This is a day off
                </Text>
              </TouchableOpacity>

              {!defIsDayOff && (
                <Input
                  label="Start Time (optional)"
                  placeholder="e.g., 09:00"
                  value={defStartTime}
                  onChangeText={setDefStartTime}
                  keyboardType="numbers-and-punctuation"
                />
              )}

              {/* Quick suggestions */}
              <View style={styles.suggestions}>
                {COMMON_SHIFT_CODES.filter((c) => c.code === definingCode).length === 0 && (
                  <Text style={[styles.suggestLabel, { color: theme.colors.textSecondary }]}>
                    Quick fill:
                  </Text>
                )}
                <View style={styles.suggestRow}>
                  {[
                    { label: 'Day Off', meaning: 'Day off', isDayOff: true, time: '' },
                    { label: 'Morning', meaning: 'Morning shift', isDayOff: false, time: '06:00' },
                    { label: 'Day', meaning: 'Day shift', isDayOff: false, time: '09:00' },
                    { label: 'Night', meaning: 'Night shift', isDayOff: false, time: '22:00' },
                  ].map((preset) => (
                    <TouchableOpacity
                      key={preset.label}
                      style={[styles.suggestChip, { borderColor: theme.colors.border }]}
                      onPress={() => {
                        setDefMeaning(preset.meaning);
                        setDefIsDayOff(preset.isDayOff);
                        setDefStartTime(preset.time);
                      }}
                    >
                      <Text style={[styles.suggestChipText, { color: theme.colors.primary }]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.defineActions}>
                <Button title="Cancel" onPress={() => setDefiningCode(null)} variant="ghost" style={{ flex: 1 }} />
                <Button title="Save" onPress={handleSaveDefinition} style={{ flex: 1 }} />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  },
  scrollContent: {
    padding: 16,
    paddingTop: 0,
  },
  summaryCard: {
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryNote: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
  },
  rowSelector: {
    marginBottom: 12,
  },
  rowTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  rowTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  gridCard: {
    marginBottom: 16,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    minHeight: 52,
    justifyContent: 'center',
    margin: 1,
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: '500',
  },
  dayCode: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  lowConfidence: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
  },
  section: {
    marginBottom: 16,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  alertText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  unknownCodesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  unknownCodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 6,
  },
  unknownCodeText: {
    fontSize: 15,
    fontWeight: '700',
  },
  // Edit Cell Modal
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
  // Define Code Modal
  defineModal: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
  },
  defineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  defineCodeBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  defineCodeText: {
    fontSize: 18,
    fontWeight: '700',
  },
  defineTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  dayOffToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
  suggestions: {
    marginBottom: 16,
  },
  suggestLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  suggestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  suggestChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  suggestChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  defineActions: {
    flexDirection: 'row',
    gap: 8,
  },
});
