import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  Pressable, ImageBackground, FlatList,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, Opportunity } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, formatUSD, formatPct } from "@/src/theme";

type Portfolio = {
  balance_usd: number; total_pnl: number; total_trades: number;
  win_rate: number; pnl_24h: number; trades_24h: number;
  recent_trades: any[];
};

type MarketOverview = { tokens: any[]; total_market_cap: number };

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [market, setMarket] = useState<MarketOverview | null>(null);
  const [topOpps, setTopOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, m, o] = await Promise.all([
        api.get<Portfolio>("/portfolio/summary"),
        api.get<MarketOverview>("/market/overview"),
        api.get<{ opportunities: Opportunity[] }>("/scanner/opportunities?min_spread=0.2"),
      ]);
      setPortfolio(p); setMarket(m); setTopOpps(o.opportunities.slice(0, 3));
      await refreshUser();
    } catch (e) {
      // silent for dashboard load - individual sections handle it
    } finally { setLoading(false); }
  }, [refreshUser]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const pnl = portfolio?.total_pnl ?? 0;
  const pnlColor = pnl >= 0 ? theme.colors.success : theme.colors.error;

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={theme.colors.brand} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }} testID="dashboard-screen">
      <ImageBackground
        source={{ uri: "https://images.unsplash.com/photo-1639322537231-2f206e06af84?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwyfHxhYnN0cmFjdCUyMGRhcmslMjBjcnlwdG8lMjBibG9ja2NoYWluJTIwZ3JpZHxlbnwwfHx8fDE3ODc1NjIzNzd8MA&ixlib=rb-4.1.0&q=85" }}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
        imageStyle={{ opacity: 0.35 }}
      >
        <LinearGradient colors={["rgba(11,16,30,0.2)", theme.colors.surface]} style={StyleSheet.absoluteFill} />
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.hello}>Welcome back</Text>
            <Text style={styles.userName} testID="dashboard-user-name">{user?.display_name || user?.email}</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        <Text style={styles.balanceLabel}>PORTFOLIO BALANCE</Text>
        <Text style={styles.balance} testID="dashboard-balance">{formatUSD(portfolio?.balance_usd ?? 0)}</Text>
        <View style={styles.pnlRow}>
          <Ionicons name={pnl >= 0 ? "trending-up" : "trending-down"} size={16} color={pnlColor} />
          <Text style={[styles.pnlText, { color: pnlColor }]} testID="dashboard-pnl">
            {formatUSD(pnl)} total P&L
          </Text>
        </View>
      </ImageBackground>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.brand} />}
      >
        {/* Stat cards */}
        <View style={styles.statsRow}>
          <StatCard label="24H P&L" value={formatUSD(portfolio?.pnl_24h ?? 0)} accent={portfolio && portfolio.pnl_24h >= 0 ? theme.colors.success : theme.colors.error} testID="stat-24h-pnl" />
          <StatCard label="TRADES" value={String(portfolio?.total_trades ?? 0)} testID="stat-total-trades" />
          <StatCard label="WIN RATE" value={`${portfolio?.win_rate ?? 0}%`} accent={theme.colors.brand} testID="stat-win-rate" />
        </View>

        {/* Top opportunities */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>TOP OPPORTUNITIES</Text>
            <Pressable testID="see-all-opps" onPress={() => router.push("/(tabs)/scanner")}>
              <Text style={styles.sectionLink}>See all →</Text>
            </Pressable>
          </View>
          {topOpps.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="pulse-outline" size={28} color={theme.colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No opportunities yet</Text>
            </View>
          ) : (
            topOpps.map((op) => (
              <Pressable
                key={op.id} testID={`dashboard-opp-${op.token_symbol}`}
                onPress={() => router.push(`/opportunity/${encodeURIComponent(op.id)}`)}
                style={({ pressed }) => [styles.oppMini, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.oppLeft}>
                  {op.token_image ? (
                    <Image source={{ uri: op.token_image }} style={styles.tokenIcon} />
                  ) : (
                    <View style={[styles.tokenIcon, { backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" }]}>
                      <Text style={{ color: theme.colors.brand, fontWeight: "900", fontSize: 12 }}>{op.token_symbol.slice(0, 2)}</Text>
                    </View>
                  )}
                  <View>
                    <Text style={styles.oppPair}>{op.pair}</Text>
                    <Text style={styles.oppMeta}>{op.buy_dex.name} → {op.sell_dex.name}</Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.spread}>{formatPct(op.spread_pct)}</Text>
                  <Text style={styles.oppMeta}>gas ~{formatUSD(op.estimated_gas_usd)}</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>

        {/* Market overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MARKET</Text>
          <FlatList
            horizontal
            data={market?.tokens || []}
            keyExtractor={(t) => t.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.spacing.md, paddingRight: theme.spacing.lg }}
            renderItem={({ item }) => (
              <View style={styles.marketCard} testID={`market-${item.symbol}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {item.image ? <Image source={{ uri: item.image }} style={{ width: 24, height: 24, borderRadius: 12 }} /> : null}
                  <Text style={styles.marketSymbol}>{item.symbol}</Text>
                </View>
                <Text style={styles.marketPrice}>{formatUSD(item.price ?? 0, 2)}</Text>
                <Text style={[styles.marketChange, { color: (item.change_24h ?? 0) >= 0 ? theme.colors.success : theme.colors.error }]}>
                  {formatPct(item.change_24h ?? 0)}
                </Text>
              </View>
            )}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, accent, testID }: { label: string; value: string; accent?: string; testID?: string }) {
  return (
    <View style={styles.statCard} testID={testID}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  header: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xl, backgroundColor: theme.colors.surface },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.spacing.xl },
  hello: { color: theme.colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1 },
  userName: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "800", marginTop: 2 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandTertiary },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.brand },
  liveText: { color: theme.colors.brand, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  balanceLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.5, fontWeight: "700" },
  balance: { color: theme.colors.onSurface, fontSize: 44, fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  pnlRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: theme.spacing.xs },
  pnlText: { fontSize: 14, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: theme.spacing.md, paddingHorizontal: theme.spacing.xl, marginTop: -theme.spacing.md },
  statCard: { flex: 1, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  statLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  statValue: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "900", marginTop: 4 },
  section: { marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.xl },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.spacing.md },
  sectionTitle: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "800", letterSpacing: 1.4, marginBottom: theme.spacing.md },
  sectionLink: { color: theme.colors.brand, fontSize: 13, fontWeight: "700" },
  emptyBox: { padding: theme.spacing.xl, alignItems: "center", backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  emptyText: { color: theme.colors.onSurfaceSecondary, marginTop: 8, fontSize: 13 },
  oppMini: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  oppLeft: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  tokenIcon: { width: 32, height: 32, borderRadius: 16 },
  oppPair: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 15 },
  oppMeta: { color: theme.colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  spread: { color: theme.colors.success, fontWeight: "900", fontSize: 16 },
  marketCard: { width: 130, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, gap: 4 },
  marketSymbol: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 14 },
  marketPrice: { color: theme.colors.onSurface, fontSize: 15, fontWeight: "700", marginTop: 6 },
  marketChange: { fontSize: 12, fontWeight: "700" },
});
