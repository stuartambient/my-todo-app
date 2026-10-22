import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { ensureBackgroundActionTask } from './notificationActionRegistration';
import { handleReminderAction } from './notificationActions';
import { REMINDER_ACTION_TASK } from './reminderNotificationConstants';
import { reportReminderError } from './todoReminders';

// Required at module scope by the custom app entry, including headless launches.
if (Platform.OS === 'android') {
    if (!TaskManager.isTaskDefined(REMINDER_ACTION_TASK)) {
        TaskManager.defineTask(
            REMINDER_ACTION_TASK,
            async ({ data, error }) => {
                try {
                    if (error) throw new Error(error.message);
                    // Notification receipts and ordinary taps are ignored by this parser.
                    await handleReminderAction(data);
                } catch (failure) {
                    reportReminderError(failure);
                    throw failure;
                }
            },
        );
    }
    void ensureBackgroundActionTask().catch(reportReminderError);
}
