import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const TEST_CHANNEL_ID = 'todoapp-notification-tests';
export const TEST_NOTIFICATION_DELAY_SECONDS = 5;

export type TestNotificationResult =
    | { status: 'scheduled' }
    | { status: 'permission-denied' }
    | { status: 'channel-disabled' }
    | { status: 'unsupported' };

export function configureNotificationHandler(): void {
    if (Platform.OS !== 'android') return;

    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
        }),
    });
}

export async function scheduleTestNotification(): Promise<TestNotificationResult> {
    if (Platform.OS !== 'android') {
        return { status: 'unsupported' };
    }

    // Create a channel before requesting Android 13+ notification permission.
    await Notifications.setNotificationChannelAsync(TEST_CHANNEL_ID, {
        name: 'Test notifications',
        description: 'Temporary notifications used to test TodoApp reminders.',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
    });

    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
        permission = await Notifications.requestPermissionsAsync();
    }

    if (!permission.granted) {
        return { status: 'permission-denied' };
    }

    const channel =
        await Notifications.getNotificationChannelAsync(TEST_CHANNEL_ID);
    if (channel?.importance === Notifications.AndroidImportance.NONE) {
        return { status: 'channel-disabled' };
    }

    await Notifications.scheduleNotificationAsync({
        identifier: 'todoapp-notification-test',
        content: {
            title: 'TodoApp test reminder',
            body: 'Your test notification is working.',
            sound: 'default',
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: TEST_NOTIFICATION_DELAY_SECONDS,
            repeats: false,
            channelId: TEST_CHANNEL_ID,
        },
    });

    return { status: 'scheduled' };
}
