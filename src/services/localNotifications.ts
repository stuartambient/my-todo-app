// SDK 57's main expo-notifications entry also loads its remote topic module.
// Some Expo Go builds omit that native module, which crashes the whole import.
// Keep the local-only surface here so it never evaluates the remote entry point.
// These build paths are package internals; recheck this adapter on SDK upgrades.
export { getNotificationChannelAsync } from 'expo-notifications/build/getNotificationChannelAsync';
export { getAllScheduledNotificationsAsync } from 'expo-notifications/build/getAllScheduledNotificationsAsync';
export { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
export { getPresentedNotificationsAsync } from 'expo-notifications/build/getPresentedNotificationsAsync';
export { dismissNotificationAsync } from 'expo-notifications/build/dismissNotificationAsync';
export { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
export type { NotificationChannel } from 'expo-notifications/build/NotificationChannelManager.types';
export {
    getPermissionsAsync,
    requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
export type { NotificationPermissionsStatus } from 'expo-notifications/build/NotificationPermissions.types';
export { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
export { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
export { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
export { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';

export {
    addNotificationResponseReceivedListener,
    getLastNotificationResponse,
    clearLastNotificationResponse,
    DEFAULT_ACTION_IDENTIFIER,
} from 'expo-notifications/build/NotificationsEmitter';
export type { NotificationResponse } from 'expo-notifications/build/Notifications.types';
