import { expect, jest, test } from '@jest/globals';
import { configureNotificationHandler } from '../notifications';
import { setNotificationHandler } from '../localNotifications';
import { buildReminderContent } from '../todoReminders';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../localNotifications', () => ({
    setNotificationHandler: jest.fn(),
}));
jest.mock('../notificationActionRegistration', () => ({
    configureReminderActions: jest.fn(),
}));
test('restored cards are silent list entries while ordinary reminders keep their alert behavior', async () => {
    configureNotificationHandler();
    const handler = jest.mocked(setNotificationHandler).mock.calls[0][0]!;
    const restored = await handler.handleNotification({
        request: {
            identifier: 'todo-reminder:one',
            content: { data: { reminderRestored: true } },
        },
    } as never);
    expect(restored).toEqual({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
    });
    const normal = await handler.handleNotification({
        request: { identifier: 'todo-reminder:one', content: { data: {} } },
    } as never);
    expect(normal.shouldShowBanner).toBe(true);
    expect(normal.shouldPlaySound).toBe(true);
});
test('restored cards retain the original reminder identity and action category', () => {
    const content = buildReminderContent(
        {
            id: 'one',
            subject: 'Pay bill',
            status: 'open',
            reminderAt: '2030-01-01T12:00:00.000Z',
        },
        'restored',
    );
    expect(content).toMatchObject({
        sound: false,
        autoDismiss: false,
        sticky: false,
        categoryIdentifier: 'todoReminderActions',
        data: {
            todoId: 'one',
            reminderAt: '2030-01-01T12:00:00.000Z',
            reminderVersion: 1,
            reminderRestored: true,
        },
    });
});
