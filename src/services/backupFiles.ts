import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { StorageAccessFramework, deleteAsync } from 'expo-file-system/legacy';

import {
    MAX_BACKUP_BYTES,
    parseBackup,
    type TodoBackup,
} from './todoBackupFormat';

export async function saveBackupFile(
    backup: TodoBackup,
): Promise<string | null> {
    const text = JSON.stringify(backup, null, 2);
    if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
        throw new Error('This backup exceeds the current 20 MB file limit.');
    }
    const permission =
        await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return null;
    const name = `TodoApp-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const uri = await StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        name,
        'application/json',
    );
    try {
        await StorageAccessFramework.writeAsStringAsync(uri, text);
    } catch (error) {
        await deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        throw error;
    }
    return `${name}.json`;
}

export async function pickBackupFile(): Promise<{
    name: string;
    backup: TodoBackup;
} | null> {
    const result = await DocumentPicker.getDocumentAsync({
        // Some Android providers label JSON as text/plain or application/octet-stream.
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    const file = new File(asset.uri);
    try {
        if ((asset.size ?? file.size) > MAX_BACKUP_BYTES)
            throw new Error('Choose a TodoApp backup smaller than 20 MB.');
        return { name: asset.name, backup: parseBackup(await file.text()) };
    } finally {
        // Only the temporary picker copy is removed, never the original backup.
        await deleteAsync(asset.uri, { idempotent: true }).catch(
            () => undefined,
        );
    }
}
