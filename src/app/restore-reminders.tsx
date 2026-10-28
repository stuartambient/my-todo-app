import { Stack } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    getReminderRestorePreview,
    restoreReminderNotifications,
    type ReminderRestorePreview,
} from '@/repositories/reminderRestore.repository';

export default function RestoreRemindersScreen() {
    const [preview, setPreview] = useState<ReminderRestorePreview | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState('');
    const working = useRef(false);
    const mounted = useRef(true);
    const insets = useSafeAreaInsets();
    usePreventRemove(busy, () => {});

    useEffect(() => {
        mounted.current = true;
        getReminderRestorePreview()
            .then((value) => {
                if (mounted.current) setPreview(value);
            })
            .catch((failure) => {
                if (mounted.current)
                    setError(
                        failure instanceof Error
                            ? failure.message
                            : 'Unable to check reminders.',
                    );
            });
        return () => {
            mounted.current = false;
        };
    }, []);

    async function run(operation: () => Promise<void>) {
        if (working.current) return;
        working.current = true;
        setBusy(true);
        setError('');
        setResult('');
        try {
            await operation();
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Unable to restore reminders.',
            );
        } finally {
            working.current = false;
            setBusy(false);
        }
    }
    function confirm() {
        if (!preview?.eligible || working.current) return;
        Alert.alert(
            'Restore reminder notifications?',
            `Up to ${preview.eligible} reminder cards will return to the notification shade without sound. This includes cards you may have swiped away.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Restore',
                    onPress: () =>
                        void run(async () => {
                            const restored =
                                await restoreReminderNotifications();
                            setResult(
                                `${restored.restored} reminder notification${restored.restored === 1 ? '' : 's'} sent back to the shade.${restored.failed ? ` ${restored.failed} could not be restored. Check notification settings and try again.` : ''}`,
                            );
                            // Immediate Android presentation is asynchronous. The next check
                            // queries the actual shade rather than assuming delivery.
                            setPreview(null);
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
                options={{ title: 'Restore reminders', gestureEnabled: !busy }}
            />
            <Text style={styles.heading} accessibilityRole="header">
                Restore reminder notifications
            </Text>
            <Text style={styles.body}>
                Bring previously delivered TodoApp reminders back to the
                notification shade, with Complete and Snooze buttons.
            </Text>
            <Text style={styles.body}>
                Only open todos with the same reminder time qualify. Cards
                already in the shade and reminders still waiting to arrive are
                skipped. Restoring does not change your todos or reminder times.
            </Text>
            <Text style={styles.hint}>
                This feature starts remembering deliveries after this update and
                can recognize cards still in the shade. Older cards that were
                already cleared may not be recoverable.
            </Text>
            {preview && (
                <>
                    <Text style={styles.count} accessibilityLiveRegion="polite">
                        {preview.eligible} eligible to restore
                    </Text>
                    <Text style={styles.body}>
                        {preview.alreadyVisible} already in the shade ·{' '}
                        {preview.pending} still pending
                    </Text>
                    {preview.unverified > 0 && (
                        <Text style={styles.hint}>
                            {preview.unverified} past reminder
                            {preview.unverified === 1 ? '' : 's'} could not be
                            verified as previously delivered and will be left
                            unchanged.
                        </Text>
                    )}
                </>
            )}
            {error !== '' && (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                    {error}
                </Text>
            )}
            {result !== '' && (
                <Text style={styles.body} accessibilityLiveRegion="polite">
                    {result}
                </Text>
            )}
            {(busy || (!preview && !error && !result)) && (
                <ActivityIndicator style={styles.progress} />
            )}
            <Pressable
                accessibilityRole="button"
                disabled={busy || !preview?.eligible || error !== ''}
                accessibilityState={{
                    disabled: busy || !preview?.eligible || error !== '',
                }}
                style={[
                    styles.button,
                    (busy || !preview?.eligible || error !== '') &&
                        styles.disabled,
                ]}
                onPress={confirm}
            >
                <Text style={styles.buttonText}>
                    Restore reminder notifications
                </Text>
            </Pressable>
            <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={styles.secondary}
                onPress={() =>
                    void run(async () => {
                        setPreview(await getReminderRestorePreview());
                    })
                }
            >
                <Text style={styles.secondaryText}>Check again</Text>
            </Pressable>
        </ScrollView>
    );
}
const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#ffffff' },
    content: { padding: 20 },
    heading: { fontSize: 20, fontWeight: '600', color: '#222222' },
    body: { fontSize: 15, lineHeight: 23, color: '#555555', marginTop: 12 },
    hint: { fontSize: 13, lineHeight: 20, color: '#666666', marginTop: 12 },
    count: { fontSize: 18, fontWeight: '600', color: '#222222', marginTop: 24 },
    error: { color: '#b00020', fontSize: 15, lineHeight: 23, marginTop: 16 },
    button: {
        backgroundColor: '#222222',
        borderRadius: 8,
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        marginTop: 24,
    },
    buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
    secondary: {
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    secondaryText: { color: '#222222', fontSize: 16, fontWeight: '600' },
    disabled: { opacity: 0.5 },
    progress: { marginTop: 16 },
});
