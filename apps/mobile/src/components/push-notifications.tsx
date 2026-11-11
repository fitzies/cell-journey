// Web has no Expo push support; the native implementation lives in
// push-notifications.native.tsx.
export function PushNotificationsManager() {
  return null;
}

/** Stops pushes to this device. Call before signing out. */
export async function unregisterPushTokenForSignOut() {}
