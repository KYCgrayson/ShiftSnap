import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors, DarkColors } from '../../src/theme';

export default function AuthLayout() {
  const colorScheme = useColorScheme();
  const colors = colorScheme === 'dark' ? DarkColors : Colors;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.warmWhite },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="terms" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
