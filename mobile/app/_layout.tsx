import { Stack } from 'expo-router';
import ThemeProvider from '../components/ThemeProvider';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="reader/[id]" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}
