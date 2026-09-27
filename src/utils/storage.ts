import { ApiKeys, ProviderId } from '../types';

const STORAGE_KEY = 'omnichat_session_api_keys';

/**
 * Retrieve API keys safely from sessionStorage.
 * Never accesses localStorage.
 */
export function getStoredApiKeys(): ApiKeys {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (err) {
    console.error('[OmniChat] Error reading keys from sessionStorage:', err);
    return {};
  }
}

/**
 * Save updated API keys into sessionStorage.
 */
export function saveStoredApiKeys(keys: ApiKeys): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    // Dispatch custom event so reactive components in the same tab update immediately
    window.dispatchEvent(new Event('omnichat:keys_updated'));
  } catch (err) {
    console.error('[OmniChat] Error writing keys to sessionStorage:', err);
  }
}

/**
 * Clear a specific provider key from sessionStorage.
 */
export function clearStoredApiKey(provider: ProviderId | keyof ApiKeys): void {
  const current = getStoredApiKeys();
  delete current[provider as keyof ApiKeys];
  saveStoredApiKeys(current);
}

/**
 * Clear all keys from sessionStorage.
 */
export function clearAllStoredApiKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(MODEL_AVAILABILITY_KEY);
    window.dispatchEvent(new Event('omnichat:keys_updated'));
  } catch (err) {
    console.error('[OmniChat] Error clearing keys from sessionStorage:', err);
  }
}

const MODEL_AVAILABILITY_KEY = 'omnichat_session_model_availability';

export function getStoredModelAvailability(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(MODEL_AVAILABILITY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStoredModelAvailability(avail: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(MODEL_AVAILABILITY_KEY, JSON.stringify(avail));
  } catch {}
}

const GMAIL_CREDS_KEY = 'omnichat_session_gmail_creds';

export interface StoredGmailCredentials {
  email: string;
  appPassword: string;
}

export function getStoredGmailCredentials(): StoredGmailCredentials | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(GMAIL_CREDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.email === 'string' && typeof parsed.appPassword === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveStoredGmailCredentials(creds: StoredGmailCredentials | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!creds) {
      window.sessionStorage.removeItem(GMAIL_CREDS_KEY);
    } else {
      window.sessionStorage.setItem(GMAIL_CREDS_KEY, JSON.stringify(creds));
    }
    window.dispatchEvent(new Event('omnichat:gmail_updated'));
  } catch (err) {
    console.error('[OmniChat] Error saving Gmail credentials:', err);
  }
}

export function clearStoredGmailCredentials(): void {
  saveStoredGmailCredentials(null);
}

