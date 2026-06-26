import { Tabs } from 'expo-router';

import { CustomTabBar } from '@/components/tab-bar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...(props as any)} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="recommend" />
      <Tabs.Screen name="screener" />
      <Tabs.Screen name="alerts" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
