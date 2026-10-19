// Run with: npx jest --preset jest-expo --runInBand
import { beforeEach, expect, jest, test } from '@jest/globals';
import { Platform } from 'react-native';

import * as Notifications from '../localNotifications';
import { scheduleTestNotification } from '../notifications';

// Resolve Expo's lazy fetch shim while the Jest environment is still active.
void globalThis.fetch;

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../localNotifications', () => ({
    AndroidImportance: { HIGH: 4, NONE: 0 },
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(),
    getNotificationChannelAsync: jest.fn(),
    getPermissionsAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    scheduleNotificationAsync: jest.fn(),
}));

const mocked = jest.mocked(Notifications);
const permission = (granted: boolean, canAskAgain = true) =>
    ({
        granted,
        canAskAgain,
        status: granted ? 'granted' : 'denied',
        expires: 'never',
    }) as Notifications.NotificationPermissionsStatus;

beforeEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(Platform, 'OS', {
        value: 'android',
        configurable: true,
    });
    mocked.getPermissionsAsync.mockResolvedValue(permission(true));
    mocked.getNotificationChannelAsync.mockResolvedValue(null);
    mocked.scheduleNotificationAsync.mockResolvedValue('test-id');
});

test('creates the Android channel before asking permission and schedules once after approval', async () => {
    const operations: string[] = [];
    mocked.setNotificationChannelAsync.mockImplementation(async () => {
        operations.push('channel');
        return null;
    });
    mocked.getPermissionsAsync.mockResolvedValue(permission(false));
    mocked.requestPermissionsAsync.mockImplementation(async () => {
        operations.push('permission');
        return permission(true);
    });

    await expect(scheduleTestNotification()).resolves.toEqual({
        status: 'scheduled',
    });
    expect(operations).toEqual(['channel', 'permission']);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
            trigger: expect.objectContaining({ seconds: 5, repeats: false }),
        }),
    );
});

test('does not ask permission again when already granted', async () => {
    await expect(scheduleTestNotification()).resolves.toEqual({
        status: 'scheduled',
    });
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
});

test('never schedules when the permission request is denied', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(permission(false));
    mocked.requestPermissionsAsync.mockResolvedValue(permission(false));
    await expect(scheduleTestNotification()).resolves.toEqual({
        status: 'permission-denied',
    });
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('does not re-prompt when Android requires the user to use Settings', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(permission(false, false));
    await expect(scheduleTestNotification()).resolves.toEqual({
        status: 'permission-denied',
    });
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('detects a disabled test channel even when app permission is granted', async () => {
    mocked.getNotificationChannelAsync.mockResolvedValue({
        importance: 0,
    } as Notifications.NotificationChannel);
    await expect(scheduleTestNotification()).resolves.toEqual({
        status: 'channel-disabled',
    });
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('reports scheduling errors rather than returning a false success', async () => {
    mocked.scheduleNotificationAsync.mockRejectedValue(
        new Error('Native scheduling failed'),
    );
    await expect(scheduleTestNotification()).rejects.toThrow(
        'Native scheduling failed',
    );
});

test('does not call notification APIs on unsupported platforms', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    await expect(scheduleTestNotification()).resolves.toEqual({
        status: 'unsupported',
    });
    expect(mocked.setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(mocked.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
});
