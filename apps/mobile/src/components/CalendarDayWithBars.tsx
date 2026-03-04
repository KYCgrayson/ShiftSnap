import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

interface BarInfo {
  key: string;
  color: string;
  label?: string;
  isNote?: boolean;
  isMine?: boolean;
}

interface DayMarking {
  bars?: BarInfo[];
  selected?: boolean;
  hasMyData?: boolean;
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
  const hasNote = bars.some((b) => b.isNote);

  const myBars = bars.filter((b) => !b.isNote && b.isMine);
  const otherBars = bars.filter((b) => !b.isNote && !b.isMine);
  const hasAny = myBars.length > 0 || otherBars.length > 0 || hasNote;

  // My data highlight color: adapts to light/dark
  const myBgColor = theme.isDark ? 'rgba(91,181,194,0.20)' : 'rgba(74,157,173,0.12)';

  const renderBars = (items: BarInfo[], limit: number) => {
    if (showLabels && items.length > 0) {
      return items.slice(0, limit).map((bar) => (
        <Text
          key={bar.key}
          style={[styles.labelText, { color: bar.isMine ? theme.colors.textPrimary : bar.color }]}
          numberOfLines={1}
        >
          {bar.label || '·'}
        </Text>
      ));
    }
    return items.slice(0, limit).map((bar) => (
      <View key={bar.key} style={[styles.bar, { backgroundColor: bar.color }]} />
    ));
  };

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

      {hasAny ? (
        <View style={styles.infoArea}>
          {/* My bars + note: highlighted */}
          {(myBars.length > 0 || hasNote) && (
            <View style={[styles.myBlock, { backgroundColor: myBgColor }]}>
              {renderBars(myBars, 2)}
              {hasNote && <View style={styles.noteDot} />}
            </View>
          )}
          {/* Coworker bars: no highlight */}
          {otherBars.length > 0 && (
            <View style={styles.otherBlock}>
              {renderBars(otherBars, 2)}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.infoArea} />
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
  infoArea: {
    marginTop: 2,
    width: 38,
    gap: 1,
    alignItems: 'center',
  },
  myBlock: {
    width: '100%',
    borderRadius: 3,
    paddingHorizontal: 2,
    paddingVertical: 1,
    gap: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherBlock: {
    width: '100%',
    gap: 2,
    alignItems: 'center',
  },
  bar: {
    height: 3,
    borderRadius: 1.5,
    width: '100%',
  },
  labelText: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  noteDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#F97316',
  },
});
