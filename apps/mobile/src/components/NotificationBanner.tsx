import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../theme';
import { useNotificationStore, type InAppNotification } from '../stores/notificationStore';

const AUTO_DISMISS_MS = 5000;

// Renders the notification queue at the top of the screen. Each banner
// fades + slides in, auto-dismisses after a few seconds, and can be
// tapped to navigate to its target date in the calendar.
export function NotificationBanner() {
  const notifications = useNotificationStore((s) => s.notifications);
  if (notifications.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={styles.host}>
      {notifications.map((n) => (
        <BannerItem key={n.id} item={n} />
      ))}
    </View>
  );
}

function BannerItem({ item }: { item: InAppNotification }) {
  const theme = useTheme();
  const dismiss = useNotificationStore((s) => s.dismiss);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -16, duration: 220, useNativeDriver: true }),
      ]).start(() => dismiss(item.id));
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [item.id]);

  const handlePress = () => {
    if (item.navigateToDate) {
      router.push('/(tabs)/calendar');
    }
    dismiss(item.id);
  };

  // High-contrast palette: invert against the page background so the
  // banner pops in both light and dark mode. In light mode it's near-
  // black on warm white; in dark mode it's bright surface on near-black.
  const bg = theme.isDark ? '#F5F5F5' : '#1F1F1F';
  const fg = theme.isDark ? '#1F1F1F' : '#FFFFFF';
  const accent = theme.colors.primary;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: bg,
          borderColor: bg,
          shadowColor: '#000',
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <TouchableOpacity onPress={handlePress} style={styles.row} activeOpacity={0.8}>
        <View style={[styles.iconBg, { backgroundColor: accent + '33' }]}>
          <Ionicons name="notifications" size={18} color={accent} />
        </View>
        <Text style={[styles.message, { color: fg }]} numberOfLines={2}>
          {item.message}
        </Text>
        <TouchableOpacity
          onPress={() => dismiss(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={18} color={fg} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 56,
    left: 12,
    right: 12,
    gap: 8,
    zIndex: 1000,
  },
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
});
