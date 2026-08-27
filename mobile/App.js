// ── App Entry Point ───────────────────────────────────────────────────────────
// React Native iOS app with tab navigation + stack for auth flow
// Mirrors the Electron app's 13-page structure

import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { LanguageProvider } from "./src/contexts/LanguageContext";
import { theme } from "./src/theme";
import { initDB } from "./src/services/db";

// Screens
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import ChatScreen from "./src/screens/ChatScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import InvestmentsScreen from "./src/screens/InvestmentsScreen";
import LoanPrepScreen from "./src/screens/LoanPrepScreen";
import InsuranceScreen from "./src/screens/InsuranceScreen";
import VaultScreen from "./src/screens/VaultScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import RemindersScreen from "./src/screens/RemindersScreen";
import LifeEventsScreen from "./src/screens/LifeEventsScreen";
import GmailScreen from "./src/screens/GmailScreen";
import InsightsScreen from "./src/screens/InsightsScreen";
import LegacyScreen from "./src/screens/LegacyScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Chat: "chatbubbles",
  Home: "grid",
  Money: "trending-up",
  Insurance: "shield-checkmark",
  Forms: "document-text",
  Vault: "folder",
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name] || "ellipse"} size={size} color={color} />
        ),
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      })}
    >
      <Tab.Screen name="Chat" component={ChatScreen} options={{ tabBarLabel: "Advisor" }} />
      <Tab.Screen name="Home" component={DashboardScreen} options={{ tabBarLabel: "Home" }} />
      <Tab.Screen name="Money" component={InvestmentsScreen} options={{ tabBarLabel: "Money" }} />
      <Tab.Screen name="Insurance" component={InsuranceScreen} />
      <Tab.Screen name="Forms" component={LoanPrepScreen} options={{ tabBarLabel: "Forms" }} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  // Initialize database on app start
  useEffect(() => {
    initDB().catch(console.error);
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={{ color: theme.muted, marginTop: 12, fontSize: 12, letterSpacing: 3, textTransform: "uppercase" }}>
          Securing session…
        </Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Vault" component={VaultScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Reminders" component={RemindersScreen} />
            <Stack.Screen name="LifeEvents" component={LifeEventsScreen} />
            <Stack.Screen name="Gmail" component={GmailScreen} />
            <Stack.Screen name="Insights" component={InsightsScreen} />
            <Stack.Screen name="Legacy" component={LegacyScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LanguageProvider>
          <AppContent />
          <StatusBar style="light" />
        </LanguageProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}