import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, DateData } from 'react-native-calendars';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/ui';
import { formatYearMonth, getDaysInMonth, getFirstDayOfMonth } from '@shiftsnap/shared';

interface ShiftEvent {
  id: string;
  date: string;
  code: string;
  startTime: string | null;
  endTime: string | null;
  isDayOff: boolean;
  personName?: string;
  color: string;
}

export default function CalendarScreen() {
  const theme = useTheme();
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [currentMonth, setCurrentMonth] = useState<string>(formatYearMonth(new Date()));

  // TODO: Replace with actual data from Supabase
  const shifts: ShiftEvent[] = [];

  // Generate marked dates for calendar
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    // Add shift markers
    shifts.forEach((shift) => {
      if (!marks[shift.date]) {
        marks[shift.date] = {
          dots: [],
        };
      }
      marks[shift.date].dots.push({
        key: shift.id,
        color: shift.color,
      });
    });

    // Add selected date styling
    if (marks[selectedDate]) {
      marks[selectedDate] = {
        ...marks[selectedDate],
        selected: true,
        selectedColor: theme.colors.primary + '20',
        selectedTextColor: theme.colors.primary,
      };
    } else {
      marks[selectedDate] = {
        selected: true,
        selectedColor: theme.colors.primary + '20',
        selectedTextColor: theme.colors.primary,
      };
    }

    return marks;
  }, [shifts, selectedDate, theme]);

  // Get shifts for selected date
  const selectedDateShifts = useMemo(() => {
    return shifts.filter((shift) => shift.date === selectedDate);
  }, [shifts, selectedDate]);

  const handleDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  const handleMonthChange = (month: DateData) => {
    setCurrentMonth(`${month.year}-${String(month.month).padStart(2, '0')}`);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
          Calendar
        </Text>
        <TouchableOpacity style={styles.filterButton}>
          <Ionicons name="filter-outline" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Calendar */}
        <Card style={styles.calendarCard} padding="small">
          <Calendar
            current={selectedDate}
            onDayPress={handleDayPress}
            onMonthChange={handleMonthChange}
            markingType="multi-dot"
            markedDates={markedDates}
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              textSectionTitleColor: theme.colors.textSecondary,
              selectedDayBackgroundColor: theme.colors.primary,
              selectedDayTextColor: theme.colors.white,
              todayTextColor: theme.colors.primary,
              dayTextColor: theme.colors.textPrimary,
              textDisabledColor: theme.colors.textMuted,
              monthTextColor: theme.colors.textPrimary,
              arrowColor: theme.colors.primary,
              textDayFontWeight: '500',
              textMonthFontWeight: '600',
              textDayHeaderFontWeight: '500',
              textDayFontSize: 15,
              textMonthFontSize: 17,
              textDayHeaderFontSize: 13,
            }}
          />
        </Card>

        {/* Selected Date Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>

          {selectedDateShifts.length > 0 ? (
            selectedDateShifts.map((shift) => (
              <Card key={shift.id} style={styles.shiftCard}>
                <View style={styles.shiftCardContent}>
                  <View
                    style={[styles.colorIndicator, { backgroundColor: shift.color }]}
                  />
                  <View style={styles.shiftInfo}>
                    <Text style={[styles.shiftCode, { color: theme.colors.textPrimary }]}>
                      {shift.isDayOff ? 'Day Off' : `Shift ${shift.code}`}
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
                  </View>
                  <TouchableOpacity style={styles.moreButton}>
                    <Ionicons
                      name="ellipsis-horizontal"
                      size={20}
                      color={theme.colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </Card>
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Ionicons
                name="sunny-outline"
                size={40}
                color={theme.colors.textMuted}
              />
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                No shifts on this day
              </Text>
            </Card>
          )}
        </View>

        {/* Legend */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
            People
          </Text>
          <Card>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendColor, { backgroundColor: theme.colors.primary }]}
              />
              <Text style={[styles.legendText, { color: theme.colors.textPrimary }]}>
                My Schedule
              </Text>
            </View>
            {/* TODO: Add more people from personStore */}
          </Card>
        </View>
      </ScrollView>
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
    paddingVertical: 4,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  legendText: {
    fontSize: 15,
  },
});
