import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
}: ButtonProps) {
  const theme = useTheme();

  const getHeight = (): number => {
    switch (size) {
      case 'small':
        return 32;
      case 'large':
        return 52;
      default:
        return 48;
    }
  };

  const getFontSize = (): number => {
    switch (size) {
      case 'small':
        return 14;
      case 'large':
        return 18;
      default:
        return 16;
    }
  };

  const isDisabled = disabled || loading;

  const baseStyle: ViewStyle = {
    height: getHeight(),
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: size === 'small' ? theme.spacing.md : theme.spacing.xl,
    width: fullWidth ? '100%' : undefined,
    opacity: isDisabled ? 0.5 : 1,
  };

  const textBaseStyle: TextStyle = {
    fontSize: getFontSize(),
    fontWeight: '600',
  };

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          baseStyle,
          { transform: [{ scale: pressed ? 0.97 : 1 }] },
          style,
        ]}
      >
        <LinearGradient
          colors={isDisabled ? ['#E8E4E0', '#E8E4E0'] : theme.gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: theme.borderRadius.md }]}
        />
        {loading ? (
          <ActivityIndicator color={theme.colors.white} />
        ) : (
          <Text style={[textBaseStyle, { color: theme.colors.white }, textStyle]}>
            {title}
          </Text>
        )}
      </Pressable>
    );
  }

  if (variant === 'danger') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          baseStyle,
          { transform: [{ scale: pressed ? 0.97 : 1 }] },
          style,
        ]}
      >
        <LinearGradient
          colors={isDisabled ? ['#E8E4E0', '#E8E4E0'] : theme.gradients.danger}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: theme.borderRadius.md }]}
        />
        {loading ? (
          <ActivityIndicator color={theme.colors.white} />
        ) : (
          <Text style={[textBaseStyle, { color: theme.colors.white }, textStyle]}>
            {title}
          </Text>
        )}
      </Pressable>
    );
  }

  const getVariantStyles = (): { container: ViewStyle; text: TextStyle } => {
    switch (variant) {
      case 'secondary':
        return {
          container: {
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderColor: theme.colors.primary,
          },
          text: { color: theme.colors.primary },
        };
      case 'ghost':
        return {
          container: { backgroundColor: 'transparent' },
          text: { color: theme.colors.primary },
        };
      default:
        return {
          container: {},
          text: { color: theme.colors.white },
        };
    }
  };

  const variantStyles = getVariantStyles();

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        baseStyle,
        variantStyles.container,
        { transform: [{ scale: pressed ? 0.97 : 1 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles.text.color} />
      ) : (
        <Text style={[textBaseStyle, variantStyles.text, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}
