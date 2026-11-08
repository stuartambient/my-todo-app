import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import {
    UtilityButton,
    UtilityCard,
    UtilityNotice,
    UtilityScreen,
    utilityStyles,
} from '@/components/UtilityScreen';
import { homeColors } from '@/theme/homeColors';
import { createBackup, restoreBackup } from '@/repositories/backup.repository';
import {
    backupFolderLabel,
    BackupDestinationError,
    chooseBackupFolder,
    getBackupFolder,
    pickBackupFile,
    saveBackupFile,
} from '@/services/backupFiles';
import type { TodoBackup } from '@/services/todoBackupFormat';

type Selection = { name: string; backup: TodoBackup };

export default function BackupScreen() {
    const [selection, setSelection] = useState<Selection | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [messageSection, setMessageSection] = useState<'save' | 'restore'>(
        'save',
    );
    const busyRef = useRef(false);
    const mounted = useRef(true);
    const folderRequest = useRef(0);
    const [folder, setFolder] = useState<string | null>(null);
    const [folderReady, setFolderReady] = useState(false);
    const [folderError, setFolderError] = useState(false);
    const loadFolder = useCallback(() => {
        const request = ++folderRequest.current;
        return getBackupFolder()
            .then((saved) => {
                if (mounted.current && request === folderRequest.current) {
                    setFolder(saved);
                    setFolderError(false);
                }
            })
            .catch(() => {
                if (mounted.current && request === folderRequest.current)
                    setFolderError(true);
            })
            .finally(() => {
                if (mounted.current && request === folderRequest.current)
                    setFolderReady(true);
            });
    }, []);
    useEffect(() => {
        mounted.current = true;
        void loadFolder();
        return () => {
            mounted.current = false;
        };
    }, [loadFolder]);
    usePreventRemove(busy, () => {});

    async function run(
        operation: () => Promise<void>,
        failureTitle = 'Unable to finish',
    ) {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setMessage('');
        try {
            await operation();
        } catch (error) {
            if (error instanceof BackupDestinationError) {
                Alert.alert('Unable to save backup', error.message, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Choose folder',
                        onPress: () =>
                            void run(async () => {
                                if (await chooseBackupFolder())
                                    await saveCurrentBackup();
                            }, 'Unable to save backup'),
                    },
                ]);
                return;
            }
            Alert.alert(
                failureTitle,
                error instanceof Error ? error.message : 'Please try again.',
            );
        } finally {
            await loadFolder();
            busyRef.current = false;
            setBusy(false);
        }
    }

    async function saveCurrentBackup() {
        const name = await saveBackupFile(await createBackup());
        if (name) {
            setMessageSection('save');
            setMessage(`Backup saved: ${name}`);
        }
    }

    function confirmRestore() {
        if (!selection || busyRef.current) return;
        const backup = selection.backup;
        Alert.alert(
            'Restore missing todos?',
            'Existing todos will be kept as they are. Future reminders for restored open todos will be scheduled; past reminders will not sound again.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Restore',
                    onPress: () =>
                        void run(async () => {
                            const result = await restoreBackup(backup);
                            setSelection(null);
                            setMessageSection('restore');
                            setMessage(
                                `Restore complete: ${result.added} added, ${result.skipped} already present or repeat conflicts skipped.`,
                            );
                        }, 'Unable to restore backup'),
                },
            ],
        );
    }

    return (
        <UtilityScreen
            title="Backup & restore"
            heading="Keep your todos safe"
            description="Save a copy of your todos, or bring missing ones back from a backup."
            busy={busy}
        >
            <UtilityCard
                title="Save a backup"
                icon="backup"
                description="Includes open and completed todos, notes, dates, reminders, and repeat settings."
            >
                <View style={utilityStyles.notice}>
                    {!folderReady ? (
                        <Text style={utilityStyles.hint}>
                            Loading backup folder…
                        </Text>
                    ) : folderError ? (
                        <>
                            <Text style={utilityStyles.hint}>
                                Unable to load your backup folder. Please try
                                again.
                            </Text>
                            <UtilityButton
                                title="Retry loading folder"
                                secondary
                                disabled={busy}
                                onPress={() => {
                                    setFolderReady(false);
                                    void loadFolder();
                                }}
                            />
                        </>
                    ) : folder ? (
                        <>
                            <Text style={utilityStyles.noticeText}>
                                Backup folder: {backupFolderLabel(folder)}
                            </Text>
                            <Text style={utilityStyles.hint}>
                                Save backup creates a new file in this folder.
                            </Text>
                        </>
                    ) : (
                        <Text style={utilityStyles.hint}>
                            For your first backup, choose or create a folder
                            named “TodoApp Backups”, then tap “Use this folder”
                            and allow access. If Android says “Can’t use this
                            folder”, create a new folder and open it. TodoApp
                            remembers your choice for later backups.
                        </Text>
                    )}
                </View>
                <UtilityButton
                    title="Save backup"
                    disabled={busy || !folderReady || folderError}
                    onPress={() =>
                        void run(saveCurrentBackup, 'Unable to save backup')
                    }
                />
                {folderReady && !folderError && folder && (
                    <UtilityButton
                        title="Change backup folder"
                        secondary
                        disabled={busy}
                        onPress={() =>
                            void run(async () => {
                                if (await chooseBackupFolder()) {
                                    setMessageSection('save');
                                    setMessage(
                                        'Backup folder changed. Your existing backup files stay where they are.',
                                    );
                                }
                            }, 'Unable to change backup folder')
                        }
                    />
                )}
                {message !== '' && messageSection === 'save' && (
                    <UtilityNotice>{message}</UtilityNotice>
                )}
            </UtilityCard>

            <UtilityCard
                title="Restore from a backup"
                icon="restore"
                description="Adds missing todos and keeps your current todos and edits unchanged. Todos deleted since the backup will be added back."
            >
                <UtilityButton
                    title="Choose backup file"
                    secondary
                    disabled={busy}
                    onPress={() =>
                        void run(async () => {
                            setSelection(null);
                            const chosen = await pickBackupFile();
                            if (chosen) setSelection(chosen);
                        }, 'Unable to open backup')
                    }
                />
                {selection && (
                    <View style={[utilityStyles.notice, { gap: 10 }]}>
                        <Text
                            style={utilityStyles.cardTitle}
                            accessibilityRole="header"
                        >
                            Backup preview
                        </Text>
                        <Text style={utilityStyles.body}>{selection.name}</Text>
                        <Text style={utilityStyles.hint}>
                            Created{' '}
                            {new Date(
                                selection.backup.exportedAt,
                            ).toLocaleString()}
                        </Text>
                        <Text style={utilityStyles.noticeText}>
                            {
                                selection.backup.todos.filter(
                                    (todo) => todo.status === 'open',
                                ).length
                            }{' '}
                            open ·{' '}
                            {
                                selection.backup.todos.filter(
                                    (todo) => todo.status === 'completed',
                                ).length
                            }{' '}
                            completed
                        </Text>
                        <UtilityButton
                            title="Restore missing todos"
                            disabled={busy}
                            onPress={confirmRestore}
                        />
                        <UtilityButton
                            title="Cancel"
                            secondary
                            disabled={busy}
                            onPress={() => setSelection(null)}
                        />
                    </View>
                )}
                {message !== '' && messageSection === 'restore' && (
                    <UtilityNotice>{message}</UtilityNotice>
                )}
            </UtilityCard>
            {busy && (
                <View style={{ alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color={homeColors.accent} />
                    <Text
                        style={utilityStyles.body}
                        accessibilityLiveRegion="polite"
                    >
                        Working…
                    </Text>
                </View>
            )}
            <Text style={utilityStyles.hint}>
                Keep another copy on your computer or in cloud storage in case
                your phone is lost. Backup files are plain text and include your
                notes.
            </Text>
        </UtilityScreen>
    );
}
