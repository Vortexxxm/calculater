import { Stack } from 'expo-router';

export default function VaultLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="auth" />
      <Stack.Screen name="home" />
      <Stack.Screen name="chat" />
    </Stack>
  );
}
