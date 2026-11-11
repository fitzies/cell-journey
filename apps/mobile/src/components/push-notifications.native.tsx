import { useConvexAuth, useMutation } from 'convex/react';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useGroups } from '@/components/group-context';
import { api, type Id } from '@/lib/api';
import { convex } from '@/lib/convex';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// The token registered in this app session, so sign-out can remove it.
let registeredToken: string | null = null;

/** Stops pushes to this device. Call before signing out. */
export async function unregisterPushTokenForSignOut() {
  const token = registeredToken;
  if (!token || !convex) return;
  registeredToken = null;
  try {
    await convex.mutation(api.notifications.unregisterPushToken, { token });
  } catch {
    // Sign-out must not fail because the device was offline.
  }
}

async function getPushToken() {
  if (!Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status === 'undetermined') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

type ReminderData = { type: 'attendanceReminder'; eventId: Id<'events'>; groupId: Id<'groups'> };

function reminderData(response: Notifications.NotificationResponse | null | undefined): ReminderData | null {
  const data = response?.notification.request.content.data as Partial<ReminderData> | undefined;
  if (data?.type !== 'attendanceReminder' || typeof data.eventId !== 'string' || typeof data.groupId !== 'string') return null;
  return data as ReminderData;
}

/**
 * Registers leaders for attendance reminders and opens the event when a
 * reminder is tapped, including when the tap launched the app.
 */
export function PushNotificationsManager() {
  const { isAuthenticated } = useConvexAuth();
  const groups = useGroups();
  const register = useMutation(api.notifications.registerPushToken);
  const canUseLeaderMode = groups.context?.canUseLeaderMode === true;
  const attempted = useRef(false);
  const handledResponses = useRef(new Set<string>());
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!isAuthenticated) attempted.current = false;
    if (!isAuthenticated || !canUseLeaderMode || attempted.current) return;
    attempted.current = true;
    void (async () => {
      try {
        const token = await getPushToken();
        if (!token) return;
        await register({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android', deviceId: Device.osBuildId ?? undefined });
        registeredToken = token;
      } catch {
        // Reminders are best-effort; retry on the next app session.
      }
    })();
  }, [canUseLeaderMode, isAuthenticated, register]);

  const { context, ledGroups, selectLeaderGroup } = groups;
  useEffect(() => {
    const data = reminderData(lastResponse);
    if (!lastResponse || !data || !isAuthenticated || context === undefined) return;
    const id = lastResponse.notification.request.identifier;
    if (handledResponses.current.has(id)) return;
    handledResponses.current.add(id);
    Notifications.clearLastNotificationResponse();
    if (!ledGroups.some((group) => group._id === data.groupId)) return;
    selectLeaderGroup(data.groupId);
    router.push({ pathname: '/(leader-tabs)/attendance/[eventId]', params: { eventId: data.eventId } });
  }, [context, isAuthenticated, lastResponse, ledGroups, selectLeaderGroup]);

  return null;
}
