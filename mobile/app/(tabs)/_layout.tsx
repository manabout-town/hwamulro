import { Tabs, Redirect } from "expo-router"
import { Text, type ColorValue } from "react-native"
import { useAuth } from "../../lib/auth"

function Icon({ label, color }: { label: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{label}</Text>
}

export default function TabsLayout() {
  const { session, loading, role } = useAuth()
  if (loading) return null
  if (!session) return <Redirect href="/(auth)/login" />

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#F97316", headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: "홈", tabBarIcon: ({ color }) => <Icon label="🏠" color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: role === "driver" ? "피드" : "내주문", tabBarIcon: ({ color }) => <Icon label="📋" color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "더보기", tabBarIcon: ({ color }) => <Icon label="☰" color={color} /> }} />
    </Tabs>
  )
}
