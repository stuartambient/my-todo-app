import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/database/database';
import { enqueueWrite } from '@/repositories/todo.repository';
import {
    deliveryKey,
    getDeliveredReminders,
} from '@/services/reminderDeliveryHistory';
import * as Notifications from '@/services/localNotifications';
import { configureReminderActions } from '@/services/notificationActionRegistration';
import {
    buildReminderContent,
    REMINDER_CHANNEL_ID,
    requestTodoReminderPermission,
    type ReminderTodo,
} from '@/services/todoReminders';
import { TODO_REMINDER_PREFIX } from '@/services/reminderNotificationConstants';

export type ReminderRestorePreview = {
    eligible: number;
    alreadyVisible: number;
    pending: number;
    unverified: number;
};
export type ReminderRestoreResult = ReminderRestorePreview & {
    restored: number;
    failed: number;
};

async function withReminderLock<T>(
    operation: (transaction: SQLiteDatabase) => Promise<T>,
): Promise<T> {
    const database = await getDatabase();
    let result!: T;
    await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync('PRAGMA busy_timeout = 5000;');
        await transaction.runAsync(
            'UPDATE todo_notification_sync SET revision = revision + 1 WHERE id = 1',
        );
        result = await operation(transaction);
    });
    return result;
}

async function candidates(transaction: SQLiteDatabase) {
    // The same lock excludes notification actions and foreground edits while we
    // compare current reminder times with native delivery evidence and cards.
    const delivered = new Set(
        (await getDeliveredReminders()).map((row) =>
            deliveryKey(row.todoId, row.reminderAt),
        ),
    );
    const visible = new Set(
        (await Notifications.getPresentedNotificationsAsync()).map((item) =>
            JSON.stringify([
                item.request.identifier,
                item.request.content.data?.reminderAt,
            ]),
        ),
    );
    // A late, approximate original alarm must finish naturally, not be replaced
    // by an immediate restoration under its same notification identifier.
    const pending = new Set(
        (await Notifications.getAllScheduledNotificationsAsync()).map((item) =>
            JSON.stringify([item.identifier, item.content.data?.reminderAt]),
        ),
    );
    const rows = await transaction.getAllAsync<{
        id: string;
        subject: string;
        status: 'open';
        reminder_at: string;
    }>(
        "SELECT id, subject, status, reminder_at FROM todos WHERE status = 'open' AND reminder_at IS NOT NULL",
    );
    const eligible: ReminderTodo[] = [];
    const preview: ReminderRestorePreview = {
        eligible: 0,
        alreadyVisible: 0,
        pending: 0,
        unverified: 0,
    };
    for (const row of rows) {
        const time = Date.parse(row.reminder_at);
        if (!Number.isFinite(time) || time > Date.now()) continue;
        const requestKey = JSON.stringify([
            TODO_REMINDER_PREFIX + row.id,
            row.reminder_at,
        ]);
        if (visible.has(requestKey)) {
            preview.alreadyVisible += 1;
            continue;
        }
        if (pending.has(requestKey)) {
            preview.pending += 1;
            continue;
        }
        if (!delivered.has(deliveryKey(row.id, row.reminder_at))) {
            preview.unverified += 1;
            continue;
        }
        eligible.push({
            id: row.id,
            subject: row.subject,
            status: row.status,
            reminderAt: row.reminder_at,
        });
    }
    preview.eligible = eligible.length;
    return { eligible, preview };
}

export function getReminderRestorePreview(): Promise<ReminderRestorePreview> {
    return enqueueWrite(() =>
        withReminderLock(
            async (transaction) => (await candidates(transaction)).preview,
        ),
    );
}

export function restoreReminderNotifications(): Promise<ReminderRestoreResult> {
    return enqueueWrite(async () => {
        // A permission dialog must never hold the SQLite writer. Recheck the
        // candidate snapshot after it closes: reminders could have changed.
        await requestTodoReminderPermission();
        const permission = await Notifications.getPermissionsAsync();
        if (!permission.granted)
            throw new Error(
                'Allow TodoApp notifications in Android Settings, then try again.',
            );
        await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
            name: 'Todo reminders',
            description: 'Reminders for your saved todos.',
            importance: Notifications.AndroidImportance.HIGH,
        });
        const channel =
            await Notifications.getNotificationChannelAsync(
                REMINDER_CHANNEL_ID,
            );
        if (channel?.importance === Notifications.AndroidImportance.NONE)
            throw new Error(
                'Enable the Todo reminders notification category in Android Settings, then try again.',
            );
        await configureReminderActions();
        return withReminderLock(async (transaction) => {
            const { eligible, preview } = await candidates(transaction);
            const result: ReminderRestoreResult = {
                ...preview,
                restored: 0,
                failed: 0,
            };
            for (const todo of eligible) {
                try {
                    await Notifications.scheduleNotificationAsync({
                        identifier: TODO_REMINDER_PREFIX + todo.id,
                        content: buildReminderContent(todo, 'restored'),
                        trigger: { channelId: REMINDER_CHANNEL_ID },
                    });
                    result.restored += 1;
                } catch (error) {
                    result.failed += 1;
                    console.error(
                        'Unable to restore reminder notification:',
                        error,
                    );
                }
            }
            return result;
        });
    });
}
