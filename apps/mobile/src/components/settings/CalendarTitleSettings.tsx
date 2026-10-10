import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme';
import { useCalendarStore, calendarTitleModeKey } from '../../stores/calendarStore';
import { useAuthStore } from '../../stores/authStore';
import type { CalendarTitleMode } from '../../services/calendarSync';

interface CalendarTitleSettingsProps {
  userId: string;
  connected: boolean;
}

const modes: CalendarTitleMode[] = ['shift_first', 'shift_only', 'name_first'];
const translationKey: Record<CalendarTitleMode, string> = {
  shift_first: 'shiftFirst',
  shift_only: 'shiftOnly',
  name_first: 'nameFirst',
};

export function CalendarTitleSettings({ userId, connected }: CalendarTitleSettingsProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [mode, setMode] = useState<CalendarTitleMode>('shift_first');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setMode('shift_first');
    void AsyncStorage.getItem(calendarTitleModeKey(userId))
      .then((stored) => {
        if (!active) return;
        setMode(stored === 'shift_only' || stored === 'name_first' ? stored : 'shift_first');
      })
      .catch(() => {
        if (active) setMode('shift_first');
      });
    return () => { active = false; };
  }, [userId]);

  const selectMode = async (next: CalendarTitleMode) => {
    if (saving || next === mode) return;
    setSaving(true);
    setMode(next);
    try {
      await AsyncStorage.setItem(calendarTitleModeKey(userId), next);
      const offlineReadOnly = useAuthStore.getState().isOfflineReadOnly === true;
      if (connected && !offlineReadOnly) {
        const result = await useCalendarStore.getState().syncUserShifts(userId);
        if (!result || result.failed > 0) {
          Alert.alert(t('common.error'), t('settings.calendarTitle.syncFailed'));
        }
      }
    } catch {
      setMode(mode);
    } finally {
      setSaving(false);
    }
  };

  const modeLabel = (value: CalendarTitleMode) => t(`settings.calendarTitle.${translationKey[value]}`);
  const modeExample = (value: CalendarTitleMode) => t(`settings.calendarTitle.${translationKey[value]}Example`);

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
        {t('settings.calendarTitle.title')}
      </Text>
      <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
        {t('settings.calendarTitle.description')}
      </Text>
      {modes.map((value) => {
        const selected = mode === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: saving }}
            disabled={saving}
            onPress={() => void selectMode(value)}
            style={[
              styles.option,
              { borderColor: selected ? theme.colors.primary : theme.colors.border },
              selected && { backgroundColor: `${theme.colors.primary}12` },
            ]}
          >
            <View style={styles.optionCopy}>
              <Text style={[styles.label, { color: theme.colors.textPrimary }]}>{modeLabel(value)}</Text>
              <Text style={[styles.example, { color: theme.colors.textSecondary }]}>{modeExample(value)}</Text>
            </View>
            <View style={[styles.radio, { borderColor: selected ? theme.colors.primary : theme.colors.border }]}>
              {selected && <View style={[styles.radioDot, { backgroundColor: theme.colors.primary }]} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  heading: { fontSize: 15, fontWeight: '600' },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 2 },
  option: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  optionCopy: { flex: 1, gap: 3 },
  label: { fontSize: 14, fontWeight: '500' },
  example: { fontSize: 13 },
  radio: { width: 20, height: 20, borderWidth: 2, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
