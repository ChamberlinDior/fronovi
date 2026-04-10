import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, setRuntimeBaseUrl } from '../api/client';
import {
  clearSession,
  loadBaseUrl,
  loadSession,
  saveBaseUrl,
  saveSession,
} from '../storage/session';
import {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  UserResponse,
} from '../types/api';

interface AuthContextValue {
  user: UserResponse | null;
  session: AuthResponse | null;
  loading: boolean;
  apiBaseUrl: string;
  login: (payload: LoginPayload) => Promise<void>;
  registerDriver: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshLocalSession: () => Promise<void>;
  updateApiBaseUrl: (url: string) => Promise<void>;
}

const DEFAULT_API_BASE_URL = 'http://192.168.1.125:8080/api/v1';

function normalizeBaseUrl(url?: string | null) {
  const value = (url || '').trim();
  if (!value) return DEFAULT_API_BASE_URL;
  return value.replace(/\/+$/, '');
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [savedSession, savedBaseUrl] = await Promise.all([
          loadSession(),
          loadBaseUrl(),
        ]);

        const normalizedUrl = normalizeBaseUrl(savedBaseUrl);

        if (!mounted) return;

        setSession(savedSession || null);
        setApiBaseUrl(normalizedUrl);
        await setRuntimeBaseUrl(normalizedUrl);
      } catch (error) {
        if (!mounted) return;

        setSession(null);
        setApiBaseUrl(DEFAULT_API_BASE_URL);
        await setRuntimeBaseUrl(DEFAULT_API_BASE_URL);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user || null,
      session,
      loading,
      apiBaseUrl,

      async login(payload) {
        const normalizedUrl = normalizeBaseUrl(apiBaseUrl);
        await setRuntimeBaseUrl(normalizedUrl);

        const response = await apiRequest<AuthResponse>(
          '/auth/login',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          false
        );

        setSession(response.data);
        await saveSession(response.data);
      },

      async registerDriver(payload) {
        const normalizedUrl = normalizeBaseUrl(apiBaseUrl);
        await setRuntimeBaseUrl(normalizedUrl);

        await apiRequest(
          '/auth/register',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          false
        );
      },

      async logout() {
        try {
          await apiRequest('/auth/logout', { method: 'POST' }, true, false);
        } catch {
        } finally {
          await clearSession();
          setSession(null);
        }
      },

      async refreshLocalSession() {
        const saved = await loadSession();
        setSession(saved || null);
      },

      async updateApiBaseUrl(url) {
        const normalizedUrl = normalizeBaseUrl(url);
        await saveBaseUrl(normalizedUrl);
        await setRuntimeBaseUrl(normalizedUrl);
        setApiBaseUrl(normalizedUrl);
      },
    }),
    [apiBaseUrl, loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}