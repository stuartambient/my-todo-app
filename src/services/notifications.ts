import { Platform } from 'react-native';

import * as Notifications from './localNotifications';
import { logReminderDiagnostic } from './reminderDiagnostics';

export function configureNotificationHandler(): void {
    if (Platform.OS !== 'android') return;

    Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
            logReminderDiagnostic('foreground-received', {
                id: notification.request.identifier,
                reminderAt: notification.request.content.data?.reminderAt,
            });
            const restored =
                notification.request.content.data?.reminderRestored === true;
            return {
                shouldShowBanner: !restored,
                shouldShowList: true,
                shouldPlaySound: !restored,
                shouldSetBadge: false,
            };
        },
        handleError: (id, error) => {
            logReminderDiagnostic('presentation-error', {
                id,
                message: String(error),
            });
        },
    });
}
