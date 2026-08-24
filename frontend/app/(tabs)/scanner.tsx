import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  Pressable, ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, Opportunity } from "@/src/api/client";
import { theme, formatUSD, formatPct } from "@/src/theme";

const CHAIN_FILTERS = [
  { id: "all", label: "ALL" },
  { id: "Ethereum", label: "ETHEREUM" },
  { id: "BNB Chain", label: "BNB" },
  { id: "Polygon", label: "POLYGON" },
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
      if (chain !== "all") q.set("chain", chain);
      const res = await api.get<{ opportunities: Opportunity[] }>(`/scanner/opportunities?${q}`);
      setOpps(res.opportunities);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally { setLoading(false); }
  }, [chain, minSpread]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Auto refresh every 20s
  useEffect(() => {
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }} testID="scanner-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Scanner</Text>
            <Text style={styles.subtitle}>{opps.length} opportunities across DEXs</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

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
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, flex: 1 }}>
                  {item.token_image ? (
                    <Image source={{ uri: item.token_image }} style={styles.tokenImg} />
                  ) : (
                    <View style={[styles.tokenImg, { backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" }]}>
                      <Text style={{ color: theme.colors.brand, fontWeight: "900", fontSize: 12 }}>{item.token_symbol.slice(0, 2)}</Text>
                    </View>
                  )}
                  <View>
                    <Text style={styles.pair}>{item.pair}</Text>
                    <Text style={styles.token}>{item.token_name}</Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.spread}>{formatPct(item.spread_pct)}</Text>
                  <Text style={styles.spreadLabel}>SPREAD</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.routeRow}>
                <View style={styles.dexPill}>
                  <Text style={styles.dexPillLabel}>BUY</Text>
                  <Text style={styles.dexPillName}>{item.buy_dex.name}</Text>
                  <Text style={styles.dexPillPrice}>{formatUSD(item.buy_price, 4)}</Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={theme.colors.brand} />
                <View style={[styles.dexPill, { borderColor: theme.colors.brandTertiary }]}>
                  <Text style={[styles.dexPillLabel, { color: theme.colors.brand }]}>SELL</Text>
                  <Text style={styles.dexPillName}>{item.sell_dex.name}</Text>
                  <Text style={styles.dexPillPrice}>{formatUSD(item.sell_price, 4)}</Text>
                </View>
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
});
