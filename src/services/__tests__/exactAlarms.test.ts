import { beforeEach, expect, jest, test } from '@jest/globals';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import { getExactAlarmAccess, openExactAlarmSettings } from '../exactAlarms';

jest.mock('react-native', () => ({ Platform: { OS: 'android', Version: 37 } }));
jest.mock('expo-modules-core', () => ({
    ...jest.requireActual<object>('expo-modules-core'),
    requireOptionalNativeModule: jest.fn(),
}));
void globalThis.fetch;

const native = {
    canScheduleExactAlarmsAsync: jest.fn<() => Promise<boolean>>(),
    openSettingsAsync: jest.fn<() => Promise<void>>(),
};

beforeEach(() => {
    jest.resetAllMocks();
    Object.assign(Platform, { OS: 'android', Version: 37 });
    jest.mocked(requireOptionalNativeModule).mockReturnValue(native);
    native.canScheduleExactAlarmsAsync.mockResolvedValue(false);
    native.openSettingsAsync.mockResolvedValue();
});

test('checking denied access does not open system settings', async () => {
    await expect(getExactAlarmAccess()).resolves.toBe('approximate');
    expect(native.openSettingsAsync).not.toHaveBeenCalled();
});

test('allowed access enables exact timing', async () => {
    native.canScheduleExactAlarmsAsync.mockResolvedValue(true);
    await expect(getExactAlarmAccess()).resolves.toBe('exact');
});

test('an explicit user action opens the native settings screen', async () => {
    await openExactAlarmSettings();
    expect(native.openSettingsAsync).toHaveBeenCalledTimes(1);
});

test('Android before API 31 needs no special access or native lookup', async () => {
    Object.assign(Platform, { Version: 30 });
    await expect(getExactAlarmAccess()).resolves.toBe('exact');
    await openExactAlarmSettings();
    expect(requireOptionalNativeModule).not.toHaveBeenCalled();
});

test('non-Android platforms need no Android module', async () => {
    Object.assign(Platform, { OS: 'ios' });
    await expect(getExactAlarmAccess()).resolves.toBe('exact');
    await openExactAlarmSettings();
    expect(requireOptionalNativeModule).not.toHaveBeenCalled();
});

test('a missing native module leaves the app usable and explains the needed update', async () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
    await expect(getExactAlarmAccess()).resolves.toBe('unavailable');
    await expect(openExactAlarmSettings()).rejects.toThrow('Update TodoApp');
});

test('a capability-check error preserves approximate reminders instead of failing sync', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    native.canScheduleExactAlarmsAsync.mockRejectedValue(
        new Error('Native check unavailable'),
    );
    await expect(getExactAlarmAccess()).resolves.toBe('unavailable');
    expect(native.openSettingsAsync).not.toHaveBeenCalled();
    warn.mockRestore();
});
