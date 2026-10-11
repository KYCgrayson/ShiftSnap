import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ALARM_OPTIONS } from '@shiftsnap/shared';
import { useTheme } from '../../theme';
import { CALENDAR_COLORS, type CalendarTitleMode } from '../../services/calendarSync';
import { useCalendarStore, formatExportSummary, type CalendarExportDraft, type CalendarSyncFilter } from '../../stores/calendarStore';

const filters: CalendarSyncFilter[] = ['all', 'work_days', 'days_off'];
const modes: CalendarTitleMode[] = ['shift_first', 'shift_only', 'name_first'];
const colorNames = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown', 'teal'];

function exportError(t: (key: string) => string, message: string): string {
  if (message.includes('1–80')) return t('settings.exportInvalidName');
  if (message.includes('online account') || message.includes('Account changed')) return t('settings.exportOnlineRequired');
  if (message.includes('permission')) return t('settings.calendarPermDenied');
  if (message.includes('CALENDAR_ACCOUNT_READONLY')) return t('settings.calendarAccountReadonly');
  if (message.includes('not applied')) return t('settings.exportNativeMismatch');
  if (message.includes('writable') || message.includes('destination changed')) return t('settings.exportDestinationChanged');
  if (message.includes('color')) return t('settings.exportUnsupportedColor');
  return t('settings.exportFailed');
}

export function CalendarExportSettings({ userId }: { userId: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CalendarExportDraft | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const getExportDraft = useCalendarStore((s) => s.getExportDraft);
  const prepareExport = useCalendarStore((s) => s.prepareExport);
  const commitExport = useCalendarStore((s) => s.commitExport);

  useEffect(() => {
    let active = true;
    setDraft(null);
    setLoadError(false);
    void getExportDraft(userId).then((value) => { if (active) setDraft(value); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [userId, getExportDraft]);

  const change = (next: Partial<CalendarExportDraft>) => setDraft((current) => current ? { ...current, ...next } : current);

  const review = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const preview = await prepareExport(userId, draft);
      Alert.alert(t('settings.exportConfirmTitle'), formatExportSummary(preview), [
        { text: t('common.cancel'), style: 'cancel', onPress: () => setBusy(false) },
        { text: t('settings.exportConfirm'), onPress: () => {
          void commitExport(preview).then(async (result) => {
            if (!result) {
              Alert.alert(t('common.error'), exportError(t, useCalendarStore.getState().error || ''));
            } else if (result.failed > 0) {
              Alert.alert(t('common.error'), t('settings.exportPartial', { count: result.failed }));
            } else {
              Alert.alert(t('settings.exportCompleteTitle'), t('settings.exportComplete', { count: preview.selectedCount }));
            }
            if (result) setDraft(await getExportDraft(userId));
          }).finally(() => setBusy(false));
        } },
      ], { cancelable: true, onDismiss: () => setBusy(false) });
    } catch (error) {
      setBusy(false);
      Alert.alert(t('common.error'), exportError(t, error instanceof Error ? error.message : ''));
    }
  };

  if (!draft) return loadError ? <Text style={{ color: theme.colors.textPrimary, padding: 16 }}>{t('settings.exportLoadFailed')}</Text> : null;
  const filterLabels: Record<CalendarSyncFilter, string> = {
    all: t('settings.calendarSyncAll'), work_days: t('settings.calendarSyncWorkDays'), days_off: t('settings.calendarSyncDaysOff'),
  };
  const modeLabels: Record<CalendarTitleMode, string> = {
    shift_first: t('settings.calendarTitle.shiftFirst'), shift_only: t('settings.calendarTitle.shiftOnly'), name_first: t('settings.calendarTitle.nameFirst'),
  };
  return (
    <View style={styles.container}>
      <Text style={{ color: theme.colors.textSecondary, lineHeight: 20 }}>{t('settings.exportHelp')}</Text>
      <Text style={[styles.label, { color: theme.colors.textPrimary }]}>{t('settings.exportCalendarName')}</Text>
      <TextInput
        accessibilityLabel={t('settings.exportCalendarName')}
        value={draft.name}
        onChangeText={(name) => change({ name })}
        maxLength={80}
        style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.textPrimary }]}
      />
      {draft.legacyDestination && <View style={styles.row}>
        <Text style={{ color: theme.colors.textPrimary, flex: 1 }}>{t('settings.exportLegacyOption', { name: draft.legacyDestination.title })}</Text>
        <Switch accessibilityLabel={t('settings.exportLegacyOption', { name: draft.legacyDestination.title })} value={draft.adoptLegacy} onValueChange={(adoptLegacy) => change({ adoptLegacy })} />
      </View>}
      <Text style={[styles.label, { color: theme.colors.textPrimary }]}>{t('settings.exportCalendarColor')}</Text>
      <View style={styles.colors}>
        {CALENDAR_COLORS.map((color, index) => (
          <Pressable
            key={color}
            accessibilityRole="radio"
            accessibilityLabel={t(`settings.exportColorNames.${colorNames[index]}`)}
            accessibilityState={{ checked: draft.color.toLowerCase() === color.toLowerCase(), disabled: Platform.OS === 'android' }}
            disabled={Platform.OS === 'android'}
            onPress={() => change({ color })}
            style={styles.colorTouch}
          ><View style={[styles.color, { backgroundColor: color, borderColor: draft.color.toLowerCase() === color.toLowerCase() ? theme.colors.textPrimary : 'transparent' }]}><Text style={{ color: '#111', fontWeight: '700' }}>{draft.color.toLowerCase() === color.toLowerCase() ? '✓' : ''}</Text></View></Pressable>
        ))}
      </View>
      <Text style={{ color: theme.colors.textSecondary }}>{t('settings.exportSelectedColor', { color: CALENDAR_COLORS.some((color) => color.toLowerCase() === draft.color.toLowerCase()) ? t(`settings.exportColorNames.${colorNames[CALENDAR_COLORS.findIndex((color) => color.toLowerCase() === draft.color.toLowerCase())]}`) : t('settings.exportCustomColor') })}</Text>
      {Platform.OS === 'android' && <Text style={{ color: theme.colors.textSecondary }}>{t('settings.exportAndroidColor')}</Text>}
      <Text style={[styles.label, { color: theme.colors.textPrimary }]}>{t('settings.calendarSyncContent')}</Text>
      <View style={styles.choices}>{filters.map((filter) => <Pressable key={filter} onPress={() => change({ filter })} style={[styles.choice, { borderColor: draft.filter === filter ? theme.colors.primary : theme.colors.border }]}><Text style={{ color: theme.colors.textPrimary }}>{filterLabels[filter]}</Text></Pressable>)}</View>
      <Text style={[styles.label, { color: theme.colors.textPrimary }]}>{t('settings.calendarTitle.title')}</Text>
      <View style={styles.choices}>{modes.map((mode) => <Pressable key={mode} onPress={() => change({ titleMode: mode })} style={[styles.choice, { borderColor: draft.titleMode === mode ? theme.colors.primary : theme.colors.border }]}><Text style={{ color: theme.colors.textPrimary }}>{modeLabels[mode]}</Text></Pressable>)}</View>
      <Text style={{ color: theme.colors.textSecondary }}>{t('settings.exportTitlePreview', { value: t(`settings.calendarTitle.${draft.titleMode === 'shift_only' ? 'shiftOnlyExample' : draft.titleMode === 'name_first' ? 'nameFirstExample' : 'shiftFirstExample'}`) })}</Text>
      <View style={styles.row}><Text style={[styles.label, { color: theme.colors.textPrimary }]}>{t('settings.calendarAlarms')}</Text><Switch value={draft.alarmsEnabled} onValueChange={(alarmsEnabled) => change({ alarmsEnabled })} /></View>
      {draft.alarmsEnabled && <View style={styles.choices}>{ALARM_OPTIONS.map((option) => <Pressable key={option.value} onPress={() => change({ alarmMinutes: option.value })} style={[styles.choice, { borderColor: draft.alarmMinutes === option.value ? theme.colors.primary : theme.colors.border }]}><Text style={{ color: theme.colors.textPrimary }}>{option.label}</Text></Pressable>)}</View>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void review()} style={[styles.button, { backgroundColor: theme.colors.primary, opacity: busy ? 0.5 : 1 }]}><Text style={{ color: theme.colors.white, fontWeight: '600' }}>{t('settings.exportReview')}</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  label: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 16 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorTouch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  color: { width: 32, height: 32, borderRadius: 16, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  button: { alignItems: 'center', padding: 12, borderRadius: 8, marginTop: 6 },
});
