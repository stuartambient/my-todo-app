import { Platform } from 'react-native';

import type { Todo } from '@/types/todo';

import * as Notifications from './localNotifications';

export type ReminderTodo = Pick<
    Todo,
    'id' | 'subject' | 'status' | 'reminderAt'
>;
export const TODO_REMINDER_PREFIX = 'todo-reminder:';
const CHANNEL_ID = 'todoapp-reminders';
const REMINDER_BODY = 'Your todo reminder is due.';

type ReminderNotice =
    | { status: 'ready' | 'unsupported' }
    | { status: 'permission-denied'; canAskAgain: boolean }
    | { status: 'channel-disabled' }
    | { status: 'error'; message: string };

let notice: ReminderNotice = { status: 'ready' };
const listeners = new Set<() => void>();

export function getReminderNotice(): ReminderNotice {
    return notice;
}

export function subscribeReminderNotice(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function setNotice(next: ReminderNotice): void {
    if (JSON.stringify(next) === JSON.stringify(notice)) return;
    notice = next;
    for (const listener of listeners) listener();
}

export function reportReminderError(error: unknown): void {
    console.error('Unable to synchronize todo reminders:', error);
    setNotice({
        status: 'error',
        message:
            error instanceof Error
                ? error.message
                : 'Unable to update reminder notifications.',
    });
}

/** Called through the repository write queue, always AFTER a database commit. */
export async function reconcileTodoReminders(
    todos: ReminderTodo[],
    requestPermission = false,
    now = Date.now(),
): Promise<void> {
    if (Platform.OS !== 'android') {
        setNotice({ status: 'unsupported' });
        return;
    }

    try {
        const byId = new Map(todos.map((todo) => [todo.id, todo]));
        const future = new Map(
            todos
                .filter(
                    (todo) =>
                        todo.status === 'open' &&
                        todo.reminderAt !== null &&
                        Date.parse(todo.reminderAt) > now,
                )
                .map((todo) => [TODO_REMINDER_PREFIX + todo.id, todo]),
        );
        const scheduled =
            await Notifications.getAllScheduledNotificationsAsync();
        const owned = scheduled.filter((item) =>
            item.identifier.startsWith(TODO_REMINDER_PREFIX),
        );
        const pending = new Map(owned.map((item) => [item.identifier, item]));

        // Cancel stale requests before any channel/permission work, so an edit
        // cannot leave its old reminder active if scheduling the replacement fails.
        for (const item of owned) {
            const todo = future.get(item.identifier);
            const matches =
                todo &&
                item.content.title === todo.subject &&
                item.content.body === REMINDER_BODY &&
                item.content.data?.reminderAt === todo.reminderAt &&
                item.content.data?.reminderVersion === 1;
            if (!matches) {
                await Notifications.cancelScheduledNotificationAsync(
                    item.identifier,
                );
                pending.delete(item.identifier);
            }
        }

        // Also remove outdated notifications that are already in the notification tray.
        const presented = await Notifications.getPresentedNotificationsAsync();
        for (const item of presented) {
            const request = item.request;
            if (!request.identifier.startsWith(TODO_REMINDER_PREFIX)) continue;
            const todo = byId.get(
                request.identifier.slice(TODO_REMINDER_PREFIX.length),
            );
            if (
                !todo ||
                todo.status !== 'open' ||
                !todo.reminderAt ||
                request.content.data?.reminderAt !== todo.reminderAt
            ) {
                await Notifications.dismissNotificationAsync(
                    request.identifier,
                );
            }
        }

        if (future.size === 0) {
            setNotice({ status: 'ready' });
            return;
        }

        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
            name: 'Todo reminders',
            description: 'Reminders for your saved todos.',
            importance: Notifications.AndroidImportance.HIGH,
            // Omit channel sound to use Android's default; SDK 57 treats strings as filenames.
        });

        let permission = await Notifications.getPermissionsAsync();
        if (
            !permission.granted &&
            requestPermission &&
            permission.canAskAgain
        ) {
            permission = await Notifications.requestPermissionsAsync();
        }

        const channel = permission.granted
            ? await Notifications.getNotificationChannelAsync(CHANNEL_ID)
            : null;
        if (
            !permission.granted ||
            channel?.importance === Notifications.AndroidImportance.NONE
        ) {
            for (const id of pending.keys()) {
                await Notifications.cancelScheduledNotificationAsync(id);
            }
            setNotice(
                !permission.granted
                    ? {
                          status: 'permission-denied',
                          canAskAgain: permission.canAskAgain,
                      }
                    : { status: 'channel-disabled' },
            );
            return;
        }

        for (const [identifier, todo] of future) {
            if (pending.has(identifier)) continue;
            // Permission prompts can take long enough for a short reminder to expire.
            const date = new Date(todo.reminderAt!);
            if (date.getTime() <= Date.now()) continue;

            await Notifications.scheduleNotificationAsync({
                identifier,
                content: {
                    title: todo.subject,
                    body: REMINDER_BODY,
                    sound: 'default',
                    data: {
                        todoId: todo.id,
                        reminderAt: todo.reminderAt,
                        reminderVersion: 1,
                    },
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DATE,
                    date,
                    channelId: CHANNEL_ID,
                },
            });
        }
        setNotice({ status: 'ready' });
    } catch (error) {
        // A native scheduling failure must never turn a committed save into a failed save.
        reportReminderError(error);
    }
}
