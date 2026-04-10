import { loadBaseUrl, loadSession, saveSession, clearSession } from '../storage/session';
import { ApiResponse, AuthResponse } from '../types/api';

let memoryBaseUrl = 'http://192.168.1.125:8080/api/v1';
let refreshing = false;

export class ApiHttpError extends Error {
  status?: number;
  errorCode?: string;
  validationErrors?: Record<string, string>;
  raw?: any;

  constructor(
    message: string,
    options?: {
      status?: number;
      errorCode?: string;
      validationErrors?: Record<string, string>;
      raw?: any;
    }
  ) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = options?.status;
    this.errorCode = options?.errorCode;
    this.validationErrors = options?.validationErrors;
    this.raw = options?.raw;
  }
}

export async function setRuntimeBaseUrl(url: string) {
  memoryBaseUrl = (url || '').trim().replace(/\/+$/, '');
}

export async function getRuntimeBaseUrl() {
  const stored = await loadBaseUrl();
  const next = (stored || memoryBaseUrl || 'http://192.168.1.125:8080/api/v1')
    .trim()
    .replace(/\/+$/, '');
  memoryBaseUrl = next;
  return next;
}

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!text) return null;

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return { rawText: text };
    }
  }

  return { rawText: text };
}

async function refreshAccessToken(session: AuthResponse): Promise<AuthResponse | null> {
  if (refreshing) return null;
  refreshing = true;

  try {
    const baseUrl = await getRuntimeBaseUrl();

    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });

    const json = await parseResponseBody(response);

    if (!response.ok || !json?.success || !json?.data) {
      return null;
    }

    await saveSession(json.data);
    return json.data as AuthResponse;
  } catch {
    return null;
  } finally {
    refreshing = false;
  }
}

function buildHttpErrorMessage(status: number, body: any, baseUrl: string, path: string) {
  const backendMessage = body?.message || body?.error || body?.rawText;

  if (status === 401) {
    return backendMessage || `Session expirée ou invalide sur ${path}. Reconnecte-toi.`;
  }

  if (status === 403) {
    return (
      backendMessage ||
      `Accès refusé (403) sur ${path}. Le token est peut-être expiré, invalide, ou le rôle DRIVER n'est pas reconnu.`
    );
  }

  if (status === 404) {
    return backendMessage || `Endpoint introuvable: ${baseUrl}${path}`;
  }

  if (status === 422 || status === 400) {
    return backendMessage || `Requête invalide envoyée au backend sur ${path}.`;
  }

  return backendMessage || `Erreur HTTP ${status}`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
  retry = true
): Promise<ApiResponse<T>> {
  const baseUrl = await getRuntimeBaseUrl();
  const session = await loadSession();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (!isFormData && hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth && session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    });
  } catch (networkError: any) {
    throw new ApiHttpError(
      `Erreur réseau. Impossible de joindre le backend à ${baseUrl}. Vérifie l’IP, le port, le Wi-Fi, et que Spring Boot tourne bien.`,
      { raw: networkError }
    );
  }

  const body = await parseResponseBody(response);

  const shouldTryRefresh =
    auth &&
    retry &&
    session?.refreshToken &&
    (response.status === 401 || response.status === 403);

  if (shouldTryRefresh) {
    const refreshed = await refreshAccessToken(session);

    if (refreshed?.accessToken) {
      return apiRequest<T>(path, options, auth, false);
    }

    await clearSession();

    throw new ApiHttpError(
      buildHttpErrorMessage(response.status, body, baseUrl, path),
      {
        status: response.status,
        errorCode: body?.errorCode,
        validationErrors: body?.validationErrors,
        raw: body,
      }
    );
  }

  if (!response.ok) {
    throw new ApiHttpError(
      buildHttpErrorMessage(response.status, body, baseUrl, path),
      {
        status: response.status,
        errorCode: body?.errorCode,
        validationErrors: body?.validationErrors,
        raw: body,
      }
    );
  }

  if (!body?.success) {
    throw new ApiHttpError(
      body?.message || 'Le backend a répondu sans succès.',
      {
        status: response.status,
        errorCode: body?.errorCode,
        validationErrors: body?.validationErrors,
        raw: body,
      }
    );
  }

  return body as ApiResponse<T>;
}