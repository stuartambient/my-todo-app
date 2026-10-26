import { Stack } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createBackup, restoreBackup } from '@/repositories/backup.repository';
import { pickBackupFile, saveBackupFile } from '@/services/backupFiles';
import type { TodoBackup } from '@/services/todoBackupFormat';

type Selection = { name: string; backup: TodoBackup };

export default function BackupScreen() {
    const [selection, setSelection] = useState<Selection | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const busyRef = useRef(false);
    const insets = useSafeAreaInsets();
    usePreventRemove(busy, () => {});

    async function run(operation: () => Promise<void>) {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setMessage('');
        try {
            await operation();
        } catch (error) {
            Alert.alert(
                'Unable to finish',
                error instanceof Error ? error.message : 'Please try again.',
            );
        } finally {
            busyRef.current = false;
            setBusy(false);
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
                            setMessage(
                                `Restore complete: ${result.added} added, ${result.skipped} already present or repeat conflicts skipped.`,
                            );
                        }),
                },
            ],
        );
    }

    return (
        <ScrollView
            style={styles.screen}
            contentContainerStyle={[
                styles.content,
                { paddingBottom: insets.bottom + 24 },
            ]}
        >
            <Stack.Screen
                options={{ title: 'Backup & restore', gestureEnabled: !busy }}
            />
            <Text style={styles.heading} accessibilityRole="header">
                Keep a copy of your todos
            </Text>
            <Text style={styles.description}>
                Backups include open and completed todos, notes, dates,
                reminders, and repeat settings.
            </Text>
            <Text style={styles.description}>
                Save the file in a folder outside TodoApp. Copy it to your
                computer or cloud storage to keep it safe if your phone is lost.
                Backups are plain text and include your notes.
            </Text>
            <Pressable
                accessibilityRole="button"
                disabled={busy}
                accessibilityState={{ disabled: busy }}
                style={[styles.button, busy && styles.disabled]}
                onPress={() =>
                    void run(async () => {
                        const name = await saveBackupFile(await createBackup());
                        if (name) setMessage(`Backup saved: ${name}`);
                    })
                }
            >
                <Text style={styles.buttonText}>Save backup</Text>
            </Pressable>
            <Text style={styles.hint}>
                Choose or create a folder in the Android file picker, then tap
                “Use this folder”.
            </Text>

            <View style={styles.section}>
                <Text style={styles.heading} accessibilityRole="header">
                    Restore from a backup
                </Text>
                <Text style={styles.description}>
                    Choose a TodoApp backup file to preview it. Restore adds
                    missing todos and keeps existing ones unchanged. Existing
                    edits are preserved. Todos deleted since the backup will be
                    added back.
                </Text>
                <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    accessibilityState={{ disabled: busy }}
                    style={[styles.secondaryButton, busy && styles.disabled]}
                    onPress={() =>
                        void run(async () => {
                            setSelection(null);
                            const chosen = await pickBackupFile();
                            if (chosen) setSelection(chosen);
                        })
                    }
                >
                    <Text style={styles.secondaryText}>Choose backup file</Text>
                </Pressable>
            </View>
            {selection && (
                <View style={styles.preview}>
                    <Text
                        style={styles.previewTitle}
                        accessibilityRole="header"
                    >
                        Backup preview
                    </Text>
                    <Text style={styles.description}>{selection.name}</Text>
                    <Text style={styles.description}>
                        Created{' '}
                        {new Date(selection.backup.exportedAt).toLocaleString()}
                    </Text>
                    <Text style={styles.description}>
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
                    <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        accessibilityState={{ disabled: busy }}
                        style={[styles.button, busy && styles.disabled]}
                        onPress={confirmRestore}
                    >
                        <Text style={styles.buttonText}>
                            Restore missing todos
                        </Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        style={styles.cancelButton}
                        onPress={() => setSelection(null)}
                    >
                        <Text style={styles.secondaryText}>Cancel</Text>
                    </Pressable>
                </View>
            )}
            {busy && (
                <View style={styles.progress}>
                    <ActivityIndicator />
                    <Text style={styles.description}>Working…</Text>
                </View>
            )}
            {message !== '' && (
                <Text style={styles.message} accessibilityLiveRegion="polite">
                    {message}
                </Text>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#ffffff' },
    content: { padding: 20 },
    heading: { fontSize: 20, fontWeight: '600', color: '#222222' },
    description: {
        fontSize: 15,
        color: '#555555',
        lineHeight: 23,
        marginTop: 10,
    },
    hint: { fontSize: 13, color: '#666666', lineHeight: 20, marginTop: 10 },
    button: {
        backgroundColor: '#222222',
        borderRadius: 8,
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        marginTop: 16,
    },
    buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
    secondaryButton: {
        borderColor: '#555555',
        borderWidth: 1,
        borderRadius: 8,
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        marginTop: 16,
    },
    secondaryText: { color: '#222222', fontSize: 16, fontWeight: '600' },
    section: { marginTop: 32 },
    preview: {
        marginTop: 24,
        padding: 16,
        backgroundColor: '#f4f4f4',
        borderRadius: 10,
    },
    previewTitle: { fontSize: 17, fontWeight: '600', color: '#222222' },
    cancelButton: {
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    disabled: { opacity: 0.5 },
    progress: { marginTop: 20, alignItems: 'center' },
    message: { marginTop: 20, color: '#222222', fontSize: 15, lineHeight: 23 },
});
