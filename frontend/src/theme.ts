export const theme = {
  colors: {
    surface: "#0B101E",
    onSurface: "#F8FAFC",
    surfaceSecondary: "#151C2C",
    onSurfaceSecondary: "#94A3B8",
    surfaceTertiary: "#1E293B",
    onSurfaceTertiary: "#CBD5E1",
    surfaceInverse: "#FFFFFF",
    onSurfaceInverse: "#020617",
    brand: "#00E5FF",
    brandPrimary: "#00E5FF",
    onBrandPrimary: "#020617",
    brandSecondary: "#14B8A6",
    brandTertiary: "#083344",
    onBrandTertiary: "#00E5FF",
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    border: "#1E293B",
    borderStrong: "#334155",
    divider: "#1E293B",
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  font: {
    display: "System",
    text: "System",
  },
  fontSize: { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32, hero: 44 },
};

export const dexInitials = (dexId: string): string => {
  const map: Record<string, string> = {
    uniswap: "UNI",
    sushiswap: "SUS",
    pancakeswap: "PAN",
    curve: "CRV",
    balancer: "BAL",
    quickswap: "QCK",
  };
  return map[dexId] || dexId.slice(0, 3).toUpperCase();
};

export const formatUSD = (n: number, digits = 2) => {
  if (n === null || n === undefined || isNaN(n)) return "$0.00";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(digits)}`;
};

export const formatPct = (n: number, digits = 2) => {
  if (n === null || n === undefined || isNaN(n)) return "0.00%";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
};
