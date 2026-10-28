import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import RestoreRemindersScreen from '@/app/restore-reminders';
import {
    getReminderRestorePreview,
    restoreReminderNotifications,
} from '@/repositories/reminderRestore.repository';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('expo-router/react-navigation', () => ({
    usePreventRemove: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ bottom: 24 }),
}));
jest.mock('@/repositories/reminderRestore.repository', () => ({
    getReminderRestorePreview: jest.fn(),
    restoreReminderNotifications: jest.fn(),
}));
beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getReminderRestorePreview).mockResolvedValue({
        eligible: 2,
        alreadyVisible: 1,
        pending: 1,
        unverified: 3,
    });
    jest.mocked(restoreReminderNotifications).mockResolvedValue({
        eligible: 2,
        alreadyVisible: 1,
        pending: 1,
        unverified: 3,
        restored: 2,
        failed: 0,
    });
});
afterEach(() => {
    jest.restoreAllMocks();
});
test('preview explains older unverifiable reminders and never posts cards automatically', async () => {
    await render(<RestoreRemindersScreen />);
    expect(screen.getByText('2 eligible to restore')).toBeTruthy();
    expect(
        screen.getByText(/3 past reminders could not be verified/),
    ).toBeTruthy();
    expect(restoreReminderNotifications).not.toHaveBeenCalled();
});
test('asks before restoring and displays a result after the explicit action', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<RestoreRemindersScreen />);
    await fireEvent.press(
        screen.getByRole('button', { name: 'Restore reminder notifications' }),
    );
    expect(restoreReminderNotifications).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][1]).toContain('without sound');
    await act(async () => {
        alert.mock.calls[0][2]![1].onPress?.();
    });
    expect(restoreReminderNotifications).toHaveBeenCalledTimes(1);
    expect(
        screen.getByText('2 reminder notifications sent back to the shade.'),
    ).toBeTruthy();
});
test('zero eligible cards disables restore but permits another check', async () => {
    jest.mocked(getReminderRestorePreview).mockResolvedValue({
        eligible: 0,
        alreadyVisible: 2,
        pending: 0,
        unverified: 1,
    });
    await render(<RestoreRemindersScreen />);
    expect(
        screen.getByRole('button', { name: 'Restore reminder notifications' })
            .props.accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.press(screen.getByText('Check again'));
    expect(getReminderRestorePreview).toHaveBeenCalledTimes(2);
    expect(restoreReminderNotifications).not.toHaveBeenCalled();
});
test('old native builds and failed native calls provide a visible error and retry', async () => {
    jest.mocked(getReminderRestorePreview).mockRejectedValueOnce(
        new Error(
            'Rebuild TodoApp to enable restoring reminder notifications.',
        ),
    );
    await render(<RestoreRemindersScreen />);
    expect(screen.getByText(/Rebuild TodoApp/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Check again'));
    expect(screen.getByText('2 eligible to restore')).toBeTruthy();
});
test('partial restoration reports the failed count without pretending all cards succeeded', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(restoreReminderNotifications).mockResolvedValue({
        eligible: 2,
        alreadyVisible: 0,
        pending: 0,
        unverified: 0,
        restored: 1,
        failed: 1,
    });
    await render(<RestoreRemindersScreen />);
    await fireEvent.press(
        screen.getByRole('button', { name: 'Restore reminder notifications' }),
    );
    await act(async () => {
        alert.mock.calls[0][2]![1].onPress?.();
    });
    expect(
        screen.getByText(
            /1 reminder notification sent back to the shade. 1 could not be restored/,
        ),
    ).toBeTruthy();
});
