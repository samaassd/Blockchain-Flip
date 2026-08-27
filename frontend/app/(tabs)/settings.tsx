import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking, Switch } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { useSettings, ExecutionMode, AutoRefresh, AutoMinNet, AutoTradeSize } from "@/src/context/SettingsContext";
import { useWallet } from "@/src/wallet/useWallet";
import { CHAIN_LIST } from "@/src/wallet/appkit";
import { theme, formatUSD } from "@/src/theme";

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const {
    executionMode, setExecutionMode, autoRefreshSec, setAutoRefreshSec,
    autoMode, setAutoMode, autoMinNet, setAutoMinNet, autoTradeSize, setAutoTradeSize,
  } = useSettings();
  const { isConnected: walletConnected, state: wallet } = useWallet();
  const isGoogle = user?.auth_provider === "google";

  const [showNetworks, setShowNetworks] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [toast, setToast] = useState<string>("");

  const onLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  };

  const onSetMode = async (m: ExecutionMode) => {
    if (m === "ONCHAIN" && !walletConnected) {
      flash("Connect a wallet first — opening Wallet…");
      setTimeout(() => router.push("/(tabs)/wallet"), 600);
      return;
    }
    await setExecutionMode(m);
    flash(`Execution mode: ${m === "ONCHAIN" ? "LIVE ON-CHAIN" : "SIMULATED"}`);
  };

  const onSetRefresh = async (s: AutoRefresh) => {
    await setAutoRefreshSec(s);
    flash(s === 0 ? "Auto-refresh: OFF" : `Auto-refresh: ${s}s`);
  };

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
        {user?.picture ? (
          <Image source={{ uri: user.picture }} style={styles.avatarImg} testID="settings-avatar-photo" />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.display_name || user?.email || "?").slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} testID="settings-user-name">{user?.display_name}</Text>
          <Text style={styles.email} testID="settings-user-email">{user?.email}</Text>
          <View style={styles.providerBadge} testID="settings-auth-provider">
            <Ionicons name={isGoogle ? "logo-google" : "mail-outline"} size={10} color={theme.colors.brand} />
            <Text style={styles.providerText}>{isGoogle ? "GOOGLE ACCOUNT" : "EMAIL ACCOUNT"}</Text>
          </View>
        </View>
      </View>

      {/* --- Execution Mode (the star feature) --- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>EXECUTION MODE</Text>
        <View style={styles.modeCard} testID="execution-mode-card">
          <View style={styles.modeToggle}>
            <Pressable
              testID="mode-simulated"
              onPress={() => onSetMode("SIMULATED")}
              style={[styles.modeBtn, executionMode === "SIMULATED" && styles.modeBtnActive]}
            >
              <Ionicons
                name="flask"
                size={16}
                color={executionMode === "SIMULATED" ? theme.colors.onBrandPrimary : theme.colors.onSurfaceSecondary}
              />
              <Text style={[styles.modeBtnText, executionMode === "SIMULATED" && styles.modeBtnTextActive]}>
                SIMULATED
              </Text>
            </Pressable>
            <Pressable
              testID="mode-onchain"
              onPress={() => onSetMode("ONCHAIN")}
              style={[
                styles.modeBtn,
                executionMode === "ONCHAIN" && [styles.modeBtnActive, { backgroundColor: theme.colors.success }],
              ]}
            >
              <Ionicons
                name="flash"
                size={16}
                color={executionMode === "ONCHAIN" ? "#fff" : theme.colors.onSurfaceSecondary}
              />
              <Text style={[styles.modeBtnText, executionMode === "ONCHAIN" && { color: "#fff" }]}>
                LIVE ON-CHAIN
              </Text>
            </Pressable>
          </View>
          <Text style={styles.modeDesc} testID="execution-mode-desc">
            {executionMode === "SIMULATED"
              ? "Trades update a virtual $10,000 balance. No real funds move."
              : walletConnected
                ? `Trades will be signed in ${wallet?.walletName || "your wallet"} on ${wallet?.chainName || "the active chain"}. Real gas is spent.`
                : "Connect a wallet to arm live execution — trades are blocked until then."}
          </Text>
          {executionMode === "ONCHAIN" && !walletConnected && (
            <Pressable
              testID="jump-to-wallet"
              onPress={() => router.push("/(tabs)/wallet")}
              style={styles.armCta}
            >
              <Ionicons name="wallet" size={14} color={theme.colors.onBrandPrimary} />
              <Text style={styles.armCtaText}>CONNECT WALLET</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* --- Account --- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.row} testID="row-balance">
          <View style={styles.iconBox}><Ionicons name="wallet-outline" size={18} color={theme.colors.brand} /></View>
          <Text style={styles.rowLabel}>Simulated Balance</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.rowHint} testID="hint-balance">{formatUSD(user?.balance_usd ?? 0)}</Text>
        </View>
        <View style={styles.row} testID="row-pnl">
          <View style={styles.iconBox}><Ionicons name="trending-up-outline" size={18} color={theme.colors.brand} /></View>
          <Text style={styles.rowLabel}>Total P&L</Text>
          <View style={{ flex: 1 }} />
          <Text style={[styles.rowHint, { color: (user?.total_pnl ?? 0) >= 0 ? theme.colors.success : theme.colors.error }]} testID="hint-pnl">
            {formatUSD(user?.total_pnl ?? 0)}
          </Text>
        </View>
      </View>

      {/* --- Preferences --- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PREFERENCES</Text>

        <View testID="row-automode" style={[styles.groupCard, autoMode && { borderColor: theme.colors.success }]}>
          <View style={styles.groupHeader}>
            <View style={styles.iconBox}><Ionicons name="hardware-chip-outline" size={18} color={theme.colors.brand} /></View>
            <Text style={styles.rowLabel}>Auto Mode</Text>
            <View style={{ flex: 1 }} />
            <Switch
              testID="automode-switch"
              value={autoMode}
              onValueChange={(v) => {
                setAutoMode(v);
                flash(v ? "Auto Mode ON — bot executes simulated trades" : "Auto Mode OFF");
              }}
              trackColor={{ false: theme.colors.surfaceTertiary, true: theme.colors.success }}
              thumbColor="#fff"
            />
          </View>
          <Text style={styles.modeDesc} testID="automode-desc">
            Auto-executes SIMULATED trades from the Scanner when the estimated net profit at your trade size clears the threshold. Never signs on-chain trades.
          </Text>
          {autoMode && (
            <>
              <Text style={styles.autoLabel}>MIN NET PROFIT</Text>
              <View style={styles.pillRow}>
                {([5, 10, 25, 50] as AutoMinNet[]).map((n) => (
                  <Pressable
                    key={n}
                    testID={`automin-${n}`}
                    onPress={() => { setAutoMinNet(n); flash(`Auto threshold: ≥ $${n} net`); }}
                    style={[styles.pill, autoMinNet === n && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, autoMinNet === n && styles.pillTextActive]}>≥ ${n}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.autoLabel}>TRADE SIZE</Text>
              <View style={styles.pillRow}>
                {([500, 1000, 2500] as AutoTradeSize[]).map((n) => (
                  <Pressable
                    key={n}
                    testID={`autosize-${n}`}
                    onPress={() => { setAutoTradeSize(n); flash(`Auto trade size: $${n.toLocaleString()}`); }}
                    style={[styles.pill, autoTradeSize === n && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, autoTradeSize === n && styles.pillTextActive]}>${n.toLocaleString()}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>

        <View testID="row-refresh" style={styles.groupCard}>
          <View style={styles.groupHeader}>
            <View style={styles.iconBox}><Ionicons name="flash-outline" size={18} color={theme.colors.brand} /></View>
            <Text style={styles.rowLabel}>Auto-refresh scan</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.rowHint} testID="hint-refresh">
              {autoRefreshSec === 0 ? "OFF" : `${autoRefreshSec}s`}
            </Text>
          </View>
          <View style={styles.pillRow}>
            {([10, 20, 45, 0] as AutoRefresh[]).map((s) => (
              <Pressable
                key={s}
                testID={`refresh-${s}`}
                onPress={() => onSetRefresh(s)}
                style={[styles.pill, autoRefreshSec === s && styles.pillActive]}
              >
                <Text style={[styles.pillText, autoRefreshSec === s && styles.pillTextActive]}>
                  {s === 0 ? "OFF" : `${s}s`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable testID="row-networks" onPress={() => setShowNetworks((v) => !v)} style={styles.row}>
          <View style={styles.iconBox}><Ionicons name="server-outline" size={18} color={theme.colors.brand} /></View>
          <Text style={styles.rowLabel}>Networks</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.rowHint}>{CHAIN_LIST.length} chains</Text>
          <Ionicons name={showNetworks ? "chevron-up" : "chevron-forward"} size={16} color={theme.colors.onSurfaceSecondary} />
        </Pressable>
        {showNetworks && (
          <View style={styles.expandCard} testID="networks-list">
            {CHAIN_LIST.map((c) => (
              <View key={c.chainId} style={styles.netRow} testID={`net-${c.chainId}`}>
                <Text style={styles.netName}>{c.name}</Text>
                <Text style={styles.netMeta}>chain {c.chainId} • {c.currency}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* --- About --- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <Pressable testID="row-about" onPress={() => setShowAbout((v) => !v)} style={styles.row}>
          <View style={styles.iconBox}><Ionicons name="help-circle-outline" size={18} color={theme.colors.brand} /></View>
          <Text style={styles.rowLabel}>About ArbScout</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.rowHint}>v1.1.0</Text>
          <Ionicons name={showAbout ? "chevron-up" : "chevron-forward"} size={16} color={theme.colors.onSurfaceSecondary} />
        </Pressable>
        {showAbout && (
          <View style={styles.expandCard} testID="about-panel">
            <Text style={styles.aboutText}>
              Live DEX arbitrage scanner across EVM chains + Solana. Uses CoinGecko + 1inch pricing, Jupiter for Solana, LI.FI for cross-chain bridging, and lets you sign real swaps from your own wallet.
            </Text>
            <Pressable
              testID="about-link"
              onPress={() => Linking.openURL("https://reown.com").catch(() => {})}
              style={styles.linkBtn}
            >
              <Ionicons name="open-outline" size={14} color={theme.colors.brand} />
              <Text style={styles.linkText}>Powered by Reown WalletConnect</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* --- Session / Sign out --- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SESSION</Text>
        <View style={styles.row} testID="row-session">
          <View style={styles.iconBox}>
            <Ionicons name={isGoogle ? "logo-google" : "person-outline"} size={18} color={theme.colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Signed in {isGoogle ? "with Google" : "with email"}</Text>
            <Text style={styles.sessionEmail}>{user?.email}</Text>
          </View>
        </View>
        <Pressable testID="logout-button" onPress={onLogout} style={styles.logout}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
          <Text style={styles.logoutText}>SIGN OUT</Text>
        </Pressable>
      </View>

      {!!toast && (
        <View style={styles.toast} testID="settings-toast">
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  profile: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.lg, marginHorizontal: theme.spacing.xl, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarImg: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.brandTertiary },
  avatarText: { color: theme.colors.brand, fontSize: 24, fontWeight: "900" },
  name: { color: theme.colors.onSurface, fontSize: 17, fontWeight: "800" },
  email: { color: theme.colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  providerBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandTertiary },
  providerText: { color: theme.colors.brand, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  section: { marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.xl },
  sectionTitle: { color: theme.colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.4, fontWeight: "800", marginBottom: theme.spacing.sm },

  modeCard: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md },
  modeToggle: { flexDirection: "row", padding: 4, backgroundColor: theme.colors.surfaceTertiary, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: theme.radius.pill },
  modeBtnActive: { backgroundColor: theme.colors.brand },
  modeBtnText: { color: theme.colors.onSurfaceSecondary, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  modeBtnTextActive: { color: theme.colors.onBrandPrimary },
  modeDesc: { color: theme.colors.onSurfaceSecondary, fontSize: 12, lineHeight: 18, marginTop: theme.spacing.sm },
  armCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: theme.spacing.sm, paddingVertical: 10, borderRadius: theme.radius.md, backgroundColor: theme.colors.brand },
  armCtaText: { color: theme.colors.onBrandPrimary, fontWeight: "900", letterSpacing: 1, fontSize: 12 },

  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.sm },
  iconBox: { width: 34, height: 34, borderRadius: theme.radius.sm, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowLabel: { color: theme.colors.onSurface, fontSize: 14, fontWeight: "700" },
  rowHint: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginRight: 6 },

  groupCard: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md, marginBottom: theme.spacing.sm },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  pillRow: { flexDirection: "row", gap: theme.spacing.xs, marginTop: theme.spacing.sm },
  pill: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceTertiary, borderWidth: 1, borderColor: theme.colors.border },
  pillActive: { backgroundColor: theme.colors.brandTertiary, borderColor: theme.colors.brand },
  pillText: { color: theme.colors.onSurfaceSecondary, fontWeight: "800", fontSize: 11 },
  pillTextActive: { color: theme.colors.brand },

  expandCard: { backgroundColor: theme.colors.surfaceTertiary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md, marginBottom: theme.spacing.sm },
  netRow: { paddingVertical: 6 },
  netName: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 13 },
  netMeta: { color: theme.colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },

  aboutText: { color: theme.colors.onSurfaceSecondary, fontSize: 12, lineHeight: 18 },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: theme.spacing.sm },
  linkText: { color: theme.colors.brand, fontSize: 12, fontWeight: "800" },

  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.error, backgroundColor: "rgba(239,68,68,0.08)" },
  logoutText: { color: theme.colors.error, fontWeight: "900", letterSpacing: 1.5 },
  sessionEmail: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  autoLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1.2, fontWeight: "800", marginTop: theme.spacing.md },

  toast: { position: "absolute", left: theme.spacing.xl, right: theme.spacing.xl, bottom: 24, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.brand, flexDirection: "row", alignItems: "center", gap: 8 },
  toastText: { color: theme.colors.onBrandPrimary, fontWeight: "900", fontSize: 13, letterSpacing: 0.5 },
});
