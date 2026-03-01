import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';

interface TimePickerInputProps {
  label?: string;
  value: string;
  onChange: (time: string) => void;
  placeholder?: string;
}

export function TimePickerInput({ label, value, onChange, placeholder }: TimePickerInputProps) {
  const theme = useTheme();
  const [show, setShow] = useState(false);

  const parseTime = (timeStr: string): Date => {
    const date = new Date();
    if (timeStr) {
      const parts = timeStr.split(':');
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      if (!isNaN(hours)) date.setHours(hours);
      if (!isNaN(minutes)) date.setMinutes(minutes);
    }
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
  };

  const handleChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShow(false);
    }
    if (selectedDate) {
      const hours = String(selectedDate.getHours()).padStart(2, '0');
      const minutes = String(selectedDate.getMinutes()).padStart(2, '0');
      onChange(`${hours}:${minutes}`);
    }
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text
          style={[
            styles.label,
            {
              color: theme.colors.textSecondary,
              fontSize: theme.fonts.sizes.caption,
            },
          ]}
        >
          {label}
        </Text>
      )}

      <TouchableOpacity
        onPress={() => setShow(true)}
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.colors.cardBackground,
            borderColor: theme.colors.border,
            borderRadius: theme.borderRadius.md,
            height: theme.inputs.height,
            borderWidth: theme.inputs.borderWidth,
          },
        ]}
        activeOpacity={0.7}
      >
        <Ionicons
          name="time-outline"
          size={20}
          color={theme.colors.textSecondary}
          style={styles.icon}
        />
        <Text
          style={[
            styles.valueText,
            {
              color: value ? theme.colors.textPrimary : theme.colors.textMuted,
              fontSize: theme.fonts.sizes.body,
            },
          ]}
        >
          {value || placeholder || 'HH:MM'}
        </Text>
      </TouchableOpacity>

      {show && (
        <>
          {Platform.OS === 'ios' ? (
            <View style={[styles.iosPickerContainer, { backgroundColor: theme.colors.cardBackground, borderColor: theme.colors.border }]}>
              <View style={styles.iosPickerHeader}>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={[styles.iosPickerDone, { color: theme.colors.primary }]}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={parseTime(value)}
                mode="time"
                display="spinner"
                onChange={handleChange}
                is24Hour
              />
            </View>
          ) : (
            <DateTimePicker
              value={parseTime(value)}
              mode="time"
              display="default"
              onChange={handleChange}
              is24Hour
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginLeft: 16,
    marginRight: 8,
  },
  valueText: {
    flex: 1,
  },
  iosPickerContainer: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  iosPickerDone: {
    fontSize: 16,
    fontWeight: '600',
  },
});
