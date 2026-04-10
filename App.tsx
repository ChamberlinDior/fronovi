import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { RidesScreen } from './src/screens/RidesScreen';
import { WalletScreen } from './src/screens/WalletScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { theme } from './src/constants/theme';

function Root() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<'dashboard' | 'rides' | 'wallet' | 'profile'>('dashboard');

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.loading}>Chargement…</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        {tab === 'dashboard' && <DashboardScreen />}
        {tab === 'rides' && <RidesScreen />}
        {tab === 'wallet' && <WalletScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </View>

      <View style={styles.tabBar}>
        {[
          ['dashboard', 'Accueil'],
          ['rides', 'Courses'],
          ['wallet', 'Wallet'],
          ['profile', 'Profil'],
        ].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setTab(key as 'dashboard' | 'rides' | 'wallet' | 'profile')}
            style={[styles.tabItem, tab === key && styles.tabItemActive]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
  },
  loading: { color: theme.colors.text, fontSize: 18, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 18,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
  },
  tabItemActive: { backgroundColor: theme.colors.primary },
  tabText: { color: theme.colors.textMuted, fontWeight: '700' },
  tabTextActive: { color: theme.colors.white },
});