import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { Platform } from 'react-native';

import * as Notifications from '../localNotifications';
import { getExactAlarmAccess } from '../exactAlarms';
import {
    getReminderNotice,
    reconcileTodoReminders,
    type ReminderTodo,
    TODO_REMINDER_PREFIX,
} from '../todoReminders';

void globalThis.fetch;

jest.mock('../exactAlarms', () => ({ getExactAlarmAccess: jest.fn() }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../localNotifications', () => ({
    AndroidImportance: { HIGH: 6, NONE: 2 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    setNotificationChannelAsync: jest.fn(),
    getNotificationChannelAsync: jest.fn(),
    getPermissionsAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    getAllScheduledNotificationsAsync: jest.fn(),
    getPresentedNotificationsAsync: jest.fn(),
    dismissNotificationAsync: jest.fn(),
    cancelScheduledNotificationAsync: jest.fn(),
    scheduleNotificationAsync: jest.fn(),
}));

const mocked = jest.mocked(Notifications);
type Request = Awaited<
    ReturnType<typeof Notifications.getAllScheduledNotificationsAsync>
>[number];
type Presented = Awaited<
    ReturnType<typeof Notifications.getPresentedNotificationsAsync>
>[number];
const reminderAt = '2030-06-15T15:00:00.000Z';
let pending: Map<string, Request>;
const todo = (changes: Partial<ReminderTodo> = {}): ReminderTodo => ({
    id: 'one',
    subject: 'Pay electric bill',
    status: 'open',
    reminderAt,
    ...changes,
});
const permission = (granted: boolean, canAskAgain = true) =>
    ({
        granted,
        canAskAgain,
        status: granted ? 'granted' : 'denied',
        expires: 'never',
    }) as Notifications.NotificationPermissionsStatus;

beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(getExactAlarmAccess).mockResolvedValue('exact');
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2030-06-15T14:00:00.000Z'));
    Object.defineProperty(Platform, 'OS', {
        value: 'android',
        configurable: true,
    });
    pending = new Map();
    mocked.getAllScheduledNotificationsAsync.mockImplementation(async () => [
        ...pending.values(),
    ]);
    mocked.getPresentedNotificationsAsync.mockResolvedValue([]);
    mocked.getPermissionsAsync.mockResolvedValue(permission(true));
    mocked.getNotificationChannelAsync.mockResolvedValue(null);
    mocked.scheduleNotificationAsync.mockImplementation(async (request) => {
        pending.set(request.identifier!, request as unknown as Request);
        return request.identifier!;
    });
    mocked.cancelScheduledNotificationAsync.mockImplementation(async (id) => {
        pending.delete(id);
    });
});

afterEach(() => {
    jest.useRealTimers();
});

test('schedules the saved reminder timestamp and subject exactly once across repeated syncs', async () => {
    await reconcileTodoReminders([todo()]);
    await reconcileTodoReminders([todo()]);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const request = mocked.scheduleNotificationAsync.mock.calls[0][0];
    expect(request.content.title).toBe('Pay electric bill');
    expect(request.trigger).toEqual({
        type: 'date',
        date: new Date(reminderAt),
        channelId: 'todoapp-reminders',
    });
    expect(getReminderNotice().status).toBe('ready');
});

test('changing the time replaces the old request, and changing the subject updates the notification', async () => {
    await reconcileTodoReminders([todo()]);
    await reconcileTodoReminders([
        todo({ reminderAt: '2030-06-15T16:00:00.000Z' }),
    ]);
    expect(pending.size).toBe(1);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
        TODO_REMINDER_PREFIX + 'one',
    );
    await reconcileTodoReminders([
        todo({
            subject: 'Updated bill',
            reminderAt: '2030-06-15T16:00:00.000Z',
        }),
    ]);
    expect(pending.size).toBe(1);
    expect([...pending.values()][0].content.title).toBe('Updated bill');
});

test.each(['completed', 'deleted', 'cleared'] as const)(
    '%s todos cancel their pending reminders',
    async (action) => {
        await reconcileTodoReminders([todo()]);
        await reconcileTodoReminders(
            action === 'deleted'
                ? []
                : [
                      todo(
                          action === 'completed'
                              ? { status: 'completed' }
                              : { reminderAt: null },
                      ),
                  ],
        );
        expect(pending.size).toBe(0);
    },
);

test('reopening restores a future reminder', async () => {
    await reconcileTodoReminders([todo()]);
    await reconcileTodoReminders([todo({ status: 'completed' })]);
    await reconcileTodoReminders([todo()]);
    expect(pending.size).toBe(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
});

test('completion cancels the old occurrence and schedules the successor reminder', async () => {
    await reconcileTodoReminders([todo()]);
    await reconcileTodoReminders([
        todo({ status: 'completed' }),
        todo({ id: 'next', reminderAt: '2030-07-15T15:00:00.000Z' }),
    ]);
    expect([...pending.keys()]).toEqual([TODO_REMINDER_PREFIX + 'next']);
});

test('past, invalid and absent reminder times never create catch-up alerts', async () => {
    await reconcileTodoReminders([
        todo({ reminderAt: '2030-06-14T15:00:00.000Z' }),
        todo({ id: 'invalid', reminderAt: 'not-a-date' }),
        todo({ id: 'none', reminderAt: null }),
    ]);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
});

test('startup does not prompt, while an explicit save/retry can request permission', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(permission(false));
    await reconcileTodoReminders([todo()]);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(getReminderNotice()).toEqual({
        status: 'permission-denied',
        canAskAgain: true,
    });
    mocked.requestPermissionsAsync.mockResolvedValue(permission(true));
    await reconcileTodoReminders([todo()], true);
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(1);
});

test('permanently denied permission and a blocked channel do not schedule', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(permission(false, false));
    await reconcileTodoReminders([todo()], true);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
    mocked.getPermissionsAsync.mockResolvedValue(permission(true));
    mocked.getNotificationChannelAsync.mockResolvedValue({
        importance: 2,
    } as Notifications.NotificationChannel);
    await reconcileTodoReminders([todo()]);
    expect(getReminderNotice().status).toBe('channel-disabled');
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('reminder times that expire while permission is being granted do not fire immediately', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(permission(false));
    mocked.requestPermissionsAsync.mockImplementation(async () => {
        jest.setSystemTime(new Date('2030-06-15T15:01:00.000Z'));
        return permission(true);
    });
    await reconcileTodoReminders([todo()], true);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('scheduling failures are visible and retryable without rejecting a completed save', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    mocked.scheduleNotificationAsync.mockRejectedValueOnce(
        new Error('Native error'),
    );
    await expect(reconcileTodoReminders([todo()])).resolves.toBeUndefined();
    expect(getReminderNotice()).toEqual({
        status: 'error',
        message: 'Native error',
    });
    await reconcileTodoReminders([todo()]);
    expect(getReminderNotice().status).toBe('ready');
    expect(pending.size).toBe(1);
    log.mockRestore();
});

test('an edited reminder cancels its old time even if preparing the replacement channel fails', async () => {
    await reconcileTodoReminders([todo()]);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    mocked.setNotificationChannelAsync.mockRejectedValueOnce(
        new Error('Channel error'),
    );
    await reconcileTodoReminders([
        todo({ reminderAt: '2030-06-15T16:00:00.000Z' }),
    ]);
    expect(pending.size).toBe(0);
    expect(getReminderNotice().status).toBe('error');
    await reconcileTodoReminders([
        todo({ reminderAt: '2030-06-15T16:00:00.000Z' }),
    ]);
    expect(pending.size).toBe(1);
    log.mockRestore();
});

test('does not cancel the test notification or unrelated requests', async () => {
    pending.set('todoapp-notification-test', {
        identifier: 'todoapp-notification-test',
    } as Request);
    await reconcileTodoReminders([]);
    expect(pending.has('todoapp-notification-test')).toBe(true);
    expect(mocked.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test('completed or edited todos remove stale reminders from the notification tray', async () => {
    mocked.getPresentedNotificationsAsync.mockResolvedValue([
        {
            request: {
                identifier: TODO_REMINDER_PREFIX + 'one',
                content: { data: { reminderAt } },
            },
        } as unknown as Presented,
    ]);
    await reconcileTodoReminders([todo({ status: 'completed' })]);
    expect(mocked.dismissNotificationAsync).toHaveBeenCalledWith(
        TODO_REMINDER_PREFIX + 'one',
    );
});

test('resuming at or after the due time preserves an alarm delayed by Android', async () => {
    await reconcileTodoReminders([todo()]);
    jest.setSystemTime(new Date(reminderAt));
    await reconcileTodoReminders([todo()]);
    jest.setSystemTime(new Date('2030-06-15T15:03:00.000Z'));
    await reconcileTodoReminders([todo()]);
    await reconcileTodoReminders([todo({ subject: 'Renamed while delayed' })]);
    expect(pending.size).toBe(1);
    expect(mocked.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    // Once Android removes the delivered request, sync must not replay it.
    pending.clear();
    await reconcileTodoReminders([todo()]);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

test.each(['completed', 'deleted', 'cleared', 'moved'] as const)(
    'a delayed alarm still cancels when its todo is %s',
    async (action) => {
        await reconcileTodoReminders([todo()]);
        jest.setSystemTime(new Date('2030-06-15T15:03:00.000Z'));
        await reconcileTodoReminders(
            action === 'deleted'
                ? []
                : [
                      todo(
                          action === 'completed'
                              ? { status: 'completed' }
                              : action === 'cleared'
                                ? { reminderAt: null }
                                : { reminderAt: '2030-06-15T16:00:00.000Z' },
                      ),
                  ],
        );
        expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
            TODO_REMINDER_PREFIX + 'one',
        );
        expect(pending.size).toBe(action === 'moved' ? 1 : 0);
        if (action === 'moved') {
            expect([...pending.values()][0].content.data?.reminderAt).toBe(
                '2030-06-15T16:00:00.000Z',
            );
        }
    },
);

test('blocked notifications cancel even an overdue pending alarm', async () => {
    await reconcileTodoReminders([todo()]);
    jest.setSystemTime(new Date('2030-06-15T15:03:00.000Z'));
    mocked.getPermissionsAsync.mockResolvedValue(permission(false, false));
    await reconcileTodoReminders([todo()]);
    expect(pending.size).toBe(0);
    expect(getReminderNotice().status).toBe('permission-denied');
});

test('without exact access, reminders remain scheduled with an optional settings notice', async () => {
    jest.mocked(getExactAlarmAccess).mockResolvedValue('approximate');
    await reconcileTodoReminders([todo()]);
    expect(pending.size).toBe(1);
    expect([...pending.values()][0].content.data?.reminderTiming).toBe(
        'approximate',
    );
    expect(getReminderNotice()).toEqual({
        status: 'approximate',
        canEnable: true,
    });
});

test('granting exact access upgrades an existing future reminder', async () => {
    jest.mocked(getExactAlarmAccess).mockResolvedValue('approximate');
    await reconcileTodoReminders([todo()]);
    jest.mocked(getExactAlarmAccess).mockResolvedValue('exact');
    await reconcileTodoReminders([todo()]);
    expect(pending.size).toBe(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect([...pending.values()][0].content.data?.reminderTiming).toBe('exact');
    expect(getReminderNotice().status).toBe('ready');
});

test('revoking exact access restores future requests using approximate delivery', async () => {
    await reconcileTodoReminders([todo()]);
    jest.mocked(getExactAlarmAccess).mockResolvedValue('approximate');
    await reconcileTodoReminders([todo()], false, Date.now(), true);
    expect(pending.size).toBe(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect([...pending.values()][0].content.data?.reminderTiming).toBe(
        'approximate',
    );
});

test('resume re-arms a future alarm even if the native request store still lists it', async () => {
    await reconcileTodoReminders([todo()]);
    // Android may have cancelled the alarm without clearing Expo's request store.
    await reconcileTodoReminders([todo()], false, Date.now(), true);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(pending.size).toBe(1);
    // Re-arming the same identifier replaces the alarm rather than duplicating it.
    expect(mocked.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    jest.setSystemTime(new Date('2030-06-15T15:03:00.000Z'));
    await reconcileTodoReminders([todo()], false, Date.now(), true);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(pending.size).toBe(1);
});

test('switching timing access never cancels an already overdue alarm', async () => {
    jest.mocked(getExactAlarmAccess).mockResolvedValue('approximate');
    await reconcileTodoReminders([todo()]);
    jest.setSystemTime(new Date('2030-06-15T15:03:00.000Z'));
    jest.mocked(getExactAlarmAccess).mockResolvedValue('exact');
    await reconcileTodoReminders([todo()], false, Date.now(), true);
    expect(mocked.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(1);
});

test('an older app binary continues approximate scheduling without crashing', async () => {
    jest.mocked(getExactAlarmAccess).mockResolvedValue('unavailable');
    await reconcileTodoReminders([todo()]);
    expect(pending.size).toBe(1);
    expect(getReminderNotice()).toEqual({
        status: 'approximate',
        canEnable: false,
    });
});
