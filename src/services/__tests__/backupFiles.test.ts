import { beforeEach, expect, jest, test } from '@jest/globals';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import {
    StorageAccessFramework as saf,
    deleteAsync,
} from 'expo-file-system/legacy';
import {
    backupFolderLabel,
    BackupDestinationError,
    chooseBackupFolder,
    getBackupFolder,
    pickBackupFile,
    saveBackupFile,
} from '../backupFiles';
import { parseBackup } from '../todoBackupFormat';

jest.mock('expo-sqlite/kv-store', () => ({
    __esModule: true,
    default: { getItemAsync: jest.fn(), setItemAsync: jest.fn() },
}));
let rememberedFolder: string | null = null;
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
    deleteAsync: jest.fn(),
    StorageAccessFramework: {
        requestDirectoryPermissionsAsync: jest.fn(),
        createFileAsync: jest.fn(),
        writeAsStringAsync: jest.fn(),
    },
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
const file = { size: 100, text: jest.fn<() => Promise<string>>() };
beforeEach(() => {
    jest.clearAllMocks();
    rememberedFolder = null;
    jest.mocked(Storage.getItemAsync).mockImplementation(
        async () => rememberedFolder,
    );
    jest.mocked(Storage.setItemAsync).mockImplementation(async (_, value) => {
        rememberedFolder = value as string;
    });
    jest.mocked(saf.requestDirectoryPermissionsAsync).mockResolvedValue({
        granted: true,
        directoryUri: 'content://folder',
    });
    jest.mocked(saf.createFileAsync).mockResolvedValue('content://backup');
    jest.mocked(saf.writeAsStringAsync).mockResolvedValue(undefined);
    jest.mocked(deleteAsync).mockResolvedValue(undefined);
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
        canceled: false,
        assets: [
            {
                name: 'copy.json',
                lastModified: 0,
                uri: 'file:///cache/copy.json',
                size: 100,
            },
        ],
    });
    jest.mocked(File).mockImplementation(() => file as never);
    file.text.mockResolvedValue(JSON.stringify(backup));
});
test('save waits for the external file write and gives SAF a filename without its extension', async () => {
    expect(await saveBackupFile(backup)).toMatch(/^TodoApp-backup-.*\.json$/);
    expect(saf.createFileAsync).toHaveBeenCalledWith(
        'content://folder',
        expect.not.stringMatching(/\.json$/),
        'application/json',
    );
    expect(saf.writeAsStringAsync).toHaveBeenCalledWith(
        'content://backup',
        JSON.stringify(backup, null, 2),
    );
});
test('canceling the destination creates no file', async () => {
    jest.mocked(saf.requestDirectoryPermissionsAsync).mockResolvedValue({
        granted: false,
    });
    expect(await saveBackupFile(backup)).toBeNull();
    expect(saf.createFileAsync).not.toHaveBeenCalled();
});
test('failed save reports failure and removes an incomplete file', async () => {
    jest.mocked(saf.writeAsStringAsync).mockRejectedValue(
        new Error('Storage full'),
    );
    await expect(saveBackupFile(backup)).rejects.toBeInstanceOf(
        BackupDestinationError,
    );
    expect(deleteAsync).toHaveBeenCalledWith('content://backup', {
        idempotent: true,
    });
});
test('canceling file selection is harmless', async () => {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
        canceled: true,
        assets: null,
    });
    expect(await pickBackupFile()).toBeNull();
    expect(File).not.toHaveBeenCalled();
});
test('picker reads a cached copy and removes that copy after validation', async () => {
    expect(await pickBackupFile()).toEqual({
        name: 'copy.json',
        backup,
    });
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({
        type: '*/*',
        multiple: false,
        copyToCacheDirectory: true,
    });
    expect(deleteAsync).toHaveBeenCalledWith('file:///cache/copy.json', {
        idempotent: true,
    });
});
test('invalid JSON does not leave a cached copy', async () => {
    file.text.mockResolvedValue('broken');
    await expect(pickBackupFile()).rejects.toThrow('not valid JSON');
    expect(deleteAsync).toHaveBeenCalled();
});
test('oversized file is rejected before reading its contents', async () => {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
        canceled: false,
        assets: [
            {
                name: 'large.json',
                lastModified: 0,
                uri: 'file:///cache/large.json',
                size: 21 * 1024 * 1024,
            },
        ],
    });
    await expect(pickBackupFile()).rejects.toThrow('smaller than 20 MB');
    expect(file.text).not.toHaveBeenCalled();
    expect(deleteAsync).toHaveBeenCalled();
});

test('remembers the granted folder and later saves do not open a picker', async () => {
    await saveBackupFile(backup);
    expect(await getBackupFolder()).toBe('content://folder');
    await saveBackupFile(backup);
    expect(saf.requestDirectoryPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Storage.setItemAsync).toHaveBeenCalledTimes(1);
    expect(saf.createFileAsync).toHaveBeenCalledTimes(2);
});
test('uses a folder loaded from storage without requiring a new grant', async () => {
    rememberedFolder = 'content://from-previous-session';
    await saveBackupFile(backup);
    expect(saf.requestDirectoryPermissionsAsync).not.toHaveBeenCalled();
    expect(saf.createFileAsync).toHaveBeenCalledWith(
        rememberedFolder,
        expect.any(String),
        'application/json',
    );
});
test('canceling a folder change preserves the previous choice and writes no file', async () => {
    rememberedFolder = 'content://old-folder';
    jest.mocked(saf.requestDirectoryPermissionsAsync).mockResolvedValue({
        granted: false,
    });
    expect(await chooseBackupFolder()).toBeNull();
    expect(await getBackupFolder()).toBe('content://old-folder');
    expect(saf.requestDirectoryPermissionsAsync).toHaveBeenCalledWith(
        'content://old-folder',
    );
    expect(Storage.setItemAsync).not.toHaveBeenCalled();
    expect(saf.createFileAsync).not.toHaveBeenCalled();
});
test('changing the destination persists the new folder without creating or moving files', async () => {
    rememberedFolder = 'content://old-folder';
    expect(await chooseBackupFolder()).toBe('content://folder');
    expect(await getBackupFolder()).toBe('content://folder');
    expect(saf.createFileAsync).not.toHaveBeenCalled();
    expect(deleteAsync).not.toHaveBeenCalled();
});
test('missing folder or lost access offers recovery without silently changing the destination', async () => {
    rememberedFolder = 'content://unavailable';
    jest.mocked(saf.createFileAsync).mockRejectedValueOnce(
        new Error('Permission denied'),
    );
    await expect(saveBackupFile(backup)).rejects.toBeInstanceOf(
        BackupDestinationError,
    );
    expect(await getBackupFolder()).toBe('content://unavailable');
    expect(saf.requestDirectoryPermissionsAsync).not.toHaveBeenCalled();
    expect(saf.writeAsStringAsync).not.toHaveBeenCalled();
});
test('failure to persist a grant does not report success or create a file', async () => {
    jest.mocked(Storage.setItemAsync).mockRejectedValueOnce(
        new Error('Settings storage unavailable'),
    );
    await expect(saveBackupFile(backup)).rejects.toThrow(
        'Settings storage unavailable',
    );
    expect(saf.createFileAsync).not.toHaveBeenCalled();
});
test('folder label is readable without exposing opaque provider IDs', () => {
    expect(
        backupFolderLabel(
            'content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FTodoApp%20Backups',
        ),
    ).toBe('Documents/TodoApp Backups');
    expect(backupFolderLabel('content://cloud.provider/tree/opaque-id')).toBe(
        'Selected backup folder',
    );
    expect(backupFolderLabel('content://provider/tree/%notvalid')).toBe(
        'Selected backup folder',
    );
});
