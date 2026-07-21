import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme';
import { Card, Button, Input, TimePickerInput } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useShiftCodeStore } from '../../src/stores/shiftCodeStore';
import { useShiftStore } from '../../src/stores/shiftStore';
import { useScheduleStore } from '../../src/stores/scheduleStore';
import { useCalendarStore } from '../../src/stores/calendarStore';
import { useGroupStore } from '../../src/stores/groupStore';
import { COMMON_SHIFT_CODES } from '@shiftsnap/shared';
import { GuestUpgradeBanner } from '../../src/components/GuestUpgradeBanner';

const UNIFY_DAYOFF_KEY = 'shiftsnap_unify_dayoff';
const UNIFY_DAYOFF_SYMBOL_KEY = 'shiftsnap_unify_dayoff_symbol';
const SHOW_ALL_CODES_KEY = 'shiftsnap_show_all_shift_codes';

function getMonthDateRange(yearMonth: string): { startDate: string; endDate: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${yearMonth}-01`,
    endDate: `${yearMonth}-${String(lastDay).padStart(2, '0')}`,
  };
}

interface LocalShiftCode {
  id: string;
  code: string;
  meaning: string;
  startTime: string | null;
  endTime: string | null;
  isDayOff: boolean;
  isConfirmed: boolean;
  groupId: string | null;
}

const COLLAPSED_GROUPS_KEY = 'shiftsnap_collapsed_code_groups';

export default function ShiftsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    ocrResult?: string;
    scheduleId?: string;
    yearMonth?: string;
  }>();
  const { user } = useAuthStore();
  const {
    shiftCodes: storeShiftCodes,
    recentlyUsedCodes,
    fetchShiftCodes,
    fetchRecentlyUsedCodes,
    saveShiftCode,
    deleteShiftCode,
  } = useShiftCodeStore();
  const { createShiftsFromOCR } = useShiftStore();
  const { updateScheduleStatus } = useScheduleStore();
  const { isConnected, syncUserShifts } = useCalendarStore();
  const viewScope = useGroupStore((s) => s.viewScope);

  const [pendingCodes, setPendingCodes] = useState<string[]>([]);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [yearMonth, setYearMonth] = useState<string | null>(null);

  // Unify day-off symbol
  const [unifyDayOff, setUnifyDayOff] = useState(false);
  const [unifyDayOffSymbol, setUnifyDayOffSymbol] = useState('');

  // Editing existing shift code
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [editMeaning, setEditMeaning] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editIsDayOff, setEditIsDayOff] = useState(false);

  // Map store shift codes to local format
  const shiftCodes: LocalShiftCode[] = storeShiftCodes.map((sc) => ({
    id: sc.id,
    code: sc.code,
    meaning: sc.meaning,
    startTime: sc.start_time,
    endTime: sc.end_time,
    isDayOff: sc.is_day_off,
    isConfirmed: sc.is_confirmed,
    groupId: sc.group_id,
  }));

  const groups = useGroupStore((s) => s.groups);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(COLLAPSED_GROUPS_KEY).then((val) => {
      if (val) {
        try {
          setCollapsedGroups(new Set(JSON.parse(val) as string[]));
        } catch { /* ignore */ }
      }
    });
  }, []);

  const toggleGroupCollapsed = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      AsyncStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  };

  const [showAllCodes, setShowAllCodes] = useState(false);

  // Codes actually used in the last 3 months, plus anything still pending
  // confirmation — a code awaiting definition must stay visible even if
  // it hasn't been "used" yet in the recency sense.
  const visibleShiftCodes = showAllCodes
    ? shiftCodes
    : shiftCodes.filter(
        (sc) => recentlyUsedCodes.has(sc.code) || pendingCodes.includes(sc.code)
      );
  const hiddenCodeCount = shiftCodes.length - visibleShiftCodes.length;

  // Group codes by source: 'private' (no group_id) or specific group id.
  const codeSections = (() => {
    const buckets = new Map<string, LocalShiftCode[]>();
    for (const code of visibleShiftCodes) {
      const key = code.groupId ?? 'private';
      const arr = buckets.get(key) ?? [];
      arr.push(code);
      buckets.set(key, arr);
    }
    const sections: Array<{ key: string; title: string; data: LocalShiftCode[] }> = [];
    if (buckets.has('private')) {
      sections.push({
        key: 'private',
        title: t('shifts.privateCodes'),
        data: buckets.get('private')!,
      });
    }
    for (const g of groups) {
      if (buckets.has(g.id)) {
        sections.push({
          key: g.id,
          title: t('shifts.groupCodes', { name: g.name }),
          data: buckets.get(g.id)!,
        });
      }
    }
    return sections;
  })();

  const dayOffCodes = shiftCodes
    .filter((sc) => sc.isDayOff)
    .map((sc) => sc.code)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));

  // Load shift codes — also refetch when group view scope changes so
  // codes shared into the active scope appear immediately.
  useEffect(() => {
    if (user?.id) {
      fetchShiftCodes(user.id);
      fetchRecentlyUsedCodes(user.id);
    }
  }, [user?.id, viewScope]);

  // Load unify day-off settings
  useEffect(() => {
    AsyncStorage.getItem(UNIFY_DAYOFF_KEY).then((val) => {
      if (val !== null) setUnifyDayOff(val === 'true');
    });
    AsyncStorage.getItem(UNIFY_DAYOFF_SYMBOL_KEY).then((val) => {
      if (val) setUnifyDayOffSymbol(val);
    });
    AsyncStorage.getItem(SHOW_ALL_CODES_KEY).then((val) => {
      if (val !== null) setShowAllCodes(val === 'true');
    });
  }, []);

  // Auto-detect default symbol when dayOffCodes appear and no symbol is set
  useEffect(() => {
    if (!unifyDayOffSymbol && dayOffCodes.length > 0) {
      setUnifyDayOffSymbol(dayOffCodes[0]);
      AsyncStorage.setItem(UNIFY_DAYOFF_SYMBOL_KEY, dayOffCodes[0]);
    }
  }, [dayOffCodes.length]);

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
      Alert.alert(t('common.error'), t('shifts.failedToSave'));
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
        yearMonth,
        0
      );

      await updateScheduleStatus(scheduleId, 'published');

      if (isConnected) {
        try {
          await syncUserShifts(user.id, getMonthDateRange(yearMonth));
        } catch {
          // Calendar sync failure is non-critical
        }
      }

      Alert.alert(
        t('shifts.shiftsSaved'),
        t('shifts.shiftsSavedDesc'),
        [{ text: t('shifts.viewHome'), onPress: () => router.push('/(tabs)/home') }]
      );

      // Clear OCR state
      setOcrResult(null);
      setScheduleId(null);
      setYearMonth(null);
    } catch (error) {
      Alert.alert(t('common.error'), t('shifts.failedToCreate'));
    }
  };

  const handleDeleteShiftCode = (id: string) => {
    Alert.alert(t('shifts.deleteShiftCode'), t('shifts.deleteShiftCodeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteShiftCode(id);
          } catch {
            Alert.alert(t('common.error'), t('shifts.failedToDelete'));
          }
        },
      },
    ]);
  };

  const handleEditCode = (item: LocalShiftCode) => {
    if (editingCodeId === item.id) {
      setEditingCodeId(null);
      return;
    }
    setEditingCodeId(item.id);
    setEditMeaning(item.meaning);
    setEditStartTime(item.startTime || '');
    setEditEndTime(item.endTime || '');
    setEditIsDayOff(item.isDayOff);
  };

  const handleSaveEdit = async (item: LocalShiftCode) => {
    if (!user || !editMeaning.trim()) {
      Alert.alert(t('common.error'), t('shifts.meaningRequired'));
      return;
    }
    const newStartTime = editIsDayOff ? null : editStartTime || null;
    const newEndTime = editIsDayOff ? null : editEndTime || null;
    try {
      await saveShiftCode(
        user.id,
        item.code,
        editMeaning.trim(),
        newStartTime,
        newEndTime,
        editIsDayOff
      );

      // Reconcile device calendar if connected. Shift-code edits cascade to
      // DB shifts, so syncing by user keeps Apple Calendar idempotent.
      if (isConnected) {
        try {
          await syncUserShifts(user.id);
        } catch {
          // Non-critical: calendar sync shouldn't block saving the code.
        }
      }

      setEditingCodeId(null);
    } catch {
      Alert.alert(t('common.error'), t('shifts.failedToSave'));
    }
  };

  const renderShiftCodeItem = ({ item }: { item: LocalShiftCode }) => {
    const isEditing = editingCodeId === item.id;
    return (
      <Card style={styles.codeCard}>
        <TouchableOpacity onPress={() => handleEditCode(item)}>
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
            <Ionicons
              name={isEditing ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.colors.textMuted}
            />
          </View>
        </TouchableOpacity>
        {isEditing && (
          <View style={styles.editArea}>
            <Input
              label={t('shifts.meaning')}
              placeholder={t('shifts.meaningPlaceholder')}
              value={editMeaning}
              onChangeText={setEditMeaning}
            />
            <TouchableOpacity
              style={styles.dayOffToggle}
              onPress={() => setEditIsDayOff(!editIsDayOff)}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: editIsDayOff ? theme.colors.primary : 'transparent',
                  },
                ]}
              >
                {editIsDayOff && <Ionicons name="checkmark" size={14} color={theme.colors.white} />}
              </View>
              <Text style={[styles.dayOffText, { color: theme.colors.textPrimary }]}>
                {t('shifts.thisIsDayOff')}
              </Text>
            </TouchableOpacity>
            {!editIsDayOff && (
              <>
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
              </>
            )}
            <View style={styles.editActions}>
              <Button title={t('common.save')} onPress={() => handleSaveEdit(item)} style={{ flex: 1 }} />
              <Button title={t('common.cancel')} onPress={() => setEditingCodeId(null)} variant="ghost" style={{ flex: 1 }} />
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteShiftCode(item.id)}
              >
                <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Card>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
          {t('shifts.title')}
        </Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => setPendingCodes((prev) => [...prev, ''])}
        >
          <Ionicons name="add" size={24} color={theme.colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <GuestUpgradeBanner message={t('guest.shiftsMessage')} />

        {/* Unify Day-Off Symbol */}
        {dayOffCodes.length > 0 && (
          <Card style={styles.unifyCard}>
            <View style={styles.unifyRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.unifyTitle, { color: theme.colors.textPrimary }]}>
                  {t('settings.unifyDayOff')}
                </Text>
                <Text style={[styles.unifyDesc, { color: theme.colors.textSecondary }]}>
                  {t('settings.unifyDayOffDesc')}
                </Text>
              </View>
              <Switch
                value={unifyDayOff}
                onValueChange={(val) => {
                  setUnifyDayOff(val);
                  AsyncStorage.setItem(UNIFY_DAYOFF_KEY, String(val));
                }}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor={theme.colors.white}
              />
            </View>
            {unifyDayOff && (
              <View style={styles.chipRow}>
                {dayOffCodes.map((code) => {
                  const selected = code === unifyDayOffSymbol;
                  return (
                    <TouchableOpacity
                      key={code}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? theme.colors.primary : theme.colors.warmWhite,
                          borderColor: selected ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                      onPress={() => {
                        setUnifyDayOffSymbol(code);
                        AsyncStorage.setItem(UNIFY_DAYOFF_SYMBOL_KEY, code);
                      }}
                    >
                      <Text style={[styles.chipText, { color: selected ? theme.colors.white : theme.colors.textPrimary }]}>
                        {code}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Card>
        )}

        {/* Pending Codes Alert */}
        {pendingCodes.length > 0 && (
          <Card style={[styles.alertCard, { backgroundColor: theme.colors.warning + '15' }]}>
            <Ionicons name="alert-circle" size={24} color={theme.colors.warning} />
            <View style={styles.alertContent}>
              <Text style={[styles.alertTitle, { color: theme.colors.textPrimary }]}>
                {t('shifts.newCodesDetected')}
              </Text>
              <Text style={[styles.alertText, { color: theme.colors.textSecondary }]}>
                {t('shifts.pleaseDefine', { codes: pendingCodes.filter(Boolean).join(', ') })}
              </Text>
            </View>
          </Card>
        )}

        {/* Pending Codes Section */}
        {pendingCodes.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
              {t('shifts.defineNewCodes')}
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

        {/* Saved Codes Section, grouped by source */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary, flex: 1, marginBottom: 0 }]}>
              {t('shifts.yourShiftCodes')}
            </Text>
            {hiddenCodeCount > 0 && !showAllCodes && (
              <TouchableOpacity
                onPress={() => {
                  setShowAllCodes(true);
                  AsyncStorage.setItem(SHOW_ALL_CODES_KEY, 'true');
                }}
              >
                <Text style={{ color: theme.colors.primary, fontSize: 13 }}>
                  {t('shifts.showAllCodes', { count: hiddenCodeCount })}
                </Text>
              </TouchableOpacity>
            )}
            {showAllCodes && (
              <TouchableOpacity
                onPress={() => {
                  setShowAllCodes(false);
                  AsyncStorage.setItem(SHOW_ALL_CODES_KEY, 'false');
                }}
              >
                <Text style={{ color: theme.colors.primary, fontSize: 13 }}>
                  {t('shifts.showRecentCodes')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted, marginBottom: 8 }]}>
            {showAllCodes ? t('shifts.showingAllCodes') : t('shifts.showingRecentCodes')}
          </Text>
          {visibleShiftCodes.length > 0 ? (
            codeSections.map((section) => {
              const collapsed = collapsedGroups.has(section.key);
              return (
                <View key={section.key} style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    onPress={() => toggleGroupCollapsed(section.key)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 8,
                      paddingHorizontal: 4,
                      gap: 6,
                    }}
                  >
                    <Ionicons
                      name={collapsed ? 'chevron-forward' : 'chevron-down'}
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: theme.colors.textSecondary,
                        flex: 1,
                      }}
                    >
                      {section.title} ({section.data.length})
                    </Text>
                  </TouchableOpacity>
                  {!collapsed &&
                    section.data.map((item) => (
                      <View key={item.id}>{renderShiftCodeItem({ item })}</View>
                    ))}
                </View>
              );
            })
          ) : shiftCodes.length > 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="time-outline" size={48} color={theme.colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
                {t('shifts.noRecentCodes')}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAllCodes(true);
                  AsyncStorage.setItem(SHOW_ALL_CODES_KEY, 'true');
                }}
              >
                <Text style={{ color: theme.colors.primary, fontSize: 14, marginTop: 4 }}>
                  {t('shifts.showAllCodes', { count: shiftCodes.length })}
                </Text>
              </TouchableOpacity>
            </Card>
          ) : (
            <Card style={styles.emptyCard}>
              <Ionicons name="code-outline" size={48} color={theme.colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
                {t('shifts.noShiftCodesYet')}
              </Text>
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                {t('shifts.noShiftCodesDesc')}
              </Text>
            </Card>
          )}
        </View>

        {/* Common Codes Suggestions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
            {t('shifts.commonCodes')}
          </Text>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>
            {t('shifts.tapToAdd')}
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
  const { t } = useTranslation();
  const [codeValue, setCodeValue] = useState(code);
  const [meaning, setMeaning] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isDayOff, setIsDayOff] = useState(false);

  const handleSave = () => {
    const finalCode = codeValue.trim() || code;
    if (!meaning.trim()) {
      Alert.alert(t('common.error'), t('shifts.meaningRequired'));
      return;
    }
    onSave(finalCode, meaning.trim(), isDayOff ? null : startTime || null, isDayOff ? null : endTime || null, isDayOff);
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
          {code ? t('shifts.whatDoesMean', { code }) : t('shifts.addNewShiftCode')}
        </Text>
      </View>

      {!code && (
        <Input
          label={t('shifts.code')}
          placeholder={t('shifts.codePlaceholder')}
          value={codeValue}
          onChangeText={setCodeValue}
        />
      )}

      <Input
        label={t('shifts.meaning')}
        placeholder={t('shifts.meaningPlaceholder')}
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
          {t('shifts.thisIsDayOff')}
        </Text>
      </TouchableOpacity>

      {!isDayOff && (
        <>
          <TimePickerInput
            label={t('shifts.startTime')}
            placeholder={t('shifts.startTimePlaceholder')}
            value={startTime}
            onChange={setStartTime}
          />
          <TimePickerInput
            label={t('shifts.endTime')}
            placeholder={t('shifts.endTimePlaceholder')}
            value={endTime}
            onChange={setEndTime}
          />
        </>
      )}

      <View style={styles.pendingActions}>
        <Button title={t('common.skip')} onPress={onSkip} variant="ghost" style={{ flex: 1 }} />
        <Button title={t('common.save')} onPress={handleSave} style={{ flex: 1 }} />
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
  editArea: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    gap: 8,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  unifyCard: {
    marginBottom: 16,
  },
  unifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unifyTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  unifyDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
