import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Pressable, Linking,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, Trade } from "@/src/api/client";
import { theme, formatUSD, formatPct } from "@/src/theme";

type HistoryData = {
  trades: Trade[]; total_trades: number; total_profit: number; win_rate: number;
};

const TABS = [
  { id: "all", label: "ALL" },
  { id: "profit", label: "PROFIT" },
  { id: "loss", label: "LOSS" },
];

export default function History() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const res = await api.get<HistoryData>("/trades/history?limit=200");
      setData(res);
    } catch (e) {
      // silent
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const trades = (data?.trades || []).filter((t) => {
    if (filter === "profit") return t.net_profit > 0;
    if (filter === "loss") return t.net_profit <= 0;
    return true;
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }} testID="history-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>History</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>TOTAL P&L</Text>
            <Text style={[styles.statVal, { color: (data?.total_profit ?? 0) >= 0 ? theme.colors.success : theme.colors.error }]} testID="history-total-pnl">
              {formatUSD(data?.total_profit ?? 0)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>TRADES</Text>
            <Text style={styles.statVal}>{data?.total_trades ?? 0}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>WIN RATE</Text>
            <Text style={[styles.statVal, { color: theme.colors.brand }]}>{data?.win_rate ?? 0}%</Text>
          </View>
        </View>
        <View style={styles.segRow}>
          {TABS.map((t) => (
            <Pressable
              key={t.id}
              testID={`history-tab-${t.id}`}
              onPress={() => setFilter(t.id)}
              style={[styles.seg, filter === t.id && styles.segActive]}
            >
              <Text style={[styles.segText, filter === t.id && styles.segTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={theme.colors.brand} /></View>
      ) : (
        <FlatList
          data={trades}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.brand} />}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="clipboard-outline" size={48} color={theme.colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No trade history yet</Text>
            </View>
          }
          renderItem={({ item }) => {
            const win = item.net_profit > 0;
            const explorer = item.explorer_url || (item.tx_hash && item.chain_id ? explorerFor(item.chain_id, item.tx_hash) : "");
            const onOpen = () => { if (explorer) Linking.openURL(explorer).catch(() => {}); };
            const RowWrap: any = explorer ? Pressable : View;
            return (
              <RowWrap
                testID={`trade-row-${item.id}`}
                onPress={explorer ? onOpen : undefined}
                style={styles.row}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, flex: 1 }}>
                  {item.token_image ? (
                    <Image source={{ uri: item.token_image }} style={styles.icon} />
                  ) : (
                    <View style={[styles.icon, { backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" }]}>
                      <Text style={{ color: theme.colors.brand, fontWeight: "900", fontSize: 10 }}>{item.token_symbol.slice(0, 2)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.pair}>{item.pair}</Text>
                      {item.mode === "ONCHAIN" && (
                        <View style={styles.chainBadge}><Text style={styles.chainBadgeText}>ON-CHAIN</Text></View>
                      )}
                    </View>
                    <Text style={styles.route}>{item.buy_dex} → {item.sell_dex}</Text>
                    <Text style={styles.date}>{new Date(item.executed_at).toLocaleString()}</Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.pnl, { color: win ? theme.colors.success : theme.colors.error }]}>{formatUSD(item.net_profit)}</Text>
                  <Text style={styles.spread}>{formatPct(item.spread_pct)}</Text>
                  <Text style={styles.amount}>on {formatUSD(item.amount_usd)}</Text>
                  {explorer ? (
                    <View style={styles.explorerHint} testID={`explorer-${item.id}`}>
                      <Ionicons name="open-outline" size={11} color={theme.colors.brand} />
                      <Text style={styles.explorerHintText}>VIEW TX</Text>
                    </View>
                  ) : null}
                </View>
              </RowWrap>
            );
          }}
        />
      )}
    </View>
  );
}

// Explorer URL helper — supports EVM chains + Solana
function explorerFor(chainId: number, txHash: string): string {
  const map: Record<number, string> = {
    1: "https://etherscan.io/tx/",
    137: "https://polygonscan.com/tx/",
    56: "https://bscscan.com/tx/",
    42161: "https://arbiscan.io/tx/",
    8453: "https://basescan.org/tx/",
    480: "https://worldscan.org/tx/",
    360: "https://shapescan.xyz/tx/",
    101: "https://solscan.io/tx/",
  };
  return `${map[chainId] || "https://etherscan.io/tx/"}${txHash}`;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  title: { color: theme.colors.onSurface, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  statsRow: { flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.md },
  stat: { flex: 1, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  statLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  statVal: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "900", marginTop: 4 },
  segRow: { flexDirection: "row", marginTop: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: 4, borderWidth: 1, borderColor: theme.colors.border },
  seg: { flex: 1, paddingVertical: theme.spacing.sm, alignItems: "center", borderRadius: theme.radius.sm },
  segActive: { backgroundColor: theme.colors.brandTertiary },
  segText: { color: theme.colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  segTextActive: { color: theme.colors.brand },
  row: { flexDirection: "row", padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center" },
  icon: { width: 36, height: 36, borderRadius: 18 },
  pair: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 15 },
  route: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  date: { color: theme.colors.onSurfaceSecondary, fontSize: 10, marginTop: 2 },
  pnl: { fontSize: 18, fontWeight: "900" },
  spread: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  amount: { color: theme.colors.onSurfaceSecondary, fontSize: 10, marginTop: 2 },
  empty: { padding: theme.spacing.xxxl, alignItems: "center", gap: theme.spacing.md },
  emptyText: { color: theme.colors.onSurfaceSecondary, fontSize: 14 },
  chainBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandTertiary, borderWidth: 1, borderColor: theme.colors.brand },
  chainBadgeText: { color: theme.colors.brand, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  explorerHint: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  explorerHintText: { color: theme.colors.brand, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
});
