import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { color } from '@/theme/tokens';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.bg },
            animation: 'slide_from_right',
          }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="stocks" />
          <Stack.Screen name="stock/[code]" />
          <Stack.Screen name="report/[id]" />
          <Stack.Screen name="diagnose" />
          <Stack.Screen name="market" />
          <Stack.Screen name="portfolio" />
          <Stack.Screen name="performance" />
          <Stack.Screen name="watchlist" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
