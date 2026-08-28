import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  Pressable, ScrollView, Linking,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, Opportunity, Trade } from "@/src/api/client";
import { useSettings } from "@/src/context/SettingsContext";
import { useAuth } from "@/src/context/AuthContext";
import { explorerTokenUrl } from "@/src/wallet/contracts";
import { theme, formatUSD, formatPct } from "@/src/theme";

/** Explorer page for the token — buy chain first, then sell chain, then CoinGecko. */
function tokenExplorerLink(o: Opportunity, chainId?: number): string {
  if (chainId != null) {
    const url = explorerTokenUrl(o.token_id, o.token_symbol, chainId);
    if (url) return url;
  }
  return (
    explorerTokenUrl(o.token_id, o.token_symbol, o.buy_dex.chain_id) ||
    explorerTokenUrl(o.token_id, o.token_symbol, o.sell_dex.chain_id) ||
    `https://www.coingecko.com/en/coins/${o.token_id}`
  );
}

function openExplorer(url: string) {
  Linking.openURL(url).catch(() => {});
}

const CHAIN_FILTERS = [
  { id: "all", label: "ALL" },
  { id: "Ethereum", label: "ETHEREUM" },
  { id: "BNB Chain", label: "BNB" },
  { id: "Polygon", label: "POLYGON" },
  { id: "Base", label: "BASE" },
  { id: "Solana", label: "SOLANA" },
  { id: "cross", label: "CROSS-CHAIN" },
];

export default function Scanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chain, setChain] = useState("all");
  const [minSpread, setMinSpread] = useState(0.15);
  const [error, setError] = useState<string>("");

  const load = useCallback(async () => {
    try {
      setError("");
      const q = new URLSearchParams({ min_spread: String(minSpread) });
      if (chain !== "all" && chain !== "cross") q.set("chain", chain);
      const res = await api.get<{ opportunities: Opportunity[] }>(`/scanner/opportunities?${q}`);
      let list = res.opportunities;
      if (chain === "cross") list = list.filter((o) => o.is_cross_chain);
      setOpps(list);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally { setLoading(false); }
  }, [chain, minSpread]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Auto refresh honoring user preference (0 = off)
  const { autoRefreshSec, autoMode, autoMinNet, autoTradeSize } = useSettings();
  const { refreshUser } = useAuth();
  useEffect(() => {
    if (!autoRefreshSec) return;
    const id = setInterval(load, autoRefreshSec * 1000);
    return () => clearInterval(id);
  }, [load, autoRefreshSec]);

  // --- AUTO MODE: execute simulated trades when estimated net clears the threshold ---
  const lastExecRef = useRef<Map<string, number>>(new Map()); // token_id -> last exec ts
  const autoBusyRef = useRef(false);
  const [autoLog, setAutoLog] = useState<{ text: string; positive: boolean } | null>(null);
  const [autoCount, setAutoCount] = useState(0);

  useEffect(() => {
    if (!autoMode) { setAutoLog(null); return; }
  }, [autoMode]);

  useEffect(() => {
    if (!autoMode || autoBusyRef.current || opps.length === 0) return;
    (async () => {
      autoBusyRef.current = true;
      try {
        const COOLDOWN_MS = 90_000;
        const now = Date.now();
        const estNet = (o: Opportunity) =>
          autoTradeSize * (o.spread_pct / 100) - o.estimated_gas_usd - (o.buy_dex.fee + o.sell_dex.fee) * autoTradeSize;
        const candidates = opps
          .filter((o) => estNet(o) >= autoMinNet && now - (lastExecRef.current.get(o.token_id) || 0) > COOLDOWN_MS)
          .sort((a, b) => estNet(b) - estNet(a))
          .slice(0, 2); // max 2 per refresh cycle
        for (const o of candidates) {
          lastExecRef.current.set(o.token_id, Date.now());
          try {
            const res = await api.post<Trade>("/trades/execute", { opportunity_id: o.id, amount_usd: autoTradeSize });
            setAutoCount((c) => c + 1);
            setAutoLog({
              text: `${o.token_symbol} • ${res.net_profit >= 0 ? "+" : ""}${formatUSD(res.net_profit)} net`,
              positive: res.net_profit >= 0,
            });
            refreshUser().catch(() => {});
          } catch (e: any) {
            if (e?.status === 400) { // insufficient balance — stop trying this cycle
              setAutoLog({ text: "Paused — insufficient balance", positive: false });
              break;
            }
          }
        }
      } finally {
        autoBusyRef.current = false;
      }
    })();
  }, [opps, autoMode, autoMinNet, autoTradeSize, refreshUser]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }} testID="scanner-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Scanner</Text>
            <Text style={styles.subtitle}>{opps.length} opportunities across DEXs</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {autoMode && (
              <View style={[styles.liveBadge, { backgroundColor: "rgba(34,197,94,0.15)" }]} testID="auto-badge">
                <View style={[styles.liveDot, { backgroundColor: theme.colors.success }]} />
                <Text style={[styles.liveText, { color: theme.colors.success }]}>AUTO</Text>
              </View>
            )}
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
        </View>

        {autoMode && (
          <View style={styles.autoStrip} testID="auto-strip">
            <Ionicons name="hardware-chip" size={14} color={theme.colors.success} />
            <Text style={styles.autoStripText} numberOfLines={1}>
              {autoLog
                ? `Auto trade: ${autoLog.text}`
                : `Watching for ≥ $${autoMinNet} net @ $${autoTradeSize.toLocaleString()}`}
            </Text>
            {autoCount > 0 && (
              <View style={styles.autoCountBadge} testID="auto-count">
                <Text style={styles.autoCountText}>{autoCount}</Text>
              </View>
            )}
          </View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={{ marginTop: theme.spacing.md }}
        >
          {CHAIN_FILTERS.map((c) => {
            const active = chain === c.id;
            return (
              <Pressable
                key={c.id}
                testID={`chip-chain-${c.id}`}
                onPress={() => setChain(c.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
          <View style={{ width: 1, height: 28, backgroundColor: theme.colors.border, marginHorizontal: 4 }} />
          {[0.15, 0.5, 1.0].map((s) => {
            const active = minSpread === s;
            return (
              <Pressable
                key={s}
                testID={`chip-spread-${s}`}
                onPress={() => setMinSpread(s)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>≥ {s}%</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={theme.colors.brand} /></View>
      ) : (
        <FlatList
          data={opps}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 24, paddingTop: theme.spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.brand} />}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="pulse-outline" size={48} color={theme.colors.onSurfaceSecondary} />
              <Text style={styles.emptyTitle}>{error || "No current arbitrage opportunities"}</Text>
              <Pressable onPress={onRefresh} style={styles.refreshBtn}>
                <Text style={styles.refreshText}>REFRESH</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`opp-card-${item.token_symbol}`}
              onPress={() => router.push(`/opportunity/${encodeURIComponent(item.id)}`)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
            >
              <View style={styles.cardTop}>
                <Pressable
                  testID={`token-link-${item.token_symbol}`}
                  onPress={() => openExplorer(tokenExplorerLink(item))}
                  hitSlop={6}
                  style={({ pressed }) => [
                    { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, flex: 1 },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  {item.token_image ? (
                    <Image source={{ uri: item.token_image }} style={styles.tokenImg} />
                  ) : (
                    <View style={[styles.tokenImg, { backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" }]}>
                      <Text style={{ color: theme.colors.brand, fontWeight: "900", fontSize: 12 }}>{item.token_symbol.slice(0, 2)}</Text>
                    </View>
                  )}
                  <View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.pair}>{item.pair}</Text>
                      <Ionicons name="open-outline" size={13} color={theme.colors.onSurfaceSecondary} />
                      {item.is_cross_chain && (
                        <View style={styles.crossBadge} testID={`cross-${item.token_symbol}`}>
                          <Ionicons name="git-network" size={10} color={theme.colors.brand} />
                          <Text style={styles.crossBadgeText}>CROSS</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.token}>{item.token_name}</Text>
                  </View>
                </Pressable>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.spread}>{formatPct(item.spread_pct)}</Text>
                  <Text style={styles.spreadLabel}>SPREAD</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.routeRow}>
                <Pressable
                  testID={`buy-link-${item.token_symbol}`}
                  onPress={() => openExplorer(tokenExplorerLink(item, item.buy_dex.chain_id))}
                  style={({ pressed }) => [styles.dexPill, pressed && { opacity: 0.6 }]}
                >
                  <View style={styles.dexPillTop}>
                    <Text style={styles.dexPillLabel}>BUY • {item.buy_dex.chain.toUpperCase()}</Text>
                    <Ionicons name="open-outline" size={11} color={theme.colors.onSurfaceSecondary} />
                  </View>
                  <Text style={styles.dexPillName}>{item.buy_dex.name}</Text>
                  <Text style={styles.dexPillPrice}>{formatUSD(item.buy_price, 4)}</Text>
                </Pressable>
                <Ionicons name="arrow-forward" size={18} color={theme.colors.brand} />
                <Pressable
                  testID={`sell-link-${item.token_symbol}`}
                  onPress={() => openExplorer(tokenExplorerLink(item, item.sell_dex.chain_id))}
                  style={({ pressed }) => [styles.dexPill, { borderColor: theme.colors.brandTertiary }, pressed && { opacity: 0.6 }]}
                >
                  <View style={styles.dexPillTop}>
                    <Text style={[styles.dexPillLabel, { color: theme.colors.brand }]}>SELL • {item.sell_dex.chain.toUpperCase()}</Text>
                    <Ionicons name="open-outline" size={11} color={theme.colors.brand} />
                  </View>
                  <Text style={styles.dexPillName}>{item.sell_dex.name}</Text>
                  <Text style={styles.dexPillPrice}>{formatUSD(item.sell_price, 4)}</Text>
                </Pressable>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.meta}><Text style={styles.metaLabel}>GAS</Text><Text style={styles.metaVal}>{formatUSD(item.estimated_gas_usd)}</Text></View>
                <View style={styles.meta}><Text style={styles.metaLabel}>LIQ.</Text><Text style={styles.metaVal}>{formatUSD(item.liquidity_usd)}</Text></View>
                <View style={styles.meta}><Text style={styles.metaLabel}>CONF.</Text><Text style={styles.metaVal}>{Math.round(item.confidence * 100)}%</Text></View>
                <View style={styles.meta}><Text style={styles.metaLabel}>EXP.</Text><Text style={styles.metaVal}>{item.expires_in_sec}s</Text></View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  title: { color: theme.colors.onSurface, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandTertiary },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.brand },
  liveText: { color: theme.colors.brand, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  autoStrip: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.md, paddingVertical: 8, borderRadius: theme.radius.md, backgroundColor: "rgba(34,197,94,0.08)", borderWidth: 1, borderColor: "rgba(34,197,94,0.35)" },
  autoStripText: { color: theme.colors.success, fontSize: 12, fontWeight: "800", flex: 1 },
  autoCountBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.success, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  autoCountText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  chipsRow: { gap: theme.spacing.sm, paddingRight: theme.spacing.xl, alignItems: "center" },
  chip: { height: 36, flexShrink: 0, paddingHorizontal: 14, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: theme.colors.brandTertiary, borderColor: theme.colors.brand },
  chipText: { color: theme.colors.onSurfaceSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  chipTextActive: { color: theme.colors.brand },
  card: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tokenImg: { width: 40, height: 40, borderRadius: 20 },
  pair: { color: theme.colors.onSurface, fontWeight: "900", fontSize: 17 },
  token: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  spread: { color: theme.colors.success, fontSize: 24, fontWeight: "900" },
  spreadLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.md },
  routeRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  dexPill: { flex: 1, backgroundColor: theme.colors.surfaceTertiary, padding: theme.spacing.sm, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border },
  dexPillTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dexPillLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  dexPillName: { color: theme.colors.onSurface, fontSize: 14, fontWeight: "800", marginTop: 2 },
  dexPillPrice: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: theme.spacing.md, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border },
  meta: { alignItems: "center" },
  metaLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  metaVal: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "800", marginTop: 2 },
  empty: { padding: theme.spacing.xxl, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, marginTop: theme.spacing.xxxl },
  emptyTitle: { color: theme.colors.onSurface, fontSize: 15, textAlign: "center" },
  refreshBtn: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.brand, marginTop: theme.spacing.md },
  refreshText: { color: theme.colors.onBrandPrimary, fontWeight: "900", letterSpacing: 1 },
  crossBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandTertiary },
  crossBadgeText: { color: theme.colors.brand, fontWeight: "900", fontSize: 9, letterSpacing: 0.5 },
});
