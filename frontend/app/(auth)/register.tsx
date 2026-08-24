import { useState } from "react";
import {
  View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async () => {
    if (!email || password.length < 6) { setErr("Password must be 6+ chars"); return; }
    setErr(""); setLoading(true);
    try {
      await register(email.trim().toLowerCase(), password, displayName || undefined);
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.root} testID="register-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable testID="back-to-login" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Start with $10,000 in simulated capital</Text>

          <View style={styles.form}>
            <Text style={styles.label}>DISPLAY NAME (OPTIONAL)</Text>
            <TextInput
              testID="register-name-input"
              value={displayName} onChangeText={setDisplayName}
              placeholder="Trader" placeholderTextColor={theme.colors.onSurfaceSecondary}
              style={styles.input}
            />
            <Text style={[styles.label, { marginTop: theme.spacing.md }]}>EMAIL</Text>
            <TextInput
              testID="register-email-input"
              value={email} onChangeText={setEmail}
              placeholder="you@wallet.com" placeholderTextColor={theme.colors.onSurfaceSecondary}
              autoCapitalize="none" keyboardType="email-address"
              style={styles.input}
            />
            <Text style={[styles.label, { marginTop: theme.spacing.md }]}>PASSWORD</Text>
            <TextInput
              testID="register-password-input"
              value={password} onChangeText={setPassword}
              placeholder="••••••••" placeholderTextColor={theme.colors.onSurfaceSecondary}
              secureTextEntry style={styles.input}
            />
            {!!err && <Text style={styles.err} testID="register-error">{err}</Text>}
            <Pressable
              testID="register-submit-button" onPress={onSubmit} disabled={loading}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
            >
              {loading ? <ActivityIndicator color={theme.colors.onBrandPrimary} /> : <Text style={styles.ctaText}>CREATE ACCOUNT</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  container: { padding: theme.spacing.xl, paddingTop: 80, flexGrow: 1 },
  back: { width: 40, height: 40, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceSecondary, alignItems: "center", justifyContent: "center", marginBottom: theme.spacing.lg },
  title: { color: theme.colors.onSurface, fontSize: 36, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 14, marginTop: theme.spacing.xs, marginBottom: theme.spacing.xl },
  form: { backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.lg, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border },
  label: { color: theme.colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.2, marginBottom: theme.spacing.xs, fontWeight: "700" },
  input: { backgroundColor: theme.colors.surfaceTertiary, color: theme.colors.onSurface, padding: theme.spacing.md, borderRadius: theme.radius.md, fontSize: 16, borderWidth: 1, borderColor: theme.colors.border },
  cta: { backgroundColor: theme.colors.brand, padding: 16, borderRadius: theme.radius.md, alignItems: "center", marginTop: theme.spacing.lg },
  ctaText: { color: theme.colors.onBrandPrimary, fontWeight: "900", letterSpacing: 1.5, fontSize: 15 },
  err: { color: theme.colors.error, marginTop: theme.spacing.sm, fontSize: 13 },
});
