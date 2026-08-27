import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, ActivityIndicator, RefreshControl, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/src/theme";
import { CHAIN_LIST, REOWN_PROJECT_ID } from "@/src/wallet/appkit";
import { explorerTx } from "@/src/wallet/contracts";
import { useWallet } from "@/src/wallet/useWallet";
import { hasInjectedWallet, detectInjectedName } from "@/src/wallet/injected";

export default function Wallet() {
  const insets = useSafeAreaInsets();
  const {
    state, isConnected, connecting, error,
    connect, disconnect, switchChain, refresh,
  } = useWallet();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => { setRefreshing(true); await refresh(); setRefreshing(false); };
  const openAddress = () => {
    if (state?.address) {
      const url = explorerTx(state.chainId, state.address).replace("/tx/", "/address/");
      Linking.openURL(url).catch(() => {});
    }
  };

  const isWeb = Platform.OS === "web";
  const injectedName = isWeb && hasInjectedWallet() ? detectInjectedName() : "";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.brand} />}
      testID="wallet-screen"
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Wallet</Text>
        <Text style={styles.subtitle}>
          {isWeb ? "Connect a browser wallet to execute real trades" : "Connect any EVM wallet via WalletConnect"}
        </Text>
      </View>

      {!isConnected ? (
        <View style={styles.emptyCard} testID="wallet-empty-card">
          <View style={styles.iconCircle}>
            <Ionicons name="wallet" size={28} color={theme.colors.brand} />
          </View>
          <Text style={styles.emptyTitle}>No wallet connected</Text>
          <Text style={styles.emptyBody}>
            {isWeb
              ? (injectedName
                  ? `Detected: ${injectedName}. Approve the connection in your extension.`
                  : "Install MetaMask, Rabby or Coinbase Wallet as a browser extension to continue.")
              : "Connect MetaMask, Trust, Rainbow or any WalletConnect-compatible wallet. You sign every transaction — ArbScout never sees your keys."}
          </Text>
          <Pressable
            testID="connect-wallet-button" onPress={connect} disabled={connecting}
            style={({ pressed }) => [styles.cta, (pressed || connecting) && { opacity: 0.75 }]}
          >
            {connecting ? <ActivityIndicator color={theme.colors.onBrandPrimary} /> : (
              <>
                <Ionicons name="link" size={18} color={theme.colors.onBrandPrimary} />
                <Text style={styles.ctaText}>CONNECT WALLET</Text>
              </>
            )}
          </Pressable>
          {!!error && <Text style={styles.err} testID="wallet-error">{error}</Text>}
          {!isWeb && (
            <Text style={styles.hint}>
              ⓘ Full wallet deep-linking requires a native/dev build (Publish button).
            </Text>
          )}
        </View>
      ) : (
        <>
          <View style={styles.card} testID="wallet-connected-card">
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.label}>CONNECTED WALLET</Text>
                <Text style={styles.walletName} testID="wallet-name">{state?.walletName || "Wallet"}</Text>
              </View>
              <View style={styles.statusDotWrap}>
                <View style={[styles.statusDot, !state?.isSupportedChain && { backgroundColor: theme.colors.warning }]} />
                <Text style={[styles.statusText, !state?.isSupportedChain && { color: theme.colors.warning }]}>
                  {state?.isSupportedChain ? "ACTIVE" : "UNSUPPORTED"}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.balanceLabel}>BALANCE ON {state?.chainName?.toUpperCase()}</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 }}>
              <Text style={styles.balanceNative} testID="wallet-balance-native">{state?.balanceNative}</Text>
              <Text style={styles.balanceSymbol}>{state?.balanceSymbol}</Text>
            </View>
            {state?.balanceUsd !== null && (
              <Text style={styles.balanceUsd} testID="wallet-balance-usd">
                ≈ ${state?.balanceUsd?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            )}

            <View style={styles.divider} />

            <Pressable testID="wallet-address" onPress={openAddress} style={styles.addressRow}>
              <View style={styles.iconChip}><Ionicons name="finger-print" size={14} color={theme.colors.brand} /></View>
              <Text style={styles.address}>
                {state?.address ? `${state.address.slice(0, 6)}…${state.address.slice(-4)}` : ""}
              </Text>
              <View style={{ flex: 1 }} />
              <Ionicons name="open-outline" size={16} color={theme.colors.onSurfaceSecondary} />
            </Pressable>
            <View style={styles.addressRow}>
              <View style={styles.iconChip}><Ionicons name="server-outline" size={14} color={theme.colors.brand} /></View>
              <Text style={styles.address}>{state?.chainName}</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.addressMeta}>chain {state?.chainId}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SUPPORTED NETWORKS</Text>
            {CHAIN_LIST.map((c) => {
              const active = c.chainId === state?.chainId;
              return (
                <View key={c.chainId} style={[styles.chainRow, active && styles.chainRowActive]} testID={`chain-${c.chainId}`}>
                  <View style={styles.iconChip}><Text style={styles.chainAbbr}>{c.name.slice(0, 3).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chainName}>{c.name}</Text>
                    <Text style={styles.chainCurrency}>{c.currency}</Text>
                  </View>
                  {active ? (
                    <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>
                  ) : (
                    <Pressable testID={`switch-${c.chainId}`} onPress={() => switchChain(c.chainId)} style={styles.switchBtn}>
                      <Text style={styles.switchText}>SWITCH</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ACTIONS</Text>
            <Pressable testID="refresh-wallet" onPress={onRefresh} style={styles.actionRow}>
              <View style={styles.iconChip}><Ionicons name="refresh" size={14} color={theme.colors.brand} /></View>
              <Text style={styles.actionLabel}>Refresh balance</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.onSurfaceSecondary} />
            </Pressable>
            <Pressable testID="disconnect-wallet" onPress={disconnect} style={[styles.actionRow, { borderColor: theme.colors.error }]}>
              <View style={[styles.iconChip, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
                <Ionicons name="log-out" size={14} color={theme.colors.error} />
              </View>
              <Text style={[styles.actionLabel, { color: theme.colors.error }]}>Disconnect wallet</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.error} />
            </Pressable>
          </View>

          {!!error && <Text style={[styles.err, { marginHorizontal: theme.spacing.xl }]} testID="wallet-error">{error}</Text>}

          <View style={styles.warnBox}>
            <Ionicons name="warning-outline" size={16} color={theme.colors.warning} />
            <Text style={styles.warnText}>
              Real trades spend real funds and gas. Retail DEX↔DEX arbitrage is highly competitive — expect net losses in most cases. Always verify tx details in your wallet before signing.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 13, marginTop: 4 },
  emptyCard: { marginHorizontal: theme.spacing.xl, padding: theme.spacing.xl, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", gap: theme.spacing.md },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "900" },
  emptyBody: { color: theme.colors.onSurfaceSecondary, fontSize: 13, textAlign: "center", lineHeight: 20 },
  cta: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.brand, paddingHorizontal: theme.spacing.xl, paddingVertical: 14, borderRadius: theme.radius.md, marginTop: theme.spacing.md, minWidth: 200, justifyContent: "center" },
  ctaText: { color: theme.colors.onBrandPrimary, fontWeight: "900", letterSpacing: 1.5, fontSize: 14 },
  err: { color: theme.colors.error, marginTop: 8, fontSize: 12, textAlign: "center" },
  hint: { color: theme.colors.onSurfaceSecondary, fontSize: 11, marginTop: theme.spacing.md, textAlign: "center", fontStyle: "italic" },

  card: { marginHorizontal: theme.spacing.xl, padding: theme.spacing.lg, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: theme.colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1.2, fontWeight: "800" },
  walletName: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "900", marginTop: 4 },
  statusDotWrap: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandTertiary },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.success },
  statusText: { color: theme.colors.brand, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.md },
  balanceLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1.2, fontWeight: "800" },
  balanceNative: { color: theme.colors.onSurface, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  balanceSymbol: { color: theme.colors.onSurfaceSecondary, fontSize: 14, fontWeight: "800" },
  balanceUsd: { color: theme.colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, paddingVertical: 8 },
  iconChip: { width: 30, height: 30, borderRadius: theme.radius.sm, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  address: { color: theme.colors.onSurface, fontSize: 14, fontWeight: "700", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  addressMeta: { color: theme.colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700" },

  section: { marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.xl },
  sectionTitle: { color: theme.colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.4, fontWeight: "800", marginBottom: theme.spacing.sm },
  chainRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.sm },
  chainRowActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandTertiary },
  chainAbbr: { color: theme.colors.brand, fontWeight: "900", fontSize: 10, letterSpacing: 0.5 },
  chainName: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 14 },
  chainCurrency: { color: theme.colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  activeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brand },
  activeBadgeText: { color: theme.colors.onBrandPrimary, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  switchBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  switchText: { color: theme.colors.onSurfaceSecondary, fontWeight: "800", fontSize: 10, letterSpacing: 1 },

  actionRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.sm },
  actionLabel: { flex: 1, color: theme.colors.onSurface, fontSize: 14, fontWeight: "700" },

  warnBox: { flexDirection: "row", gap: theme.spacing.sm, alignItems: "flex-start", marginTop: theme.spacing.md, marginHorizontal: theme.spacing.xl, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: "rgba(245,158,11,0.08)", borderWidth: 1, borderColor: "rgba(245,158,11,0.4)" },
  warnText: { color: theme.colors.onSurfaceSecondary, fontSize: 12, flex: 1, lineHeight: 18 },
});
