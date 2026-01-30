import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  onRightIconPress,
  secureTextEntry,
  containerStyle,
  ...props
}: InputProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const isPassword = secureTextEntry !== undefined;
  const showPassword = isPassword && isPasswordVisible;

  const getBorderColor = () => {
    if (error) return theme.colors.error;
    if (isFocused) return theme.colors.borderFocus;
    return theme.colors.border;
  };

  const getBackgroundColor = () => {
    if (error) return '#FFF5F5';
    return theme.colors.white;
  };

  return (
    <View style={[styles.container, containerStyle]}>
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

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: getBackgroundColor(),
            borderColor: getBorderColor(),
            borderRadius: theme.borderRadius.md,
            height: theme.inputs.height,
            borderWidth: theme.inputs.borderWidth,
          },
          isFocused && !error && {
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 3,
            elevation: 2,
          },
          error && {
            shadowColor: theme.colors.error,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 3,
            elevation: 2,
          },
        ]}
      >
        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={20}
            color={theme.colors.textSecondary}
            style={styles.leftIcon}
          />
        )}

        <TextInput
          style={[
            styles.input,
            {
              color: theme.colors.textPrimary,
              fontSize: theme.fonts.sizes.body,
              paddingLeft: leftIcon ? 0 : theme.inputs.paddingHorizontal,
              paddingRight: (isPassword || rightIcon) ? 0 : theme.inputs.paddingHorizontal,
            },
          ]}
          placeholderTextColor={theme.colors.textMuted}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={isPassword && !showPassword}
          {...props}
        />

        {isPassword && (
          <TouchableOpacity
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            style={styles.rightIcon}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        )}

        {!isPassword && rightIcon && (
          <TouchableOpacity
            onPress={onRightIconPress}
            style={styles.rightIcon}
            disabled={!onRightIconPress}
          >
            <Ionicons
              name={rightIcon}
              size={20}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {error && (
        <Text
          style={[
            styles.error,
            {
              color: theme.colors.error,
              fontSize: theme.fonts.sizes.captionSmall,
            },
          ]}
        >
          {error}
        </Text>
      )}

      {hint && !error && (
        <Text
          style={[
            styles.hint,
            {
              color: theme.colors.textMuted,
              fontSize: theme.fonts.sizes.captionSmall,
            },
          ]}
        >
          {hint}
        </Text>
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
  input: {
    flex: 1,
    height: '100%',
  },
  leftIcon: {
    marginLeft: 16,
    marginRight: 8,
  },
  rightIcon: {
    paddingHorizontal: 16,
    height: '100%',
    justifyContent: 'center',
  },
  error: {
    marginTop: 6,
  },
  hint: {
    marginTop: 6,
  },
});
