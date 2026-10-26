import { beforeEach, expect, jest, test } from '@jest/globals';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import {
    StorageAccessFramework as saf,
    deleteAsync,
} from 'expo-file-system/legacy';
import { pickBackupFile, saveBackupFile } from '../backupFiles';
import { parseBackup } from '../todoBackupFormat';

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
    await expect(saveBackupFile(backup)).rejects.toThrow('Storage full');
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
