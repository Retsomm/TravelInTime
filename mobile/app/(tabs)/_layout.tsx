import { Tabs } from 'expo-router';
import { useTheme } from '../../lib/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.paperBg2, borderTopColor: colors.borderColor },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.ink3,
      }}
    >
      <Tabs.Screen name="index" options={{ title: '書櫃' }} />
      <Tabs.Screen name="settings" options={{ title: '設定' }} />
    </Tabs>
  );
}
