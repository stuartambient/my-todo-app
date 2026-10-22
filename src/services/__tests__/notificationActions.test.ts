import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { applyTodoReminderAction } from '@/repositories/todo.repository';
import * as Notifications from '../localNotifications';
import {
    handleReminderAction,
    parseReminderAction,
} from '../notificationActions';
import {
    COMPLETE_REMINDER_ACTION,
    SNOOZE_REMINDER_ACTION,
} from '../reminderNotificationConstants';

void globalThis.fetch;
jest.mock('@/repositories/todo.repository', () => ({
    applyTodoReminderAction: jest.fn(),
}));
jest.mock('../localNotifications', () => ({
    getLastNotificationResponse: jest.fn(),
    clearLastNotificationResponse: jest.fn(),
}));

const response = (action = SNOOZE_REMINDER_ACTION) => ({
    actionIdentifier: action,
    notification: {
        date: 123,
        request: {
            identifier: 'todo-reminder:one',
            content: {
                data: { todoId: 'one', reminderAt: '2030-06-15T15:00:00.000Z' },
            },
        },
    },
});

beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.mocked(applyTodoReminderAction).mockResolvedValue('snoozed');
    jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(
        null,
    );
});
afterEach(() => {
    jest.restoreAllMocks();
});

test('Complete and Snooze dispatch only a matching saved todo and reminder time', async () => {
    await handleReminderAction(response(COMPLETE_REMINDER_ACTION));
    expect(applyTodoReminderAction).toHaveBeenCalledWith({
        id: 'one',
        reminderAt: '2030-06-15T15:00:00.000Z',
        notificationDate: 123,
        action: 'complete',
    });
    await handleReminderAction(response());
    expect(applyTodoReminderAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'snooze' }),
    );
});

test('raw Android background dataString and wrapped job payloads are accepted', () => {
    const raw = response();
    const dataString = JSON.stringify(raw.notification.request.content.data);
    const background = {
        ...raw,
        notification: {
            ...raw.notification,
            request: { ...raw.notification.request, content: { dataString } },
        },
    };
    expect(parseReminderAction(background)).toEqual(parseReminderAction(raw));
    expect(parseReminderAction({ notification: background })).toEqual(
        parseReminderAction(raw),
    );
});

test.each([
    null,
    {},
    { notification: {} },
    response('foreign'),
    response('expo.modules.notifications.actions.DEFAULT'),
])(
    'unrelated receipts, taps and malformed payloads do not mutate data: %j',
    async (payload) => {
        await expect(handleReminderAction(payload)).resolves.toBeNull();
        expect(applyTodoReminderAction).not.toHaveBeenCalled();
    },
);

test('mismatched IDs, invalid reminder times and invalid delivery dates are rejected', () => {
    const mismatch = response();
    mismatch.notification.request.identifier = 'todo-reminder:other';
    const invalidTime = response();
    invalidTime.notification.request.content.data.reminderAt = 'invalid';
    const invalidDate = response();
    invalidDate.notification.date = Number.NaN;
    [mismatch, invalidTime, invalidDate].forEach((payload) =>
        expect(parseReminderAction(payload)).toBeNull(),
    );
    expect(
        parseReminderAction({
            ...response(),
            notification: {
                date: 1,
                request: {
                    identifier: 'todo-reminder:one',
                    content: { dataString: '{' },
                },
            },
        }),
    ).toBeNull();
});

test('a successful action consumes only its matching last response', async () => {
    const tap = response() as unknown as Notifications.NotificationResponse;
    jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(tap);
    await handleReminderAction(tap);
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(
        1,
    );
    const newer = response();
    newer.notification.date = 124;
    jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(
        newer as unknown as Notifications.NotificationResponse,
    );
    await handleReminderAction(tap);
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(
        1,
    );
});

test('a failed database action is not consumed and can be retried', async () => {
    const tap = response() as unknown as Notifications.NotificationResponse;
    jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(tap);
    jest.mocked(applyTodoReminderAction).mockRejectedValueOnce(
        new Error('DB unavailable'),
    );
    await expect(handleReminderAction(tap)).rejects.toThrow('DB unavailable');
    expect(Notifications.clearLastNotificationResponse).not.toHaveBeenCalled();
    await expect(handleReminderAction(tap)).resolves.toBe('snoozed');
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(
        1,
    );
});
