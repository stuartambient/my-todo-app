import { Platform } from 'react-native';

import * as Notifications from './localNotifications';

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
