import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthResponse } from '../types/api';

const KEYS = {
  session: 'oviro_driver_session',
  apiBaseUrl: 'oviro_driver_api_base_url'
};

export async function saveSession(session: AuthResponse) {
  await AsyncStorage.setItem(KEYS.session, JSON.stringify(session));
}

export async function loadSession(): Promise<AuthResponse | null> {
  const raw = await AsyncStorage.getItem(KEYS.session);
  return raw ? JSON.parse(raw) : null;
}

export async function clearSession() {
  await AsyncStorage.removeItem(KEYS.session);
}

export async function saveBaseUrl(url: string) {
  await AsyncStorage.setItem(KEYS.apiBaseUrl, url.trim());
}

export async function loadBaseUrl() {
  return (await AsyncStorage.getItem(KEYS.apiBaseUrl)) || 'http://192.168.1.125:8080/api/v1';
}
