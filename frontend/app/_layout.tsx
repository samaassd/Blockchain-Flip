import "@walletconnect/react-native-compat";
import "react-native-get-random-values";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useMemo } from "react";
import { LogBox, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";
import { initAppKit, AppKit, AppKitProvider } from "@/src/wallet/appkit";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const appKit = useMemo(() => {
    try { return initAppKit(); } catch (e) { console.warn(e); return null; }
  }, []);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  const inner = (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.surface } }} />
      {appKit && (
        <View style={{ position: "absolute", width: "100%", height: "100%" }} pointerEvents="box-none">
          <AppKit />
        </View>
      )}
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          {appKit ? <AppKitProvider instance={appKit}>{inner}</AppKitProvider> : inner}
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
