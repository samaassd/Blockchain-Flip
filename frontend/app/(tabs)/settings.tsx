import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { theme, formatUSD } from "@/src/theme";

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const onLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const rows: { icon: any; label: string; hint?: string; testID: string; onPress?: () => void }[] = [
    { icon: "wallet-outline", label: "Simulated Balance", hint: formatUSD(user?.balance_usd ?? 0), testID: "row-balance" },
    { icon: "trending-up-outline", label: "Total P&L", hint: formatUSD(user?.total_pnl ?? 0), testID: "row-pnl" },
    { icon: "server-outline", label: "Networks", hint: "Ethereum, BNB, Polygon", testID: "row-networks" },
    { icon: "flash-outline", label: "Auto-refresh scan", hint: "20 seconds", testID: "row-refresh" },
    { icon: "shield-checkmark-outline", label: "Execution Mode", hint: "SIMULATED", testID: "row-mode" },
    { icon: "help-circle-outline", label: "About ArbScout", hint: "v1.0.0", testID: "row-about" },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface }}
      contentContainerStyle={{ paddingBottom: 32 }}
      testID="settings-screen"
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.display_name || user?.email || "?").slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} testID="settings-user-name">{user?.display_name}</Text>
          <Text style={styles.email} testID="settings-user-email">{user?.email}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        {rows.slice(0, 2).map((r) => <Row key={r.testID} {...r} />)}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PREFERENCES</Text>
        {rows.slice(2, 5).map((r) => <Row key={r.testID} {...r} />)}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ABOUT</Text>
        {rows.slice(5).map((r) => <Row key={r.testID} {...r} />)}
      </View>

      <Pressable testID="logout-button" onPress={onLogout} style={styles.logout}>
        <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
        <Text style={styles.logoutText}>SIGN OUT</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ icon, label, hint, testID, onPress }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <View style={styles.iconBox}><Ionicons name={icon} size={18} color={theme.colors.brand} /></View>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color={theme.colors.onSurfaceSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  profile: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.lg, marginHorizontal: theme.spacing.xl, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: theme.colors.brand, fontSize: 24, fontWeight: "900" },
  name: { color: theme.colors.onSurface, fontSize: 17, fontWeight: "800" },
  email: { color: theme.colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  section: { marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.xl },
  sectionTitle: { color: theme.colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.4, fontWeight: "800", marginBottom: theme.spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.sm },
  iconBox: { width: 34, height: 34, borderRadius: theme.radius.sm, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowLabel: { color: theme.colors.onSurface, fontSize: 14, fontWeight: "700" },
  rowHint: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginRight: 6 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.sm, marginTop: theme.spacing.xl, marginHorizontal: theme.spacing.xl, padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.error, backgroundColor: "rgba(239,68,68,0.08)" },
  logoutText: { color: theme.colors.error, fontWeight: "900", letterSpacing: 1.5 },
});
