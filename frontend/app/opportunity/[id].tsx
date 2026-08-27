import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable,
  TextInput, KeyboardAvoidingView, Platform, Linking,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, Opportunity } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, formatUSD, formatPct } from "@/src/theme";
import { CHAIN_LIST, CHAINS } from "@/src/wallet/appkit";
import { executeOnChainSwap } from "@/src/wallet/swap";
import { tokenAddressFor } from "@/src/wallet/contracts";
import { useWallet } from "@/src/wallet/useWallet";
import { useSettings } from "@/src/context/SettingsContext";

export default function OpportunityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();

  // Unified wallet state (cross-platform)
  const {
    state: walletState, isConnected: walletConnected,
    connect: connectWallet, provider: walletProvider,
  } = useWallet();
  const address = walletState?.address || "";
  const chainId = walletState?.chainId || 0;

  // Global execution-mode preference (Settings screen)
  const { executionMode: globalMode, setExecutionMode } = useSettings();

  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("1000");
  const [executing, setExecuting] = useState(false);
  const initialMode = globalMode === "ONCHAIN" && walletConnected ? "onchain" : "simulated";
  const [mode, setMode] = useState<"simulated" | "onchain">(initialMode);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; text: string; link?: string } | null>(null);
  const [error, setError] = useState("");

  // Follow global preference — if user flips mode in Settings, mirror it here (only when wallet permits on-chain)
  useEffect(() => {
    const wantOnchain = globalMode === "ONCHAIN" && walletConnected;
    setMode(wantOnchain ? "onchain" : "simulated");
  }, [globalMode, walletConnected]);

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await api.get<Opportunity>(`/scanner/opportunity/${encodeURIComponent(id)}`);
      setOpp(data);
    } catch (e: any) {
      setError(e?.message || "Opportunity expired");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const amt = parseFloat(amount || "0");
  const gross = opp ? amt * (opp.spread_pct / 100) : 0;
  const fees = opp ? opp.estimated_gas_usd + (opp.buy_dex.fee + opp.sell_dex.fee) * amt : 0;
  const net = gross - fees;

  const chain = CHAIN_LIST.find((c) => c.chainId === Number(chainId));
  const tokenOnChain = opp ? tokenAddressFor(opp.token_id, Number(chainId)) : null;

  const executeSimulated = async () => {
    if (!opp || amt <= 0) { setToast({ type: "error", text: "Enter a valid amount" }); return; }
    setExecuting(true);
    try {
      const res = await api.post("/trades/execute", { opportunity_id: opp.id, amount_usd: amt });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await refreshUser();
      setToast({ type: res.net_profit >= 0 ? "success" : "error", text: `Simulated • Net ${formatUSD(res.net_profit)}` });
      setTimeout(() => router.replace("/(tabs)/history"), 1200);
    } catch (e: any) {
      setToast({ type: "error", text: e?.message || "Execution failed" });
    } finally { setExecuting(false); }
  };

  const executeOnChain = async () => {
    if (!opp || amt <= 0) { setToast({ type: "error", text: "Enter a valid amount" }); return; }
    if (!walletConnected || !walletProvider) { setToast({ type: "error", text: "Connect wallet first" }); return; }
    if (!tokenOnChain) {
      setToast({ type: "error", text: `${opp.token_symbol} not deployed on ${chain?.name || "this chain"}` });
      return;
    }
    setExecuting(true);
    try {
      const { hash, explorer } = await executeOnChainSwap({
        eip1193: walletProvider,
        userAddress: address,
        chainId: Number(chainId),
        tokenId: opp.token_id,
        amountUsd: amt,
        basePriceUsd: opp.base_price,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const trade = await api.post("/trades/onchain", {
        opportunity_id: opp.id,
        amount_usd: amt,
        tx_hash: hash,
        chain_id: Number(chainId),
        wallet_address: address,
        explorer_url: explorer,
      });
      setToast({ type: "info", text: "Tx submitted • reconciling receipt…", link: explorer });
      // Poll for receipt reconciliation up to ~2 min
      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        try {
          const rec = await api.post("/trades/reconcile", { trade_id: trade.id });
          if (rec.status && rec.status !== "pending") {
            setToast({
              type: rec.status === "onchain_success" ? "success" : "error",
              text: `Confirmed • gas ${formatUSD(rec.gas_usd || 0)}`,
              link: explorer,
            });
            setTimeout(() => router.replace("/(tabs)/history"), 1600);
            return;
          }
        } catch {}
        if (attempts < 12) setTimeout(poll, 10000);
        else setTimeout(() => router.replace("/(tabs)/history"), 1600);
      };
      setTimeout(poll, 6000);
    } catch (e: any) {
      const msg = e?.shortMessage || e?.reason || e?.message || "Transaction failed";
      setToast({ type: "error", text: msg });
    } finally { setExecuting(false); }
  };

  const onExecute = () => (mode === "onchain" ? executeOnChain() : executeSimulated());

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={theme.colors.brand} /></View>;
  if (!opp) {
    return (
      <View style={styles.centered} testID="opp-error">
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.error} />
        <Text style={styles.errText}>{error || "Opportunity expired"}</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}><Text style={styles.backBtnText}>GO BACK</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }} testID="opportunity-detail-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable testID="opp-back" onPress={() => router.back()} style={styles.backChip}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.onSurface} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, flex: 1 }}>
          {opp.token_image ? <Image source={{ uri: opp.token_image }} style={{ width: 36, height: 36, borderRadius: 18 }} /> : null}
          <View>
            <Text style={styles.hTitle}>{opp.pair}</Text>
            <Text style={styles.hSub}>{opp.token_name}</Text>
          </View>
        </View>
        <View style={styles.spreadBadge}>
          <Text style={styles.spreadText}>{formatPct(opp.spread_pct)}</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 240 }}>

        {/* Execution mode toggle */}
        <View style={styles.modeToggle}>
          <Pressable
            testID="mode-simulated"
            onPress={() => { setMode("simulated"); setExecutionMode("SIMULATED"); }}
            style={[styles.modeBtn, mode === "simulated" && styles.modeBtnActive]}
          >
            <Ionicons name="flask" size={14} color={mode === "simulated" ? theme.colors.onBrandPrimary : theme.colors.onSurfaceSecondary} />
            <Text style={[styles.modeText, mode === "simulated" && styles.modeTextActive]}>SIMULATED</Text>
          </Pressable>
          <Pressable
            testID="mode-onchain"
            onPress={() => {
              if (!walletConnected) {
                setToast({ type: "info", text: "Connect a wallet first" });
                connectWallet();
                return;
              }
              setMode("onchain");
              setExecutionMode("ONCHAIN");
            }}
            style={[styles.modeBtn, mode === "onchain" && styles.modeBtnActive]}
          >
            <Ionicons name="flash" size={14} color={mode === "onchain" ? theme.colors.onBrandPrimary : theme.colors.onSurfaceSecondary} />
            <Text style={[styles.modeText, mode === "onchain" && styles.modeTextActive]}>ON-CHAIN</Text>
          </Pressable>
        </View>

        {mode === "onchain" && (
          <View style={styles.walletStrip} testID="wallet-strip">
            <Ionicons name={walletConnected ? "checkmark-circle" : "alert-circle"} size={16} color={walletConnected ? theme.colors.success : theme.colors.warning} />
            <Text style={styles.walletStripText}>
              {walletConnected
                ? `Connected • ${address.slice(0, 6)}…${address.slice(-4)} • ${chain?.name || "Chain " + chainId}`
                : "Wallet not connected — sign will fail"}
            </Text>
            <Pressable testID="strip-connect" onPress={connectWallet}>
              <Text style={styles.walletStripAction}>{walletConnected ? "OK" : "CONNECT"}</Text>
            </Pressable>
          </View>
        )}

        {/* Route visualization */}
        <Text style={styles.sectionTitle}>TRADE ROUTE</Text>
        {opp.is_cross_chain && (
          <View style={styles.crossChainBanner} testID="cross-chain-banner">
            <Ionicons name="git-network" size={14} color={theme.colors.brand} />
            <Text style={styles.crossChainText}>
              Cross-chain: bridge {opp.token_symbol} from {opp.buy_dex.chain} → {opp.sell_dex.chain} via LI.FI
            </Text>
          </View>
        )}
        {opp.route?.map((step) => (
          <View key={step.step} style={styles.routeStep}>
            <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{step.step}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepAction}>{step.action}</Text>
              <Text style={styles.stepVenue}>{step.venue} • {step.chain}</Text>
            </View>
            {step.price ? <Text style={styles.stepPrice}>{formatUSD(step.price, 4)}</Text> : null}
          </View>
        ))}

        {/* Amount input */}
        <Text style={[styles.sectionTitle, { marginTop: theme.spacing.xl }]}>TRADE AMOUNT (USD)</Text>
        <View style={styles.amountBox}>
          <Text style={styles.amountPrefix}>$</Text>
          <TextInput
            testID="trade-amount-input"
            value={amount} onChangeText={setAmount}
            keyboardType="decimal-pad"
            style={styles.amountInput}
            placeholder="0" placeholderTextColor={theme.colors.onSurfaceSecondary}
          />
        </View>
        <View style={styles.quickRow}>
          {[100, 500, 1000, 5000].map((v) => (
            <Pressable key={v} testID={`quick-amt-${v}`} onPress={() => setAmount(String(v))} style={styles.quickBtn}>
              <Text style={styles.quickText}>${v.toLocaleString()}</Text>
            </Pressable>
          ))}
          {mode === "simulated" && (
            <Pressable
              testID="quick-amt-max"
              onPress={() => setAmount(String(Math.floor(user?.balance_usd || 0)))}
              style={[styles.quickBtn, { backgroundColor: theme.colors.brandTertiary, borderColor: theme.colors.brand }]}
            >
              <Text style={[styles.quickText, { color: theme.colors.brand }]}>MAX</Text>
            </Pressable>
          )}
        </View>

        {/* Breakdown */}
        <View style={styles.breakdown}>
          <BreakdownRow label="Buy price" value={formatUSD(opp.buy_price, 4)} />
          <BreakdownRow label="Sell price" value={formatUSD(opp.sell_price, 4)} />
          <BreakdownRow label="Gross profit" value={formatUSD(gross)} color={theme.colors.success} />
          <BreakdownRow label="Est. gas + fees" value={`- ${formatUSD(fees)}`} color={theme.colors.warning} />
          <BreakdownRow label="Slippage tolerance" value={`${opp.slippage_pct ?? 0.5}%`} />
          <View style={styles.brDivider} />
          <BreakdownRow label="EST. NET PROFIT" value={formatUSD(net)} big color={net >= 0 ? theme.colors.success : theme.colors.error} />
        </View>

        {mode === "onchain" ? (
          <View style={styles.warnBox}>
            <Ionicons name="warning-outline" size={18} color={theme.colors.warning} />
            <Text style={styles.warnText}>
              REAL on-chain execution. Your wallet will prompt to approve + swap on {chain?.name || "the selected chain"}. Gas is real. Verify every field before signing. Full wallet flow requires a native/dev build (Publish).
            </Text>
          </View>
        ) : (
          <View style={styles.warnBox}>
            <Ionicons name="information-circle-outline" size={18} color={theme.colors.brand} />
            <Text style={styles.warnText}>SIMULATED mode — updates your virtual balance, no real funds moved.</Text>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {toast && (
        <Pressable
          testID="toast"
          onPress={() => toast.link && Linking.openURL(toast.link)}
          style={[styles.toast, { backgroundColor: toast.type === "success" ? theme.colors.success : toast.type === "error" ? theme.colors.error : theme.colors.brand, bottom: insets.bottom + 110 }]}
        >
          <Ionicons name={toast.type === "success" ? "checkmark-circle" : "alert-circle"} size={18} color="#fff" />
          <Text style={styles.toastText}>{toast.text}</Text>
          {toast.link ? <Ionicons name="open-outline" size={16} color="#fff" /> : null}
        </Pressable>
      )}

      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ctaSmall}>{mode === "onchain" ? "MODE" : "AVAILABLE"}</Text>
          <Text style={styles.ctaBalance}>{mode === "onchain" ? "ON-CHAIN" : formatUSD(user?.balance_usd ?? 0)}</Text>
        </View>
        <Pressable
          testID="execute-trade-button" onPress={onExecute} disabled={executing}
          style={({ pressed }) => [
            styles.cta,
            mode === "onchain" && { backgroundColor: theme.colors.success },
            pressed && { opacity: 0.85 }, executing && { opacity: 0.6 }
          ]}
        >
          {executing ? <ActivityIndicator color={theme.colors.onBrandPrimary} /> : (
            <>
              <Ionicons name={mode === "onchain" ? "flash" : "flask"} size={18} color={theme.colors.onBrandPrimary} />
              <Text style={styles.ctaText}>{mode === "onchain" ? "SIGN & EXECUTE" : "EXECUTE"}</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function BreakdownRow({ label, value, color, big }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: big ? 8 : 6 }}>
      <Text style={{ color: big ? theme.colors.onSurface : theme.colors.onSurfaceSecondary, fontSize: big ? 14 : 13, fontWeight: big ? "800" : "600", letterSpacing: big ? 1 : 0 }}>{label}</Text>
      <Text style={{ color: color || theme.colors.onSurface, fontSize: big ? 20 : 14, fontWeight: big ? "900" : "700" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface, gap: 12 },
  errText: { color: theme.colors.onSurface, fontSize: 15 },
  backBtn: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.brand, marginTop: theme.spacing.md },
  backBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "900", letterSpacing: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backChip: { width: 36, height: 36, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  hTitle: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "900" },
  hSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12 },
  spreadBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: "rgba(16,185,129,0.12)", borderWidth: 1, borderColor: theme.colors.success },
  spreadText: { color: theme.colors.success, fontWeight: "900", fontSize: 14 },

  modeToggle: { flexDirection: "row", padding: 4, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.md },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: theme.radius.pill },
  modeBtnActive: { backgroundColor: theme.colors.brand },
  modeText: { color: theme.colors.onSurfaceSecondary, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  modeTextActive: { color: theme.colors.onBrandPrimary },

  walletStrip: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceTertiary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.md },
  walletStripText: { flex: 1, color: theme.colors.onSurface, fontSize: 11, fontWeight: "700" },
  walletStripAction: { color: theme.colors.brand, fontSize: 11, fontWeight: "900", letterSpacing: 1 },

  sectionTitle: { color: theme.colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.4, fontWeight: "800", marginBottom: theme.spacing.sm },
  routeStep: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.sm },
  stepBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  stepBadgeText: { color: theme.colors.brand, fontWeight: "900", fontSize: 13 },
  stepAction: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 14 },
  stepVenue: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  stepPrice: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 13 },
  amountBox: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.lg },
  amountPrefix: { color: theme.colors.onSurfaceSecondary, fontSize: 24, fontWeight: "800" },
  amountInput: { flex: 1, color: theme.colors.onSurface, fontSize: 28, fontWeight: "900", padding: theme.spacing.md },
  quickRow: { flexDirection: "row", gap: 6, marginTop: theme.spacing.sm, flexWrap: "wrap" },
  quickBtn: { paddingHorizontal: theme.spacing.md, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border },
  quickText: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 12 },
  breakdown: { marginTop: theme.spacing.xl, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md },
  brDivider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.sm },
  warnBox: { flexDirection: "row", gap: theme.spacing.sm, alignItems: "flex-start", marginTop: theme.spacing.md, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: "rgba(245,158,11,0.08)", borderWidth: 1, borderColor: "rgba(245,158,11,0.4)" },
  warnText: { color: theme.colors.onSurfaceSecondary, fontSize: 12, flex: 1, lineHeight: 18 },
  ctaWrap: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  ctaSmall: { color: theme.colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  ctaBalance: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "900" },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.colors.brand, paddingHorizontal: theme.spacing.xl, paddingVertical: 16, borderRadius: theme.radius.md, minWidth: 180 },
  ctaText: { color: theme.colors.onBrandPrimary, fontWeight: "900", letterSpacing: 1.5, fontSize: 14 },
  toast: { position: "absolute", left: theme.spacing.lg, right: theme.spacing.lg, padding: theme.spacing.md, borderRadius: theme.radius.md, flexDirection: "row", alignItems: "center", gap: 8 },
  toastText: { color: "#fff", fontWeight: "800", fontSize: 13, flex: 1 },
  crossChainBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: theme.spacing.md, marginBottom: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.brandTertiary, borderWidth: 1, borderColor: theme.colors.brand },
  crossChainText: { color: theme.colors.brand, fontSize: 12, fontWeight: "800", flex: 1 },
});
