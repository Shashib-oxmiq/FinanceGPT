// ── App Entry Point ───────────────────────────────────────────────────────────
// React Native iOS app with tab navigation + stack for auth flow
// Full 19-screen structure matching the desktop Electron app

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
import { initSyncEngine } from "./src/services/sync";

// Auth screens
import LandingScreen from "./src/screens/LandingScreen";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import AuthCallbackScreen from "./src/screens/AuthCallbackScreen";

// Main screens
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
import BundlerScreen from "./src/screens/BundlerScreen";
import FormFillerScreen from "./src/screens/FormFillerScreen";
import GoalsScreen from "./src/screens/GoalsScreen";
import ExpensesScreen from "./src/screens/ExpensesScreen";
import FamilyScreen from "./src/screens/FamilyScreen";
import SchemesScreen from "./src/screens/SchemesScreen";
import InsuranceGapScreen from "./src/screens/InsuranceGapScreen";
import MedicalRecordsScreen from "./src/screens/MedicalRecordsScreen";
import LegalRightsScreen from "./src/screens/LegalRightsScreen";
import SharedViewScreen from "./src/screens/SharedViewScreen";

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
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border, borderTopWidth: 1 },
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

  useEffect(() => {
    initDB().then(() => {
      const sync = initSyncEngine();
      if (sync.enabled) sync.start();
    }).catch(console.error);
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
            <Stack.Screen name="Landing" component={LandingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="AuthCallback" component={AuthCallbackScreen} />
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
            <Stack.Screen name="Bundler" component={BundlerScreen} />
            <Stack.Screen name="FormFiller" component={FormFillerScreen} />
            <Stack.Screen name="Goals" component={GoalsScreen} />
            <Stack.Screen name="Expenses" component={ExpensesScreen} />
            <Stack.Screen name="Family" component={FamilyScreen} />
            <Stack.Screen name="Schemes" component={SchemesScreen} />
            <Stack.Screen name="InsuranceGap" component={InsuranceGapScreen} />
            <Stack.Screen name="MedicalRecords" component={MedicalRecordsScreen} />
            <Stack.Screen name="LegalRights" component={LegalRightsScreen} />
            <Stack.Screen name="SharedView" component={SharedViewScreen} />
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