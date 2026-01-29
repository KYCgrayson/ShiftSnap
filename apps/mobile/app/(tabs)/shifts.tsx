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
import { supabase } from '../../src/services/supabase';
import { useAuthStore } from '../../src/stores/authStore';
import { COMMON_SHIFT_CODES } from '@shiftsnap/shared';

interface ShiftCode {
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
  const params = useLocalSearchParams();
  const { user } = useAuthStore();

  const [shiftCodes, setShiftCodes] = useState<ShiftCode[]>([]);
  const [pendingCodes, setPendingCodes] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Load shift codes
  useEffect(() => {
    loadShiftCodes();
  }, []);

  // Handle OCR result from scan
  useEffect(() => {
    if (params.ocrResult) {
      try {
        const result = JSON.parse(params.ocrResult as string);
        if (result.unknown_codes && result.unknown_codes.length > 0) {
          setPendingCodes(result.unknown_codes);
        }
      } catch (error) {
        console.error('Error parsing OCR result:', error);
      }
    }
  }, [params.ocrResult]);

  const loadShiftCodes = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('shift_codes')
        .select('*')
        .eq('user_id', user.id)
        .order('code');

      if (error) throw error;

      setShiftCodes(
        data?.map((code) => ({
          id: code.id,
          code: code.code,
          meaning: code.meaning,
          startTime: code.start_time,
          endTime: code.end_time,
          isDayOff: code.is_day_off,
          isConfirmed: code.is_confirmed,
        })) || []
      );
    } catch (error) {
      console.error('Error loading shift codes:', error);
    }
  };

  const saveShiftCode = async (
    code: string,
    meaning: string,
    startTime: string | null,
    endTime: string | null,
    isDayOff: boolean
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase.from('shift_codes').upsert({
        user_id: user.id,
        code,
        meaning,
        start_time: startTime,
        end_time: endTime,
        is_day_off: isDayOff,
        is_confirmed: true,
      });

      if (error) throw error;

      // Remove from pending and refresh
      setPendingCodes((prev) => prev.filter((c) => c !== code));
      loadShiftCodes();
    } catch (error) {
      console.error('Error saving shift code:', error);
      Alert.alert('Error', 'Failed to save shift code');
    }
  };

  const deleteShiftCode = async (id: string) => {
    Alert.alert('Delete Shift Code', 'Are you sure you want to delete this shift code?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('shift_codes').delete().eq('id', id);
            if (error) throw error;
            loadShiftCodes();
          } catch (error) {
            console.error('Error deleting shift code:', error);
            Alert.alert('Error', 'Failed to delete shift code');
          }
        },
      },
    ]);
  };

  const renderShiftCodeItem = ({ item }: { item: ShiftCode }) => (
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
          onPress={() => deleteShiftCode(item.id)}
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
          onPress={() => setShowAddModal(true)}
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
                Please define: {pendingCodes.join(', ')}
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
            {pendingCodes.map((code) => (
              <PendingCodeCard
                key={code}
                code={code}
                theme={theme}
                onSave={saveShiftCode}
                onSkip={() => setPendingCodes((prev) => prev.filter((c) => c !== code))}
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
                  onPress={() =>
                    saveShiftCode(
                      common.code,
                      common.meaning,
                      common.start_time,
                      null,
                      common.is_day_off
                    )
                  }
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
  const [meaning, setMeaning] = useState('');
  const [startTime, setStartTime] = useState('');
  const [isDayOff, setIsDayOff] = useState(false);

  const handleSave = () => {
    if (!meaning.trim()) {
      Alert.alert('Error', 'Please enter a meaning for this code');
      return;
    }
    onSave(code, meaning.trim(), isDayOff ? null : startTime || null, null, isDayOff);
  };

  return (
    <Card style={styles.pendingCard}>
      <View style={styles.pendingHeader}>
        <View style={[styles.pendingCodeBox, { backgroundColor: theme.colors.warning + '20' }]}>
          <Text style={[styles.pendingCodeText, { color: theme.colors.warning }]}>{code}</Text>
        </View>
        <Text style={[styles.pendingQuestion, { color: theme.colors.textPrimary }]}>
          What does "{code}" mean?
        </Text>
      </View>

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
