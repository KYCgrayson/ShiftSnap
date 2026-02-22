import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { Card, Button, Input } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useShiftCodeStore } from '../../src/stores/shiftCodeStore';
import { useShiftStore } from '../../src/stores/shiftStore';
import { useScheduleStore } from '../../src/stores/scheduleStore';
import { useCalendarStore } from '../../src/stores/calendarStore';
import { COMMON_SHIFT_CODES } from '@shiftsnap/shared';

interface LocalShiftCode {
  id: string;
  code: string;
  meaning: string;
  startTime: string | null;
  endTime: string | null;
  isDayOff: boolean;
  isConfirmed: boolean;
}

export default function ShiftsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    ocrResult?: string;
    scheduleId?: string;
    yearMonth?: string;
  }>();
  const { user } = useAuthStore();
  const {
    shiftCodes: storeShiftCodes,
    fetchShiftCodes,
    saveShiftCode,
    deleteShiftCode,
  } = useShiftCodeStore();
  const { createShiftsFromOCR } = useShiftStore();
  const { updateScheduleStatus } = useScheduleStore();
  const { isConnected, syncShift } = useCalendarStore();

  const [pendingCodes, setPendingCodes] = useState<string[]>([]);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [yearMonth, setYearMonth] = useState<string | null>(null);

  // Map store shift codes to local format
  const shiftCodes: LocalShiftCode[] = storeShiftCodes.map((sc) => ({
    id: sc.id,
    code: sc.code,
    meaning: sc.meaning,
    startTime: sc.start_time,
    endTime: sc.end_time,
    isDayOff: sc.is_day_off,
    isConfirmed: sc.is_confirmed,
  }));

  // Load shift codes
  useEffect(() => {
    if (user?.id) {
      fetchShiftCodes(user.id);
    }
  }, [user?.id]);

  // Handle OCR result from scan
  useEffect(() => {
    if (params.ocrResult) {
      try {
        const result = JSON.parse(params.ocrResult);
        setOcrResult(result);
        setScheduleId(params.scheduleId || null);
        setYearMonth(params.yearMonth || null);

        if (result.unknown_codes && result.unknown_codes.length > 0) {
          // Filter out codes we already know
          const unknowns = result.unknown_codes.filter(
            (code: string) => !storeShiftCodes.find((sc) => sc.code === code)
          );
          setPendingCodes(unknowns);
        }
      } catch (error) {
        console.error('Error parsing OCR result:', error);
      }
    }
  }, [params.ocrResult]);

  const handleSaveShiftCode = async (
    code: string,
    meaning: string,
    startTime: string | null,
    endTime: string | null,
    isDayOff: boolean
  ) => {
    if (!user) return;

    try {
      await saveShiftCode(user.id, code, meaning, startTime, endTime, isDayOff);
      setPendingCodes((prev) => prev.filter((c) => c !== code));

      // Check if all pending codes are now defined
      const remainingPending = pendingCodes.filter((c) => c !== code);
      if (remainingPending.length === 0 && ocrResult && scheduleId && yearMonth) {
        // All codes defined - create shifts
        await handleCreateShifts();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save shift code');
    }
  };

  const handleCreateShifts = async () => {
    if (!user || !ocrResult || !scheduleId || !yearMonth) return;

    try {
      const allCodes = useShiftCodeStore.getState().shiftCodes;
      await createShiftsFromOCR(
        scheduleId,
        user.id,
        ocrResult,
        allCodes.map((sc) => ({
          code: sc.code,
          start_time: sc.start_time,
          end_time: sc.end_time,
          is_day_off: sc.is_day_off,
        })),
        yearMonth
      );

      await updateScheduleStatus(scheduleId, 'published');

      Alert.alert(
        'Shifts Saved',
        'Your shifts have been saved and your schedule is published!',
        [{ text: 'View Home', onPress: () => router.push('/(tabs)/home') }]
      );

      // Clear OCR state
      setOcrResult(null);
      setScheduleId(null);
      setYearMonth(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to create shifts. Please try again.');
    }
  };

  const handleDeleteShiftCode = (id: string) => {
    Alert.alert('Delete Shift Code', 'Are you sure you want to delete this shift code?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteShiftCode(id);
          } catch {
            Alert.alert('Error', 'Failed to delete shift code');
          }
        },
      },
    ]);
  };

  const renderShiftCodeItem = ({ item }: { item: LocalShiftCode }) => (
    <Card style={styles.codeCard}>
      <View style={styles.codeCardContent}>
        <View
          style={[
            styles.codeBox,
            {
              backgroundColor: item.isDayOff
                ? theme.colors.success + '20'
                : theme.colors.primary + '15',
            },
          ]}
        >
          <Text
            style={[
              styles.codeText,
              { color: item.isDayOff ? theme.colors.success : theme.colors.primary },
            ]}
          >
            {item.code}
          </Text>
        </View>
        <View style={styles.codeInfo}>
          <Text style={[styles.codeMeaning, { color: theme.colors.textPrimary }]}>
            {item.meaning}
          </Text>
          {!item.isDayOff && item.startTime && (
            <Text style={[styles.codeTime, { color: theme.colors.textSecondary }]}>
              {item.startTime}
              {item.endTime && ` - ${item.endTime}`}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteShiftCode(item.id)}
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
        </TouchableOpacity>
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
          Shift Codes
        </Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => setPendingCodes((prev) => [...prev, ''])}
        >
          <Ionicons name="add" size={24} color={theme.colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Pending Codes Alert */}
        {pendingCodes.length > 0 && (
          <Card style={[styles.alertCard, { backgroundColor: theme.colors.warning + '15' }]}>
            <Ionicons name="alert-circle" size={24} color={theme.colors.warning} />
            <View style={styles.alertContent}>
              <Text style={[styles.alertTitle, { color: theme.colors.textPrimary }]}>
                New codes detected
              </Text>
              <Text style={[styles.alertText, { color: theme.colors.textSecondary }]}>
                Please define: {pendingCodes.filter(Boolean).join(', ')}
              </Text>
            </View>
          </Card>
        )}

        {/* Pending Codes Section */}
        {pendingCodes.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
              Define New Codes
            </Text>
            {pendingCodes.map((code, index) => (
              <PendingCodeCard
                key={`${code}-${index}`}
                code={code}
                theme={theme}
                onSave={handleSaveShiftCode}
                onSkip={() => {
                  setPendingCodes((prev) => prev.filter((_, i) => i !== index));
                  // If this was the last pending code and we have OCR data, create shifts
                  const remaining = pendingCodes.filter((_, i) => i !== index);
                  if (remaining.length === 0 && ocrResult && scheduleId && yearMonth) {
                    handleCreateShifts();
                  }
                }}
              />
            ))}
          </View>
        )}

        {/* Saved Codes Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
            Your Shift Codes
          </Text>
          {shiftCodes.length > 0 ? (
            <FlatList
              data={shiftCodes}
              renderItem={renderShiftCodeItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
            />
          ) : (
            <Card style={styles.emptyCard}>
              <Ionicons name="code-outline" size={48} color={theme.colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
                No shift codes yet
              </Text>
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                Scan a schedule or add codes manually
              </Text>
            </Card>
          )}
        </View>

        {/* Common Codes Suggestions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
            Common Codes
          </Text>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>
            Tap to add to your codes
          </Text>
          <View style={styles.commonCodesGrid}>
            {COMMON_SHIFT_CODES.filter(
              (common) => !shiftCodes.find((s) => s.code === common.code)
            )
              .slice(0, 6)
              .map((common) => (
                <TouchableOpacity
                  key={common.code}
                  style={[styles.commonCodeChip, { borderColor: theme.colors.border }]}
                  onPress={() => {
                    if (user) {
                      saveShiftCode(
                        user.id,
                        common.code,
                        common.meaning,
                        common.start_time,
                        null,
                        common.is_day_off
                      );
                    }
                  }}
                >
                  <Text style={[styles.commonCodeText, { color: theme.colors.textPrimary }]}>
                    {common.code}
                  </Text>
                  <Text style={[styles.commonCodeMeaning, { color: theme.colors.textSecondary }]}>
                    {common.meaning}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Pending Code Card Component
function PendingCodeCard({
  code,
  theme,
  onSave,
  onSkip,
}: {
  code: string;
  theme: ReturnType<typeof useTheme>;
  onSave: (code: string, meaning: string, startTime: string | null, endTime: string | null, isDayOff: boolean) => void;
  onSkip: () => void;
}) {
  const [codeValue, setCodeValue] = useState(code);
  const [meaning, setMeaning] = useState('');
  const [startTime, setStartTime] = useState('');
  const [isDayOff, setIsDayOff] = useState(false);

  const handleSave = () => {
    const finalCode = codeValue.trim() || code;
    if (!meaning.trim()) {
      Alert.alert('Error', 'Please enter a meaning for this code');
      return;
    }
    onSave(finalCode, meaning.trim(), isDayOff ? null : startTime || null, null, isDayOff);
  };

  return (
    <Card style={styles.pendingCard}>
      <View style={styles.pendingHeader}>
        <View style={[styles.pendingCodeBox, { backgroundColor: theme.colors.warning + '20' }]}>
          <Text style={[styles.pendingCodeText, { color: theme.colors.warning }]}>
            {code || '?'}
          </Text>
        </View>
        <Text style={[styles.pendingQuestion, { color: theme.colors.textPrimary }]}>
          {code ? `What does "${code}" mean?` : 'Add new shift code'}
        </Text>
      </View>

      {!code && (
        <Input
          label="Code"
          placeholder="e.g., A"
          value={codeValue}
          onChangeText={setCodeValue}
        />
      )}

      <Input
        label="Meaning"
        placeholder="e.g., Morning shift"
        value={meaning}
        onChangeText={setMeaning}
      />

      <TouchableOpacity
        style={styles.dayOffToggle}
        onPress={() => setIsDayOff(!isDayOff)}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: theme.colors.border,
              backgroundColor: isDayOff ? theme.colors.primary : 'transparent',
            },
          ]}
        >
          {isDayOff && <Ionicons name="checkmark" size={14} color={theme.colors.white} />}
        </View>
        <Text style={[styles.dayOffText, { color: theme.colors.textPrimary }]}>
          This is a day off
        </Text>
      </TouchableOpacity>

      {!isDayOff && (
        <Input
          label="Start Time (optional)"
          placeholder="e.g., 09:00"
          value={startTime}
          onChangeText={setStartTime}
          keyboardType="numbers-and-punctuation"
        />
      )}

      <View style={styles.pendingActions}>
        <Button title="Skip" onPress={onSkip} variant="ghost" style={{ flex: 1 }} />
        <Button title="Save" onPress={handleSave} style={{ flex: 1 }} />
      </View>
    </Card>
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 0,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertContent: {
    marginLeft: 12,
    flex: 1,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  alertText: {
    fontSize: 13,
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  codeCard: {
    marginBottom: 8,
  },
  codeCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  codeText: {
    fontSize: 18,
    fontWeight: '700',
  },
  codeInfo: {
    flex: 1,
  },
  codeMeaning: {
    fontSize: 15,
    fontWeight: '500',
  },
  codeTime: {
    fontSize: 13,
    marginTop: 2,
  },
  deleteButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginTop: 4,
    textAlign: 'center',
  },
  commonCodesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  commonCodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  commonCodeText: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 6,
  },
  commonCodeMeaning: {
    fontSize: 12,
  },
  pendingCard: {
    marginBottom: 12,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  pendingCodeBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  pendingCodeText: {
    fontSize: 16,
    fontWeight: '700',
  },
  pendingQuestion: {
    fontSize: 15,
    fontWeight: '500',
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
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
});
