import React, { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuthStore } from '@/state/authStore'
import { LoginScreen } from '@/screens/LoginScreen'
import { MainTabs } from './MainTabs'
import { theme } from '@/theme'

const Stack = createNativeStackNavigator()

export const AppNavigator: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const initialized = useAuthStore((s) => s.initialized)
  const bootstrap = useAuthStore((s) => s.bootstrap)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  if (!initialized) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    )
  }

  if (!user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    )
  }

  return <MainTabs />
}
