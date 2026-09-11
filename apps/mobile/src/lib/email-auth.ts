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
  return typeof globalThis.navigator !== 'undefined'
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
  if (isDevelopmentLogin && (
    message.includes('dev test group belongs to another profile')
    || message.includes('reserved dev group code')
  )) {
    return 'Development sign-in is blocked by the DEV001 group setup. Ask the developer to check its reserved name and leader. Your code was accepted.';
  }
  if (isDevelopmentLogin && (message.includes('auth_dev_') || message.includes('provider') && message.includes('dev-otp'))) {
    return 'Development sign-in is not configured correctly. Ask the developer to check the development login settings.';
  }
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

export function authConnectionMessage(connected: boolean, pending: boolean, takingLonger: boolean) {
  if (!connected) {
    return pending
      ? "Connection lost. Reconnect to the internet. Your sign-in request will continue automatically."
      : "Can't connect right now. Check your internet connection, then try again.";
  }
  return pending && takingLonger
    ? 'This is taking longer than usual. Your sign-in request is still pending. It will continue automatically when the service responds.'
    : null;
}

export function groupJoinError(error: unknown) {
  const message = errorText(error);
  if (message.includes('already connected to this group')) return "You're already a member of this group. Choose a different group code.";
  if (message.includes('complete your profile')) return 'Complete your profile before requesting to join a group.';
  if (message.includes('invalid group code')) return 'This group code is no longer available. Ask your leader for the current code.';
  if (message.includes('network') || message.includes('fetch') || message.includes('offline')) return "Couldn't connect. Check your internet connection and try again.";
  return "We couldn't send your request. Please try again.";
}
