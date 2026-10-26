import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import BackupScreen from '@/app/backup';
import { createBackup, restoreBackup } from '@/repositories/backup.repository';
import {
    BackupDestinationError,
    chooseBackupFolder,
    getBackupFolder,
    pickBackupFile,
    saveBackupFile,
} from '@/services/backupFiles';
import { parseBackup } from '@/services/todoBackupFormat';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('expo-router/react-navigation', () => ({
    usePreventRemove: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ bottom: 24 }),
}));
jest.mock('@/repositories/backup.repository', () => ({
    createBackup: jest.fn(),
    restoreBackup: jest.fn(),
}));
jest.mock('@/services/backupFiles', () => ({
    BackupDestinationError: class extends Error {},
    backupFolderLabel: (uri: string) =>
        uri === 'content://folder' ? 'TodoApp Backups' : 'Other backups',
    chooseBackupFolder: jest.fn(),
    getBackupFolder: jest.fn(),
    pickBackupFile: jest.fn(),
    saveBackupFile: jest.fn(),
}));
const backup = parseBackup(
    JSON.stringify({
        format: 'todoapp-backup',
        version: 1,
        exportedAt: '2030-01-01T12:00:00.000Z',
        todos: [],
        todoTypes: [],
        categories: [],
    }),
);
beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getBackupFolder).mockResolvedValue(null);
    jest.mocked(chooseBackupFolder).mockResolvedValue('content://folder');
    jest.mocked(createBackup).mockResolvedValue(backup);
    jest.mocked(saveBackupFile).mockResolvedValue('backup.json');
    jest.mocked(pickBackupFile).mockResolvedValue({
        name: 'backup.json',
        backup,
    });
    jest.mocked(restoreBackup).mockResolvedValue({ added: 2, skipped: 1 });
});
afterEach(() => {
    jest.restoreAllMocks();
});
test('shows preview and restores only after explicit confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<BackupScreen />);
    await fireEvent.press(screen.getByText('Choose backup file'));
    expect(screen.getByText('Backup preview')).toBeTruthy();
    expect(restoreBackup).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Restore missing todos'));
    expect(restoreBackup).not.toHaveBeenCalled();
    const buttons = alert.mock.calls.at(-1)![2]!;
    expect(buttons[0].text).toBe('Cancel');
    await act(async () => {
        buttons[1].onPress?.();
    });
    expect(restoreBackup).toHaveBeenCalledWith(backup);
    expect(screen.queryByText('Backup preview')).toBeNull();
    expect(screen.getByText(/Restore complete: 2 added/)).toBeTruthy();
});
test('failed restore retains preview for retry', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(restoreBackup).mockRejectedValueOnce(new Error('Storage full'));
    await render(<BackupScreen />);
    await fireEvent.press(screen.getByText('Choose backup file'));
    await fireEvent.press(screen.getByText('Restore missing todos'));
    await act(async () => {
        alert.mock.calls.at(-1)![2]![1].onPress?.();
    });
    expect(screen.getByText('Backup preview')).toBeTruthy();
    expect(alert).toHaveBeenLastCalledWith('Unable to finish', 'Storage full');
});
test('cancel selection and invalid files never start restoring', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(pickBackupFile)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Invalid backup'));
    await render(<BackupScreen />);
    await fireEvent.press(screen.getByText('Choose backup file'));
    expect(screen.queryByText('Backup preview')).toBeNull();
    await fireEvent.press(screen.getByText('Choose backup file'));
    expect(alert).toHaveBeenCalledWith('Unable to finish', 'Invalid backup');
    expect(restoreBackup).not.toHaveBeenCalled();
});
test('canceled save reports no success, successful save does', async () => {
    jest.mocked(saveBackupFile)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('backup.json');
    await render(<BackupScreen />);
    await fireEvent.press(screen.getByText('Save backup'));
    expect(screen.queryByText(/Backup saved:/)).toBeNull();
    await fireEvent.press(screen.getByText('Save backup'));
    expect(screen.getByText('Backup saved: backup.json')).toBeTruthy();
});

test('explains first-time folder selection before opening Android picker', async () => {
    await render(<BackupScreen />);
    expect(screen.getByText(/For your first backup/)).toBeTruthy();
    expect(screen.queryByText('Change backup folder')).toBeNull();
    expect(chooseBackupFolder).not.toHaveBeenCalled();
    expect(saveBackupFile).not.toHaveBeenCalled();
});
test('shows the remembered destination and saves with one tap', async () => {
    jest.mocked(getBackupFolder).mockResolvedValue('content://folder');
    await render(<BackupScreen />);
    expect(screen.getByText('Backup folder: TodoApp Backups')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save backup'));
    expect(saveBackupFile).toHaveBeenCalledTimes(1);
    expect(chooseBackupFolder).not.toHaveBeenCalled();
});
test('changing folder updates the destination without saving a new backup', async () => {
    jest.mocked(getBackupFolder).mockResolvedValue('content://folder');
    jest.mocked(chooseBackupFolder).mockImplementationOnce(async () => {
        jest.mocked(getBackupFolder).mockResolvedValue('content://other');
        return 'content://other';
    });
    await render(<BackupScreen />);
    await fireEvent.press(screen.getByText('Change backup folder'));
    expect(screen.getByText('Backup folder: Other backups')).toBeTruthy();
    expect(saveBackupFile).not.toHaveBeenCalled();
    expect(createBackup).not.toHaveBeenCalled();
});
test('canceling a folder change keeps the old destination', async () => {
    jest.mocked(getBackupFolder).mockResolvedValue('content://folder');
    jest.mocked(chooseBackupFolder).mockResolvedValueOnce(null);
    await render(<BackupScreen />);
    await fireEvent.press(screen.getByText('Change backup folder'));
    expect(screen.getByText('Backup folder: TodoApp Backups')).toBeTruthy();
    expect(screen.queryByText(/Backup folder changed/)).toBeNull();
    expect(saveBackupFile).not.toHaveBeenCalled();
});
test('a failed destination offers selection and then retries saving', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(getBackupFolder).mockResolvedValue('content://unavailable');
    jest.mocked(saveBackupFile)
        .mockRejectedValueOnce(new BackupDestinationError('Folder unavailable'))
        .mockResolvedValueOnce('recovered.json');
    await render(<BackupScreen />);
    await fireEvent.press(screen.getByText('Save backup'));
    expect(alert.mock.calls.at(-1)![0]).toBe('Unable to save backup');
    expect(screen.queryByText(/Backup saved:/)).toBeNull();
    await act(async () => {
        alert.mock.calls.at(-1)![2]![1].onPress?.();
    });
    expect(chooseBackupFolder).toHaveBeenCalledTimes(1);
    expect(saveBackupFile).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Backup saved: recovered.json')).toBeTruthy();
});
test('canceling recovery does not retry or claim the backup was saved', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(saveBackupFile).mockRejectedValueOnce(
        new BackupDestinationError('Folder unavailable'),
    );
    jest.mocked(chooseBackupFolder).mockResolvedValueOnce(null);
    await render(<BackupScreen />);
    await fireEvent.press(screen.getByText('Save backup'));
    await act(async () => {
        alert.mock.calls.at(-1)![2]![1].onPress?.();
    });
    expect(saveBackupFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Backup saved:/)).toBeNull();
});
test('failed settings load can be retried before saving', async () => {
    jest.mocked(getBackupFolder)
        .mockRejectedValueOnce(new Error('Storage unavailable'))
        .mockResolvedValue('content://folder');
    await render(<BackupScreen />);
    expect(
        screen.getByText('Save backup').parent!.props.accessibilityState
            .disabled,
    ).toBe(true);
    await fireEvent.press(screen.getByText('Retry loading folder'));
    expect(screen.getByText('Backup folder: TodoApp Backups')).toBeTruthy();
});
