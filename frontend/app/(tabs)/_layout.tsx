import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.onSurfaceSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surfaceSecondary,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 74,
          paddingTop: 6,
          paddingBottom: 14,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
          tabBarButtonTestID: "tab-dashboard",
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: "Scanner",
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" size={size} color={color} />,
          tabBarButtonTestID: "tab-scanner",
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} />,
          tabBarButtonTestID: "tab-wallet",
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />,
          tabBarButtonTestID: "tab-history",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
          tabBarButtonTestID: "tab-settings",
        }}
      />
    </Tabs>
  );
}
