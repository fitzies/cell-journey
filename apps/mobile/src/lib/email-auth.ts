import { Platform } from 'react-native';

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function emailOtpProvider(email: string) {
  if (!__DEV__) return 'resend-otp';
  const devEmail = normalizeEmail(process.env.EXPO_PUBLIC_AUTH_DEV_EMAIL ?? '');
  return devEmail && email === devEmail ? 'dev-otp' : 'resend-otp';
}

export function isOfflineNow() {
  return Platform.OS === 'web'
    && typeof globalThis.navigator !== 'undefined'
    && globalThis.navigator.onLine === false;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message.toLowerCase() : '';
}

export function emailDeliveryError(error: unknown) {
  const message = errorText(error);
  if (isOfflineNow() || message.includes('network') || message.includes('fetch') || message.includes('offline')) {
    return "You're offline. Reconnect, then try again.";
  }
  if (message.includes('rate') || message.includes('too many')) {
    return 'Too many codes were requested. Wait a few minutes, then try again.';
  }
  return "We couldn't send a code. Check the address and try again.";
}

export function codeVerificationError(error: unknown, isDevelopmentLogin = false) {
  const message = errorText(error);
  if (isOfflineNow() || message.includes('network') || message.includes('fetch') || message.includes('offline')) {
    return "You're offline. Reconnect, then try again.";
  }
  if (message.includes('rate') || message.includes('too many') || message.includes('attempt')) {
    return isDevelopmentLogin
      ? 'Too many attempts. Wait a few minutes, then try again.'
      : 'Too many attempts. Request a new code and try again.';
  }
  return isDevelopmentLogin
    ? 'That development code is incorrect. Check the test credentials and try again.'
    : 'That code is incorrect or has expired. Check the newest email and try again.';
}
