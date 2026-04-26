import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';

// Lightweight in-app toast: a short transient message at the bottom of
// the screen. Used to confirm header-button toggles ("已開啟同事顯示")
// and group-scope cycling ("顯示中：weekend MM"). No external lib.

type ShowToast = (message: string, durationMs?: number) => void;

const ToastContext = createContext<ShowToast | null>(null);

export function useToast(): ShowToast {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback no-op so components can call useToast even outside the
    // provider (e.g. in unit tests) without crashing.
    return () => {};
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ShowToast>(
    (text, durationMs = 1600) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setMessage(text);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setMessage(null);
        });
      }, durationMs);
    },
    [opacity],
  );

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message !== null && (
        <Animated.View
          pointerEvents="none"
          style={[styles.container, { opacity, backgroundColor: theme.colors.textPrimary }]}
        >
          <Text style={[styles.text, { color: theme.colors.warmWhite }]}>{message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    maxWidth: '80%',
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
