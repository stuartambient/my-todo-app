import { Platform } from 'react-native';

import { getTodoById } from '@/repositories/todo.repository';

import * as Notifications from './localNotifications';
import { logReminderDiagnostic } from './reminderDiagnostics';
import { TODO_REMINDER_PREFIX } from './todoReminders';

type Response = Notifications.NotificationResponse;
type NavigationCallbacks = {
    openTodo(id: string): void;
    todoUnavailable(): void;
    onError(error: unknown): void;
};

function getTodoId(response: Response): string | null {
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
        return null;
    const request = response.notification?.request;
    const todoId = request?.content?.data?.todoId;
    if (typeof todoId !== 'string' || !todoId) return null;
    return request.identifier === TODO_REMINDER_PREFIX + todoId ? todoId : null;
}

function responseKey(response: Response): string {
    return JSON.stringify([
        response.notification?.request?.identifier,
        response.notification?.request?.content?.data?.reminderAt,
        response.notification?.date,
        response.actionIdentifier,
    ]);
}

/** Subscribe before reading the launch response; queue taps until the navigator is ready. */
export function observeTodoNotificationTaps(callbacks: NavigationCallbacks) {
    let stopped = false;
    let ready = false;
    let sequence = 0;
    let pending: { response: Response; id: string; sequence: number } | null =
        null;
    const seen = new Set<string>();

    function consume(response: Response) {
        try {
            const current = Notifications.getLastNotificationResponse();
            // Never erase a newer tap that arrived while its predecessor was loading.
            if (current && responseKey(current) === responseKey(response)) {
                Notifications.clearLastNotificationResponse();
            }
        } catch (error) {
            logReminderDiagnostic('tap-clear-error', {
                message: String(error),
            });
        }
    }

    async function open(tap: NonNullable<typeof pending>) {
        try {
            // getTodoById also waits for database initialization on a cold launch.
            const todo = await getTodoById(tap.id);
            if (stopped || tap.sequence !== sequence) return;
            consume(tap.response);
            if (todo) {
                callbacks.openTodo(todo.id);
                logReminderDiagnostic('tap-opened', { id: todo.id });
            } else {
                callbacks.todoUnavailable();
                logReminderDiagnostic('tap-missing', { id: tap.id });
            }
        } catch (error) {
            if (stopped || tap.sequence !== sequence) return;
            consume(tap.response);
            callbacks.onError(error);
        }
    }

    function flush() {
        if (!ready || !pending || stopped) return;
        const tap = pending;
        pending = null;
        void open(tap);
    }

    function receive(response: Response) {
        if (stopped) return;
        const id = getTodoId(response);
        if (!id) return;
        const key = responseKey(response);
        if (seen.has(key)) return;
        seen.add(key);
        pending = { response, id, sequence: ++sequence };
        logReminderDiagnostic('tap-received', { id, navigationReady: ready });
        flush();
    }

    let subscription: { remove(): void } | undefined;
    if (Platform.OS === 'android') {
        try {
            subscription =
                Notifications.addNotificationResponseReceivedListener(receive);
            const initial = Notifications.getLastNotificationResponse();
            if (initial) receive(initial);
        } catch (error) {
            callbacks.onError(error);
        }
    }

    return {
        navigationReady() {
            ready = true;
            flush();
        },
        stop() {
            stopped = true;
            pending = null;
            subscription?.remove();
        },
    };
}
