import {
    applyTodoReminderAction,
    type ReminderActionInput,
} from '@/repositories/todo.repository';

import * as Notifications from './localNotifications';
import { logReminderDiagnostic } from './reminderDiagnostics';
import {
    COMPLETE_REMINDER_ACTION,
    SNOOZE_REMINDER_ACTION,
    TODO_REMINDER_PREFIX,
} from './reminderNotificationConstants';

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

/** Accept SDK-mapped UI responses and raw Android background dataString payloads. */
export function parseReminderAction(
    payload: unknown,
): ReminderActionInput | null {
    const outer = record(payload);
    const response =
        typeof outer?.actionIdentifier === 'string'
            ? outer
            : record(outer?.notification);
    const action = response?.actionIdentifier;
    if (
        action !== COMPLETE_REMINDER_ACTION &&
        action !== SNOOZE_REMINDER_ACTION
    )
        return null;
    const notification = record(response?.notification);
    const request = record(notification?.request);
    const content = record(request?.content);
    let data = record(content?.data);
    if (!data && typeof content?.dataString === 'string') {
        try {
            data = record(JSON.parse(content.dataString));
        } catch {
            return null;
        }
    }
    const id = data?.todoId;
    const reminderAt = data?.reminderAt;
    const notificationDate = notification?.date;
    if (
        typeof id !== 'string' ||
        !id ||
        request?.identifier !== TODO_REMINDER_PREFIX + id ||
        typeof reminderAt !== 'string' ||
        !Number.isFinite(Date.parse(reminderAt)) ||
        typeof notificationDate !== 'number' ||
        !Number.isFinite(notificationDate)
    )
        return null;
    return {
        id,
        reminderAt,
        notificationDate,
        action: action === COMPLETE_REMINDER_ACTION ? 'complete' : 'snooze',
    };
}

function key(input: ReminderActionInput): string {
    return JSON.stringify([
        input.id,
        input.reminderAt,
        input.notificationDate,
        input.action,
    ]);
}

export async function handleReminderAction(payload: unknown) {
    const input = parseReminderAction(payload);
    if (!input) return null;
    const result = await applyTodoReminderAction(input);
    // Clear only after the database commit; a failed write can be retried.
    try {
        const current = parseReminderAction(
            Notifications.getLastNotificationResponse(),
        );
        if (current && key(current) === key(input))
            Notifications.clearLastNotificationResponse();
    } catch (error) {
        logReminderDiagnostic('action-clear-error', { message: String(error) });
    }
    logReminderDiagnostic('action-result', {
        id: input.id,
        action: input.action,
        result,
    });
    return result;
}
