import { beforeEach, expect, jest, test } from '@jest/globals';

void globalThis.fetch;
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-task-manager', () => ({
    isTaskDefined: jest.fn(),
    isAvailableAsync: jest.fn(),
    isTaskRegisteredAsync: jest.fn(),
}));
jest.mock('../localNotifications', () => ({
    registerTaskAsync: jest.fn(),
    setNotificationCategoryAsync: jest.fn(),
}));

function setup() {
    const manager = jest.requireMock('expo-task-manager') as jest.Mocked<
        typeof import('expo-task-manager')
    >;
    const notifications = jest.requireMock(
        '../localNotifications',
    ) as jest.Mocked<typeof import('../localNotifications')>;
    manager.isTaskDefined.mockReturnValue(true);
    manager.isAvailableAsync.mockResolvedValue(true);
    manager.isTaskRegisteredAsync.mockResolvedValue(false);
    notifications.registerTaskAsync.mockResolvedValue(null);
    return {
        manager,
        notifications,
        service: jest.requireActual<
            typeof import('../notificationActionRegistration')
        >('../notificationActionRegistration'),
    };
}
beforeEach(() => {
    jest.resetModules();
});

test('registers one background task and configures two non-foregrounding actions', async () => {
    const { notifications, service } = setup();
    await Promise.all([
        service.configureReminderActions(),
        service.configureReminderActions(),
    ]);
    expect(notifications.registerTaskAsync).toHaveBeenCalledTimes(1);
    expect(notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
        'todoReminderActions',
        [
            {
                identifier: 'todoComplete',
                buttonTitle: 'Complete',
                options: { opensAppToForeground: false },
            },
            {
                identifier: 'todoSnooze',
                buttonTitle: 'Snooze 10 min',
                options: { opensAppToForeground: false },
            },
        ],
    );
});

test('an already registered task is reused', async () => {
    const { manager, notifications, service } = setup();
    manager.isTaskRegisteredAsync.mockResolvedValue(true);
    await service.configureReminderActions();
    expect(notifications.registerTaskAsync).not.toHaveBeenCalled();
    expect(notifications.setNotificationCategoryAsync).toHaveBeenCalled();
});

test('registration failure does not cache a failed promise and can be retried', async () => {
    const { notifications, service } = setup();
    notifications.registerTaskAsync.mockRejectedValueOnce(
        new Error('Native unavailable'),
    );
    await expect(service.configureReminderActions()).rejects.toThrow(
        'Native unavailable',
    );
    expect(notifications.setNotificationCategoryAsync).not.toHaveBeenCalled();
    await expect(service.configureReminderActions()).resolves.toBeUndefined();
    expect(notifications.registerTaskAsync).toHaveBeenCalledTimes(2);
});

test('missing background capability does not advertise non-working buttons', async () => {
    const { manager, notifications, service } = setup();
    manager.isAvailableAsync.mockResolvedValue(false);
    await expect(service.configureReminderActions()).rejects.toThrow('Rebuild');
    expect(notifications.setNotificationCategoryAsync).not.toHaveBeenCalled();
});

test('task definition must exist before actions can be advertised', async () => {
    const { manager, notifications, service } = setup();
    manager.isTaskDefined.mockReturnValue(false);
    await expect(service.configureReminderActions()).rejects.toThrow('Restart');
    expect(notifications.registerTaskAsync).not.toHaveBeenCalled();
});
