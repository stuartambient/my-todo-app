import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import { StorageAccessFramework, deleteAsync } from 'expo-file-system/legacy';

import {
    MAX_BACKUP_BYTES,
    parseBackup,
    type TodoBackup,
} from './todoBackupFormat';

const BACKUP_FOLDER_KEY = 'backup-folder-uri-v1';

// Device-specific permission: never include this URI in a portable todo backup.
export function getBackupFolder(): Promise<string | null> {
    return Storage.getItemAsync(BACKUP_FOLDER_KEY);
}

export async function chooseBackupFolder(): Promise<string | null> {
    const previous = await getBackupFolder();
    const permission =
        await StorageAccessFramework.requestDirectoryPermissionsAsync(previous);
    if (!permission.granted) return null;
    await Storage.setItemAsync(BACKUP_FOLDER_KEY, permission.directoryUri);
    return permission.directoryUri;
}

export function backupFolderLabel(uri: string): string {
    // Local Android document-tree IDs contain a storage volume and relative path.
    // Other providers can use opaque IDs, so don't display their internal URIs.
    try {
        if (!uri.startsWith('content://com.android.externalstorage.documents/'))
            return 'Selected backup folder';
        const tree = uri.match(/\/tree\/([^/]+)/)?.[1];
        const decoded = tree ? decodeURIComponent(tree) : '';
        const path = decoded.match(/^(?:primary|[a-f0-9-]+):(.+)$/i)?.[1];
        return path || 'Selected backup folder';
    } catch {
        return 'Selected backup folder';
    }
}

export class BackupDestinationError extends Error {
    constructor(cause: unknown) {
        super(
            'The backup could not be saved. Check the folder is available and has free space, or choose another folder.',
            { cause },
        );
        this.name = 'BackupDestinationError';
    }
}

export async function saveBackupFile(
    backup: TodoBackup,
): Promise<string | null> {
    const text = JSON.stringify(backup, null, 2);
    if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
        throw new Error('This backup exceeds the current 20 MB file limit.');
    }
    const folder = (await getBackupFolder()) ?? (await chooseBackupFolder());
    if (folder === null) return null;
    const name = `TodoApp-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    let uri: string | undefined;
    try {
        uri = await StorageAccessFramework.createFileAsync(
            folder,
            name,
            'application/json',
        );
        await StorageAccessFramework.writeAsStringAsync(uri, text);
    } catch (error) {
        if (uri)
            await deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        // Don't discard the remembered folder or assume that every failure is
        // lost permission: a provider can be offline or storage can be full.
        throw new BackupDestinationError(error);
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
