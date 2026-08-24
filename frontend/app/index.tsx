import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)/dashboard");
    else router.replace("/(auth)/login");
  }, [user, loading, router]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="large" color={theme.colors.brand} />
    </View>
  );
}
