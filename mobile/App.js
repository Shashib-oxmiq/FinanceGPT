import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View } from "react-native";

import { AuthProvider, useAuth } from "./src/AuthContext";
import { theme } from "./src/theme";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import ChatScreen from "./src/screens/ChatScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import InsuranceScreen from "./src/screens/InsuranceScreen";
import VaultScreen from "./src/screens/VaultScreen";
import LegacyScreen from "./src/screens/LegacyScreen";
import InsightsScreen from "./src/screens/InsightsScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const ICONS = {
  Advisor: "chatbubbles",
  Home: "grid",
  Money: "trending-up",
  Insurance: "shield-checkmark",
  Vault: "folder",
  Legacy: "heart",
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: theme.card },
        headerTitleStyle: { color: theme.text, fontWeight: "800" },
        headerTintColor: theme.text,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name] || "ellipse"} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Advisor" component={ChatScreen} />
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Money" component={InsightsScreen} />
      <Tab.Screen name="Insurance" component={InsuranceScreen} />
      <Tab.Screen name="Vault" component={VaultScreen} />
      <Tab.Screen name="Legacy" component={LegacyScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <Stack.Screen name="Tabs" component={Tabs} />
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

const navTheme = {
  dark: true,
  colors: {
    primary: theme.primary,
    background: theme.bg,
    card: theme.card,
    text: theme.text,
    border: theme.border,
    notification: theme.primary,
  },
};

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={navTheme}>
        <Root />
      </NavigationContainer>
    </AuthProvider>
  );
}
