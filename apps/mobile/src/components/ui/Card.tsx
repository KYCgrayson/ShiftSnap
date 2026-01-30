import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { useTheme } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  padding?: 'none' | 'small' | 'medium' | 'large';
}

export function Card({ children, style, onPress, padding = 'medium' }: CardProps) {
  const theme = useTheme();

  const getPadding = (): number => {
    switch (padding) {
      case 'none':
        return 0;
      case 'small':
        return theme.spacing.sm;
      case 'large':
        return theme.spacing.xl;
      default:
        return theme.spacing.lg;
    }
  };

  const cardStyle: ViewStyle = {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: getPadding(),
    ...theme.shadows.md,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          cardStyle,
          pressed && { backgroundColor: theme.colors.cardHover },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
}
