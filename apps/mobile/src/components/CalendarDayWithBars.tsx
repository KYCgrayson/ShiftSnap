import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

interface BarInfo {
  key: string;
  color: string;
  label?: string;
}

interface DayMarking {
  bars?: BarInfo[];
  selected?: boolean;
}

interface CalendarDayWithBarsProps {
  date?: { dateString: string; day: number; month: number; year: number };
  state?: 'disabled' | 'today' | '';
  marking?: DayMarking;
  onPress?: (date: any) => void;
  showLabels?: boolean;
}

export function CalendarDayWithBars({ date, state, marking, onPress, showLabels }: CalendarDayWithBarsProps) {
  const theme = useTheme();
  if (!date) return null;

  const isToday = state === 'today';
  const isDisabled = state === 'disabled';
  const isSelected = marking?.selected;
  const bars = marking?.bars || [];

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isSelected && { backgroundColor: theme.colors.primary + '18', borderRadius: 8 },
      ]}
      onPress={() => onPress?.(date)}
      disabled={isDisabled}
      activeOpacity={0.6}
    >
      <Text
        style={[
          styles.dayText,
          { color: theme.colors.textPrimary },
          isToday && { color: theme.colors.primary, fontWeight: '800' },
          isDisabled && { color: theme.colors.textMuted },
          isSelected && { color: theme.colors.primary, fontWeight: '700' },
        ]}
      >
        {date.day}
      </Text>
      {showLabels && bars.length > 0 ? (
        <View style={styles.labelsContainer}>
          {bars.slice(0, 2).map((bar) => (
            <Text key={bar.key} style={[styles.labelText, { color: bar.color }]} numberOfLines={1}>
              {bar.label || '·'}
            </Text>
          ))}
        </View>
      ) : (
        <View style={styles.barsContainer}>
          {bars.slice(0, 3).map((bar) => (
            <View
              key={bar.key}
              style={[styles.bar, { backgroundColor: bar.color }]}
            />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 44,
    height: 52,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
  },
  dayText: {
    fontSize: 15,
    fontWeight: '500',
  },
  barsContainer: {
    marginTop: 3,
    width: 36,
    gap: 2,
  },
  bar: {
    height: 3,
    borderRadius: 1.5,
    width: '100%',
  },
  labelsContainer: {
    marginTop: 1,
    alignItems: 'center',
  },
  labelText: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
});
