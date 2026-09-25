import { createApi, createOpenSunsamaClient, type OpenSunsamaClient } from '@open-sunsama/api-client';
import * as SecureStore from 'expo-secure-store';

// API URL from environment or default to production
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.opensunsama.com';

const AUTH_TOKEN_KEY = 'open_sunsama_token';

/**
 * Get stored auth token from SecureStore
 */
export async function getToken(): Promise<string | undefined> {
  try {
    const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    return token || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Store auth token in SecureStore
 */
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

/**
 * Remove auth token from SecureStore
 */
export async function removeToken(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
}

// Current token (cached for synchronous access)
let currentToken: string | undefined;

/**
 * Set the current token for API requests
 */
export function setAuthToken(token: string | null): void {
  currentToken = token || undefined;
}

/**
 * Clear the current token
 */
export function clearAuthToken(): void {
  currentToken = undefined;
}

// --- Token refresh listeners -------------------------------------------------
// The auth context subscribes so a background-refreshed token is mirrored into
// React state instead of silently diverging from SecureStore.
type TokenListener = (token: string) => void;
const tokenListeners = new Set<TokenListener>();

export function onTokenRefreshed(listener: TokenListener): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

// --- Single-flight token refresh --------------------------------------------
// Concurrent 401s collapse into one refresh. The refresh request uses a
// dedicated client WITHOUT the onUnauthorized hook so a failed refresh can't
// recurse into itself.
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const existing = currentToken ?? (await getToken());
  if (!existing) return null;
  try {
    const refreshClient = createApi({ baseUrl: API_URL, token: existing });
    const result = await refreshClient.auth.refreshToken();
    // If logout cleared the session while this refresh was in flight, don't
    // resurrect it. clearAuthToken() sets currentToken to undefined.
    if (currentToken === undefined) return null;
    currentToken = result.token;
    await setToken(result.token);
    for (const listener of tokenListeners) {
      try {
        listener(result.token);
      } catch {
        // a misbehaving listener must not break refresh
      }
    }
    return result.token;
  } catch {
    return null;
  }
}

/**
 * Obtain a fresh auth token, renewing the stored token. De-duplicates
 * concurrent callers. Resolves with the new token, or null if refresh failed.
 */
export function refreshAuthToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * Get the API client configured with current token
 */
export function getApi() {
  return createApi({
    baseUrl: API_URL,
    token: currentToken,
    getToken: () => currentToken,
    onUnauthorized: refreshAuthToken,
  });
}

/**
 * Get the low-level API client
 */
export function getApiClient(): OpenSunsamaClient {
  return createOpenSunsamaClient({
    baseUrl: API_URL,
    token: currentToken,
    getToken: () => currentToken,
    onUnauthorized: refreshAuthToken,
  });
}

/**
 * Initialize the API with a stored token
 * Call this on app startup
 */
export async function initializeApi(): Promise<void> {
  const token = await getToken();
  if (token) {
    currentToken = token;
  }
}

export { API_URL };
