import { beforeEach, expect, jest, test } from '@jest/globals';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import {
    deliveryKey,
    getDeliveredReminders,
    maintainDeliveryHistory,
} from '../reminderDeliveryHistory';

jest.mock('expo-modules-core', () => ({
    ...jest.requireActual<object>('expo-modules-core'),
    requireOptionalNativeModule: jest.fn(),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
void globalThis.fetch;

const native = {
    getDeliveredRemindersAsync: jest.fn<() => Promise<unknown[]>>(),
    retainDeliveredRemindersAsync: jest.fn<(keys: string[]) => Promise<void>>(),
};
const at = '2030-01-01T12:00:00.000Z';
beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(Platform, { OS: 'android' });
    jest.mocked(requireOptionalNativeModule).mockReturnValue(native);
    native.getDeliveredRemindersAsync.mockResolvedValue([
        { todoId: 'one', reminderAt: at, deliveredAt: 1000 },
    ]);
    native.retainDeliveredRemindersAsync.mockResolvedValue();
});
test('reads actual native delivery evidence and filters malformed entries', async () => {
    native.getDeliveredRemindersAsync.mockResolvedValue([
        { todoId: 'one', reminderAt: at, deliveredAt: 1000 },
        { todoId: 'bad', reminderAt: 'invalid', deliveredAt: 1 },
        { todoId: 'missing', reminderAt: at, deliveredAt: NaN },
    ]);
    expect(await getDeliveredReminders()).toEqual([
        { todoId: 'one', reminderAt: at, deliveredAt: 1000 },
    ]);
});
test('older builds leave ordinary reminder sync working and explain the required rebuild for recovery', async () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue({});
    await expect(getDeliveredReminders(false)).resolves.toEqual([]);
    await expect(getDeliveredReminders()).rejects.toThrow('Rebuild TodoApp');
    await expect(
        maintainDeliveryHistory([
            { id: 'one', status: 'open', reminderAt: at },
        ]),
    ).resolves.toBeUndefined();
});
test('retains history only for current open reminder pairs, after capturing existing cards', async () => {
    await maintainDeliveryHistory([
        { id: 'one', status: 'open', reminderAt: at },
        { id: 'complete', status: 'completed', reminderAt: at },
        { id: 'cleared', status: 'open', reminderAt: null },
    ]);
    expect(native.retainDeliveredRemindersAsync).toHaveBeenCalledWith([
        deliveryKey('one', at),
    ]);
    expect(
        native.getDeliveredRemindersAsync.mock.invocationCallOrder[0],
    ).toBeLessThan(
        native.retainDeliveredRemindersAsync.mock.invocationCallOrder[0],
    );
});
test('history failure does not fail normal reminder scheduling', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    native.getDeliveredRemindersAsync.mockRejectedValueOnce(
        new Error('Receipt storage unavailable'),
    );
    await expect(maintainDeliveryHistory([])).resolves.toBeUndefined();
    expect(native.retainDeliveredRemindersAsync).not.toHaveBeenCalled();
    warn.mockRestore();
});
test('non-Android surfaces do not try to access Android history', async () => {
    Object.assign(Platform, { OS: 'web' });
    await expect(getDeliveredReminders()).rejects.toThrow('Rebuild');
    expect(requireOptionalNativeModule).not.toHaveBeenCalled();
});
