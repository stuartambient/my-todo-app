import { beforeEach, expect, jest, test } from '@jest/globals';

void globalThis.fetch;
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-task-manager', () => ({
    isTaskDefined: jest.fn(),
    defineTask: jest.fn(),
}));
jest.mock('../notificationActionRegistration', () => ({
    ensureBackgroundActionTask: jest.fn(async () => {}),
}));
jest.mock('../notificationActions', () => ({
    handleReminderAction: jest.fn(async () => null),
}));
jest.mock('../todoReminders', () => ({ reportReminderError: jest.fn() }));

beforeEach(() => {
    jest.resetModules();
});
function load() {
    jest.requireActual('../backgroundNotificationActions');
    const manager = jest.requireMock('expo-task-manager') as jest.Mocked<
        typeof import('expo-task-manager')
    >;
    const actions = jest.requireMock('../notificationActions') as jest.Mocked<
        typeof import('../notificationActions')
    >;
    const reminders = jest.requireMock('../todoReminders') as jest.Mocked<
        typeof import('../todoReminders')
    >;
    const registration = jest.requireMock(
        '../notificationActionRegistration',
    ) as jest.Mocked<typeof import('../notificationActionRegistration')>;
    return { manager, actions, reminders, registration };
}

test('defines and registers the task at module scope without mounting any screens', async () => {
    const { manager, actions, registration } = load();
    expect(manager.defineTask).toHaveBeenCalledWith(
        'todoReminderActionTask',
        expect.any(Function),
    );
    expect(registration.ensureBackgroundActionTask).toHaveBeenCalled();
    const callback = manager.defineTask.mock.calls[0][1];
    const payload = { actionIdentifier: 'todoComplete' };
    await callback({
        data: payload,
        error: null,
        executionInfo: { taskName: 'todoReminderActionTask', eventId: 'one' },
    });
    expect(actions.handleReminderAction).toHaveBeenCalledWith(payload);
});

test('task errors are reported and not treated as successful actions', async () => {
    const { manager, actions, reminders } = load();
    const callback = manager.defineTask.mock.calls[0][1];
    await expect(
        callback({
            data: null,
            error: { code: 'failure', message: 'Native failure' },
            executionInfo: {
                taskName: 'todoReminderActionTask',
                eventId: 'two',
            },
        }),
    ).rejects.toThrow('Native failure');
    expect(actions.handleReminderAction).not.toHaveBeenCalled();
    expect(reminders.reportReminderError).toHaveBeenCalled();
});
