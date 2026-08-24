import { useState } from "react";
import {
  View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, ImageBackground,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async () => {
    if (!email || !password) { setErr("Enter email and password"); return; }
    setErr(""); setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.root} testID="login-screen">
      <ImageBackground
        source={{ uri: "https://images.pexels.com/photos/30767247/pexels-photo-30767247.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" }}
        style={styles.hero} imageStyle={{ opacity: 0.45 }}
      >
        <LinearGradient colors={["rgba(11,16,30,0.2)", theme.colors.surface]} style={styles.scrim} />
      </ImageBackground>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}><Ionicons name="pulse" size={22} color={theme.colors.onBrandPrimary} /></View>
            <Text style={styles.brand}>ARBSCOUT</Text>
          </View>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Live DEX arbitrage at your fingertips</Text>

          <View style={styles.form}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="login-email-input"
              value={email} onChangeText={setEmail}
              placeholder="you@wallet.com" placeholderTextColor={theme.colors.onSurfaceSecondary}
              autoCapitalize="none" keyboardType="email-address"
              style={styles.input}
            />
            <Text style={[styles.label, { marginTop: theme.spacing.md }]}>PASSWORD</Text>
            <TextInput
              testID="login-password-input"
              value={password} onChangeText={setPassword}
              placeholder="••••••••" placeholderTextColor={theme.colors.onSurfaceSecondary}
              secureTextEntry style={styles.input}
            />
            {!!err && <Text style={styles.err} testID="login-error">{err}</Text>}

            <Pressable
              testID="login-submit-button" onPress={onSubmit} disabled={loading}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
            >
              {loading ? <ActivityIndicator color={theme.colors.onBrandPrimary} /> : <Text style={styles.ctaText}>SIGN IN</Text>}
            </Pressable>

            <Pressable testID="go-to-register" onPress={() => router.push("/(auth)/register")} style={styles.ghost}>
              <Text style={styles.ghostText}>New here? <Text style={{ color: theme.colors.brand }}>Create account</Text></Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  hero: { position: "absolute", top: 0, left: 0, right: 0, height: 320 },
  scrim: { ...StyleSheet.absoluteFillObject },
  container: { padding: theme.spacing.xl, paddingTop: 120, flexGrow: 1 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginBottom: theme.spacing.xl },
  brandBadge: { width: 34, height: 34, borderRadius: 10, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
  brand: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  title: { color: theme.colors.onSurface, fontSize: 40, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 14, marginTop: theme.spacing.xs, marginBottom: theme.spacing.xl },
  form: { backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.lg, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border },
  label: { color: theme.colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.2, marginBottom: theme.spacing.xs, fontWeight: "700" },
  input: { backgroundColor: theme.colors.surfaceTertiary, color: theme.colors.onSurface, padding: theme.spacing.md, borderRadius: theme.radius.md, fontSize: 16, borderWidth: 1, borderColor: theme.colors.border },
  cta: { backgroundColor: theme.colors.brand, padding: 16, borderRadius: theme.radius.md, alignItems: "center", marginTop: theme.spacing.lg },
  ctaText: { color: theme.colors.onBrandPrimary, fontWeight: "900", letterSpacing: 1.5, fontSize: 15 },
  ghost: { marginTop: theme.spacing.md, alignItems: "center", padding: theme.spacing.sm },
  ghostText: { color: theme.colors.onSurfaceSecondary, fontSize: 14 },
  err: { color: theme.colors.error, marginTop: theme.spacing.sm, fontSize: 13 },
});
