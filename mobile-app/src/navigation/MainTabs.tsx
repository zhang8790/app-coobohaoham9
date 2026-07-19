import React from 'react'
import { Text } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { HomeScreen } from '@/screens/HomeScreen'
import { ProductsScreen } from '@/screens/ProductsScreen'
import { ProductDetailScreen } from '@/screens/ProductDetailScreen'
import { CartScreen } from '@/screens/CartScreen'
import { ProfileScreen } from '@/screens/ProfileScreen'
import { OrdersScreen } from '@/screens/OrdersScreen'
import { theme } from '@/theme'

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

const HomeStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Home" component={HomeScreen} />
    <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: '商品详情' }} />
  </Stack.Navigator>
)

const ProductsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Products" component={ProductsScreen} />
    <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: '商品详情' }} />
  </Stack.Navigator>
)

const ProfileStack = () => (
  <Stack.Navigator>
    <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: '我的' }} />
    <Stack.Screen name="Orders" component={OrdersScreen} options={{ title: '我的订单' }} />
  </Stack.Navigator>
)

const tabIcon =
  (emoji: string) =>
  ({ color, size }: { color: string; size: number }) => (
    <Text style={{ fontSize: size - 4, color }}>{emoji}</Text>
  )

export const MainTabs: React.FC = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: theme.primary,
      tabBarInactiveTintColor: theme.subText,
      tabBarStyle: { borderTopColor: theme.border },
    }}
  >
    <Tab.Screen name="首页" component={HomeStack} options={{ tabBarIcon: tabIcon('🏠') }} />
    <Tab.Screen name="商城" component={ProductsStack} options={{ tabBarIcon: tabIcon('🛍️') }} />
    <Tab.Screen name="购物车" component={CartScreen} options={{ tabBarIcon: tabIcon('🛒') }} />
    <Tab.Screen name="我的" component={ProfileStack} options={{ tabBarIcon: tabIcon('👤') }} />
  </Tab.Navigator>
)
