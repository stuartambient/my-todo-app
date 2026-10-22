import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import * as Notifications from './localNotifications';
import {
    COMPLETE_REMINDER_ACTION,
    REMINDER_ACTION_TASK,
    REMINDER_CATEGORY,
    SNOOZE_MINUTES,
    SNOOZE_REMINDER_ACTION,
} from './reminderNotificationConstants';

let registration: Promise<void> | null = null;

export function ensureBackgroundActionTask(): Promise<void> {
    if (Platform.OS !== 'android') return Promise.resolve();
    if (!registration) {
        registration = (async () => {
            if (!TaskManager.isTaskDefined(REMINDER_ACTION_TASK)) {
                throw new Error(
                    'Restart TodoApp to initialize notification actions.',
                );
            }
            if (!(await TaskManager.isAvailableAsync())) {
                throw new Error(
                    'Rebuild TodoApp to enable notification actions.',
                );
            }
            if (
                !(await TaskManager.isTaskRegisteredAsync(REMINDER_ACTION_TASK))
            ) {
                await Notifications.registerTaskAsync(REMINDER_ACTION_TASK);
            }
        })().catch((error) => {
            registration = null;
            throw error;
        });
    }
    return registration;
}

export async function configureReminderActions(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await ensureBackgroundActionTask();
    await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
        {
            identifier: COMPLETE_REMINDER_ACTION,
            buttonTitle: 'Complete',
            options: { opensAppToForeground: false },
        },
        {
            identifier: SNOOZE_REMINDER_ACTION,
            buttonTitle: `Snooze ${SNOOZE_MINUTES} min`,
            options: { opensAppToForeground: false },
        },
    ]);
}
